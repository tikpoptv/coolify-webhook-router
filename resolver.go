package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// Resolver maps Coolify resource UUIDs (application / service / database) to the
// project and environment they live in, using the Coolify API. Most webhook events
// other than deployments only carry a UUID, so this is what makes routing by
// project work for backups, scheduled tasks and image scans.
type Resolver struct {
	cfg    func() (baseURL, token string)
	client *http.Client

	refreshMu sync.Mutex // serialises refreshes

	mu       sync.Mutex
	byUUID   map[string]Location
	projects []ProjectInfo
	loadedAt time.Time
	triedAt  time.Time
	lastErr  error
}

type Location struct {
	Project     string
	Environment string
}

type ProjectInfo struct {
	Name         string   `json:"name"`
	Environments []string `json:"environments"`
}

type ResolverStatus struct {
	Configured bool      `json:"configured"`
	Resources  int       `json:"resources"`
	Projects   int       `json:"projects"`
	LoadedAt   time.Time `json:"loaded_at"`
	Error      string    `json:"error"`
}

const (
	cacheTTL     = 5 * time.Minute
	missCooldown = 30 * time.Second
)

var errNotConfigured = errors.New("ยังไม่ได้ตั้งค่า Coolify URL / API token")

func NewResolver(cfg func() (string, string), client *http.Client) *Resolver {
	return &Resolver{cfg: cfg, client: client, byUUID: map[string]Location{}}
}

// Lookup returns the location of a resource UUID. It refreshes the cache when it is
// stale or when the UUID is unknown (at most once per missCooldown).
func (r *Resolver) Lookup(ctx context.Context, uuid string) (Location, bool) {
	if uuid == "" {
		return Location{}, false
	}
	r.mu.Lock()
	loc, ok := r.byUUID[uuid]
	fresh := time.Since(r.loadedAt) < cacheTTL
	recentlyTried := time.Since(r.triedAt) < missCooldown
	r.mu.Unlock()

	if (ok && fresh) || recentlyTried {
		return loc, ok
	}
	_ = r.Refresh(ctx)
	r.mu.Lock()
	defer r.mu.Unlock()
	loc, ok = r.byUUID[uuid]
	return loc, ok
}

func (r *Resolver) Refresh(ctx context.Context) error {
	r.refreshMu.Lock()
	defer r.refreshMu.Unlock()

	r.mu.Lock()
	r.triedAt = time.Now()
	r.mu.Unlock()

	err := r.load(ctx)
	r.mu.Lock()
	r.lastErr = err
	r.mu.Unlock()
	return err
}

func (r *Resolver) load(ctx context.Context) error {
	base, token := r.cfg()
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" || token == "" {
		return errNotConfigured
	}

	var projects []struct {
		UUID string `json:"uuid"`
		Name string `json:"name"`
	}
	if err := r.get(ctx, base, token, "/api/v1/projects", &projects); err != nil {
		return err
	}

	envByID := map[string]Location{}
	infos := make([]ProjectInfo, 0, len(projects))
	for _, p := range projects {
		var envs []struct {
			ID   any    `json:"id"`
			Name string `json:"name"`
		}
		if err := r.get(ctx, base, token, "/api/v1/projects/"+url.PathEscape(p.UUID)+"/environments", &envs); err != nil {
			return err
		}
		info := ProjectInfo{Name: p.Name, Environments: []string{}}
		for _, e := range envs {
			envByID[fmt.Sprint(e.ID)] = Location{Project: p.Name, Environment: e.Name}
			info.Environments = append(info.Environments, e.Name)
		}
		infos = append(infos, info)
	}
	sort.Slice(infos, func(i, j int) bool { return strings.ToLower(infos[i].Name) < strings.ToLower(infos[j].Name) })

	var resources []struct {
		UUID          string `json:"uuid"`
		EnvironmentID any    `json:"environment_id"`
	}
	if err := r.get(ctx, base, token, "/api/v1/resources", &resources); err != nil {
		return err
	}
	byUUID := make(map[string]Location, len(resources))
	for _, res := range resources {
		if loc, ok := envByID[fmt.Sprint(res.EnvironmentID)]; ok && res.UUID != "" {
			byUUID[res.UUID] = loc
		}
	}

	r.mu.Lock()
	r.byUUID = byUUID
	r.projects = infos
	r.loadedAt = time.Now()
	r.mu.Unlock()
	return nil
}

func (r *Resolver) get(ctx context.Context, base, token, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return fmt.Errorf("Coolify URL ไม่ถูกต้อง: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return fmt.Errorf("เรียก Coolify API ไม่ได้: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 200))
		return fmt.Errorf("Coolify API %s ตอบ HTTP %d: %s", path, resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 32<<20)).Decode(out); err != nil {
		return fmt.Errorf("อ่านผลจาก Coolify API %s ไม่ได้: %w", path, err)
	}
	return nil
}

func (r *Resolver) Projects() []ProjectInfo {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]ProjectInfo{}, r.projects...)
}

func (r *Resolver) Status() ResolverStatus {
	base, token := r.cfg()
	r.mu.Lock()
	defer r.mu.Unlock()
	s := ResolverStatus{
		Configured: strings.TrimSpace(base) != "" && token != "",
		Resources:  len(r.byUUID),
		Projects:   len(r.projects),
		LoadedAt:   r.loadedAt,
	}
	if r.lastErr != nil {
		s.Error = r.lastErr.Error()
	}
	return s
}
