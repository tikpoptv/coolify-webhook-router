package main

import (
	"context"
	"encoding/json"
	"log"
	"path"
	"strconv"
	"strings"
	"time"
)

// Event is a normalised Coolify webhook payload.
type Event struct {
	Name        string
	Message     string
	Success     bool
	Project     string
	Environment string
	Resource    string
	Raw         map[string]any
}

// Payload fields that name the resource, in order of preference.
var resourceNameKeys = []string{"application_name", "database_name", "resource_name", "task_name", "container_name", "server_name", "token_name"}

// Payload fields that carry a resource UUID we can resolve to a project.
var resourceUUIDKeys = []string{"application_uuid", "service_uuid", "database_uuid", "resource_uuid"}

func parseEvent(body []byte) (Event, error) {
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return Event{}, err
	}
	e := Event{
		Raw:         raw,
		Name:        field(raw, "event"),
		Message:     field(raw, "message"),
		Project:     field(raw, "project"),
		Environment: field(raw, "environment"),
	}
	e.Success, _ = raw["success"].(bool)
	for _, k := range resourceNameKeys {
		if v := field(raw, k); v != "" {
			e.Resource = v
			break
		}
	}
	return e, nil
}

func field(m map[string]any, k string) string {
	switch v := m[k].(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	}
	return ""
}

// Matches reports whether the rule applies to the event. Empty fields match anything;
// non-empty fields are case-insensitive glob patterns (e.g. "backup_*").
func (r Rule) Matches(e Event) bool {
	switch r.Status {
	case "success":
		if !e.Success {
			return false
		}
	case "failure":
		if e.Success {
			return false
		}
	}
	return glob(r.Project, e.Project) && glob(r.Environment, e.Environment) && glob(r.Event, e.Name)
}

func glob(pattern, value string) bool {
	if pattern == "" || pattern == "*" {
		return true
	}
	ok, err := path.Match(strings.ToLower(pattern), strings.ToLower(value))
	return err == nil && ok
}

// enrich fills Project/Environment from the Coolify API when the payload lacks them.
func (a *App) enrich(ctx context.Context, e *Event) {
	if e.Project != "" {
		return
	}
	for _, k := range resourceUUIDKeys {
		if loc, ok := a.resolver.Lookup(ctx, field(e.Raw, k)); ok {
			e.Project, e.Environment = loc.Project, loc.Environment
			return
		}
	}
}

// route returns every destination whose rule matches (deduplicated). When nothing
// matches, it falls back to the configured fallback destination.
func (a *App) route(e Event) (dests []Destination, usedFallback bool, err error) {
	rules, err := a.store.ListRules()
	if err != nil {
		return nil, false, err
	}
	seen := map[int64]bool{}
	var ids []int64
	for _, r := range rules {
		if r.Enabled && !seen[r.DestinationID] && r.Matches(e) {
			seen[r.DestinationID] = true
			ids = append(ids, r.DestinationID)
		}
	}
	if len(ids) == 0 {
		if fb := a.store.FallbackID(); fb > 0 {
			ids = []int64{fb}
			usedFallback = true
		}
	}
	for _, id := range ids {
		d, err := a.store.GetDestination(id)
		if err == nil {
			dests = append(dests, d)
		}
	}
	return dests, usedFallback, nil
}

func (a *App) worker() {
	for body := range a.queue {
		a.process(body)
	}
}

func (a *App) process(body []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	e, err := parseEvent(body)
	if err != nil {
		a.record(Event{Name: "(invalid)"}, "-", body, err)
		return
	}
	a.enrich(ctx, &e)

	dests, _, err := a.route(e)
	if err != nil {
		a.record(e, "-", body, err)
		return
	}
	if len(dests) == 0 {
		a.record(e, "-", body, errNoRoute)
		return
	}
	for _, d := range dests {
		a.record(e, d.Name, body, a.send(ctx, d, e))
	}
}

type routeError string

func (r routeError) Error() string { return string(r) }

// errNoRoute is stored in history verbatim; the UI translates it.
const errNoRoute = routeError("no matching rule and no fallback destination")

func (a *App) record(e Event, dest string, body []byte, err error) {
	d := Delivery{
		Time:        time.Now(),
		Event:       e.Name,
		Project:     e.Project,
		Environment: e.Environment,
		Resource:    e.Resource,
		Destination: dest,
		OK:          err == nil,
		Payload:     string(body),
	}
	if err != nil {
		d.Error = err.Error()
		log.Printf("event=%s project=%s dest=%s error=%v", e.Name, e.Project, dest, err)
	}
	if err := a.store.AddDelivery(d); err != nil {
		log.Printf("save history: %v", err)
	}
}
