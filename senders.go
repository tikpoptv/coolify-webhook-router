package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Extra payload fields worth showing in a notification, with their labels.
var detailFields = []struct{ key, label string }{
	{"deployment_url", "Logs"},
	{"fqdn", "Domain"},
	{"preview_fqdn", "Preview"},
	{"pull_request_id", "PR"},
	{"action", "Action"},
	{"cleanup_message", "Cleanup"},
	{"last_request", "Last request"},
	{"url", "Link"},
}

func (a *App) send(ctx context.Context, d Destination, e Event) error {
	var target string
	var body any
	switch d.Type {
	case "discord":
		target, body = d.URL, discordBody(e)
	case "slack":
		target, body = d.URL, map[string]any{"text": textBody(e, true)}
	case "telegram":
		target = "https://api.telegram.org/bot" + d.URL + "/sendMessage"
		body = map[string]any{"chat_id": d.ChatID, "text": textBody(e, false), "disable_web_page_preview": true}
	case "webhook":
		// Forward the original payload, with project/environment filled in when we resolved them.
		fwd := make(map[string]any, len(e.Raw)+2)
		for k, v := range e.Raw {
			fwd[k] = v
		}
		if e.Project != "" {
			fwd["project"] = e.Project
			fwd["environment"] = e.Environment
		}
		target, body = d.URL, fwd
	default:
		return fmt.Errorf("ไม่รู้จักประเภทปลายทาง %q", d.Type)
	}
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	return postJSON(ctx, a.client, target, b)
}

func icon(e Event) string {
	if e.Success {
		return "✅"
	}
	return "❌"
}

func title(e Event) string {
	if e.Message != "" {
		return e.Message
	}
	return e.Name
}

func location(e Event) string {
	switch {
	case e.Project != "" && e.Environment != "":
		return e.Project + " / " + e.Environment
	case e.Project != "":
		return e.Project
	}
	return ""
}

func details(e Event) [][2]string {
	var out [][2]string
	for _, f := range detailFields {
		if v := field(e.Raw, f.key); v != "" {
			out = append(out, [2]string{f.label, v})
		}
	}
	return out
}

func taskOutput(e Event) string {
	out := strings.TrimSpace(field(e.Raw, "output"))
	if len(out) > 800 {
		out = out[:800] + "…"
	}
	return out
}

func discordBody(e Event) map[string]any {
	color := 0x22c55e
	if !e.Success {
		color = 0xef4444
	}
	var fields []map[string]any
	if loc := location(e); loc != "" {
		fields = append(fields, map[string]any{"name": "Project", "value": loc, "inline": true})
	}
	if e.Resource != "" {
		fields = append(fields, map[string]any{"name": "Resource", "value": e.Resource, "inline": true})
	}
	fields = append(fields, map[string]any{"name": "Event", "value": "`" + e.Name + "`", "inline": true})
	var desc []string
	for _, d := range details(e) {
		desc = append(desc, "**"+d[0]+":** "+d[1])
	}
	if out := taskOutput(e); out != "" {
		desc = append(desc, "```\n"+strings.ReplaceAll(out, "```", "'''")+"\n```")
	}
	return map[string]any{
		"username": "Coolify",
		"embeds": []map[string]any{{
			"title":       truncate(icon(e)+" "+title(e), 250),
			"description": truncate(strings.Join(desc, "\n"), 4000),
			"color":       color,
			"fields":      fields,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		}},
	}
}

// textBody renders a plain-text message; markdown=true uses Slack mrkdwn bold/code.
func textBody(e Event, markdown bool) string {
	bold := func(s string) string {
		if markdown {
			return "*" + s + "*"
		}
		return s
	}
	lines := []string{icon(e) + " " + bold(title(e))}
	if loc := location(e); loc != "" {
		lines = append(lines, "Project: "+loc)
	}
	if e.Resource != "" {
		lines = append(lines, "Resource: "+e.Resource)
	}
	lines = append(lines, "Event: "+e.Name)
	for _, d := range details(e) {
		lines = append(lines, d[0]+": "+d[1])
	}
	if out := taskOutput(e); out != "" {
		if markdown {
			lines = append(lines, "```"+out+"```")
		} else {
			lines = append(lines, "", out)
		}
	}
	return truncate(strings.Join(lines, "\n"), 3900)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

// postJSON sends with up to 3 attempts, retrying network errors, 429 and 5xx.
// Errors never include the target URL, which may contain secrets.
func postJSON(ctx context.Context, client *http.Client, target string, body []byte) error {
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(time.Duration(attempt*2) * time.Second):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
		if err != nil {
			return errors.New("URL ปลายทางไม่ถูกต้อง")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "coolify-webhook-router")
		resp, err := client.Do(req)
		if err != nil {
			var ue *url.Error
			if errors.As(err, &ue) {
				err = ue.Err
			}
			last = err
			continue
		}
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		resp.Body.Close()
		if resp.StatusCode < 300 {
			return nil
		}
		last = fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
		if resp.StatusCode != http.StatusTooManyRequests && resp.StatusCode < 500 {
			return last
		}
	}
	return last
}
