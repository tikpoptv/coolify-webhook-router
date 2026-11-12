package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"
)

func TestRuleMatches(t *testing.T) {
	deployFail := Event{Name: "deployment_failed", Project: "Shop", Environment: "production", Success: false}
	server := Event{Name: "server_unreachable", Success: false}
	cases := []struct {
		name string
		rule Rule
		ev   Event
		want bool
	}{
		{"empty rule matches all", Rule{}, deployFail, true},
		{"project case-insensitive", Rule{Project: "shop"}, deployFail, true},
		{"other project", Rule{Project: "blog"}, deployFail, false},
		{"env", Rule{Project: "shop", Environment: "staging"}, deployFail, false},
		{"glob event", Rule{Event: "deployment_*"}, deployFail, true},
		{"failure only", Rule{Status: "failure"}, deployFail, true},
		{"success only", Rule{Status: "success"}, deployFail, false},
		{"project rule skips server events", Rule{Project: "shop"}, server, false},
		{"server glob", Rule{Event: "server_*"}, server, true},
	}
	for _, c := range cases {
		if got := c.rule.Matches(c.ev); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestParseEvent(t *testing.T) {
	e, err := parseEvent([]byte(`{"success":false,"event":"backup_failed","message":"x","database_name":"db1","database_uuid":"u1"}`))
	if err != nil {
		t.Fatal(err)
	}
	if e.Name != "backup_failed" || e.Resource != "db1" || e.Success || e.Project != "" {
		t.Fatalf("unexpected %+v", e)
	}
}

// fakeCoolify serves the three API endpoints the resolver uses.
func fakeCoolify(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(401)
			return
		}
		switch r.URL.Path {
		case "/api/v1/projects":
			w.Write([]byte(`[{"uuid":"p1","name":"shop"},{"uuid":"p2","name":"blog"}]`))
		case "/api/v1/projects/p1/environments":
			w.Write([]byte(`[{"id":1,"name":"production"},{"id":2,"name":"staging"}]`))
		case "/api/v1/projects/p2/environments":
			w.Write([]byte(`[{"id":3,"name":"production"}]`))
		case "/api/v1/resources":
			w.Write([]byte(`[{"uuid":"db-shop","type":"standalone-postgresql","environment_id":2},{"uuid":"app-blog","type":"application","environment_id":3}]`))
		default:
			w.WriteHeader(404)
		}
	}))
}

type sink struct {
	mu   sync.Mutex
	got  []string
	hits chan struct{}
}

func newSink() (*sink, *httptest.Server) {
	s := &sink{hits: make(chan struct{}, 10)}
	return s, httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.got = append(s.got, string(b))
		s.mu.Unlock()
		s.hits <- struct{}{}
	}))
}

func (s *sink) wait(t *testing.T, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		select {
		case <-s.hits:
		case <-time.After(5 * time.Second):
			t.Fatalf("timed out waiting for delivery %d", i+1)
		}
	}
}

func TestEndToEnd(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	coolify := fakeCoolify(t)
	defer coolify.Close()
	store.SetSetting("coolify_url", coolify.URL)
	store.SetSetting("coolify_api_token", "tok")

	shopSink, shopSrv := newSink()
	defer shopSrv.Close()
	infraSink, infraSrv := newSink()
	defer infraSrv.Close()

	shop := Destination{Name: "shop", Type: "discord", URL: shopSrv.URL}
	infra := Destination{Name: "infra", Type: "webhook", URL: infraSrv.URL}
	must(t, store.SaveDestination(&shop))
	must(t, store.SaveDestination(&infra))
	must(t, store.SaveRule(&Rule{Project: "shop", DestinationID: shop.ID, Enabled: true}))
	must(t, store.SetSetting("fallback_destination_id", "2"))

	app := &App{store: store, client: http.DefaultClient, queue: make(chan []byte, 10), hookToken: "secret",
		auth: NewAuth("admin", "pw", []byte("k")), webFS: fstest.MapFS{"index.html": {Data: []byte("<html>")}}}
	app.resolver = NewResolver(func() (string, string) { return store.Setting("coolify_url"), store.Setting("coolify_api_token") }, http.DefaultClient)
	go app.worker()
	srv := httptest.NewServer(app.routes())
	defer srv.Close()

	post := func(path, body string) int {
		resp, err := http.Post(srv.URL+path, "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	if code := post("/hook/wrong", `{}`); code != 404 {
		t.Fatalf("wrong token: got %d", code)
	}

	// Deployment carries project directly -> shop.
	if code := post("/hook/secret", `{"success":false,"event":"deployment_failed","message":"Deployment failed","project":"shop","environment":"production","application_name":"web"}`); code != 200 {
		t.Fatalf("hook: got %d", code)
	}
	shopSink.wait(t, 1)

	// Backup only has a UUID -> resolved via Coolify API to shop/staging -> shop.
	post("/hook/secret", `{"success":false,"event":"backup_failed","message":"Backup failed","database_name":"db","database_uuid":"db-shop"}`)
	shopSink.wait(t, 1)

	// Server event -> no rule -> fallback webhook, forwarded as JSON.
	post("/hook/secret", `{"success":false,"event":"server_unreachable","message":"down","server_name":"main"}`)
	infraSink.wait(t, 1)

	// Blog app resolved but no rule -> fallback, with project filled in.
	post("/hook/secret", `{"success":true,"event":"task_success","message":"ok","task_name":"t","application_uuid":"app-blog"}`)
	infraSink.wait(t, 1)

	var fwd map[string]any
	json.Unmarshal([]byte(infraSink.got[1]), &fwd)
	if fwd["project"] != "blog" || fwd["environment"] != "production" {
		t.Fatalf("forwarded payload not enriched: %v", fwd)
	}
	if !strings.Contains(shopSink.got[1], "shop / staging") {
		t.Fatalf("backup message missing resolved project: %s", shopSink.got[1])
	}

	// Admin API requires auth.
	resp, _ := http.Get(srv.URL + "/api/rules")
	resp.Body.Close()
	if resp.StatusCode != 401 {
		t.Fatalf("admin without auth: %d", resp.StatusCode)
	}

	// History recorded all four.
	time.Sleep(100 * time.Millisecond)
	hist, _ := store.ListDeliveries(10)
	if len(hist) != 4 {
		t.Fatalf("history: got %d rows", len(hist))
	}
	for _, h := range hist {
		if !h.OK {
			t.Errorf("delivery failed: %+v", h)
		}
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestAuth(t *testing.T) {
	app := &App{auth: NewAuth("admin", "pw", []byte("k")), webFS: fstest.MapFS{"index.html": {Data: []byte("<html>")}}}
	srv := httptest.NewServer(app.routes())
	defer srv.Close()

	login := func(pass, ip string) *http.Response {
		req, _ := http.NewRequest("POST", srv.URL+"/api/login", strings.NewReader(`{"username":"admin","password":"`+pass+`"}`))
		req.Header.Set("X-Forwarded-For", ip)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp
	}
	me := func(c *http.Cookie) int {
		req, _ := http.NewRequest("GET", srv.URL+"/api/me", nil)
		if c != nil {
			req.AddCookie(c)
		}
		resp, _ := http.DefaultClient.Do(req)
		resp.Body.Close()
		return resp.StatusCode
	}

	if code := me(nil); code != 401 {
		t.Fatalf("me without cookie: %d", code)
	}
	resp := login("pw", "1.1.1.1")
	if resp.StatusCode != 200 || len(resp.Cookies()) != 1 {
		t.Fatalf("login: %d %v", resp.StatusCode, resp.Cookies())
	}
	cookie := resp.Cookies()[0]
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("cookie flags: %+v", cookie)
	}
	if code := me(cookie); code != 200 {
		t.Fatalf("me with cookie: %d", code)
	}
	forged := *cookie
	forged.Value = cookie.Value[:len(cookie.Value)-2] + "00"
	if code := me(&forged); code != 401 {
		t.Fatalf("forged cookie accepted: %d", code)
	}

	// Changing the password invalidates sessions.
	other := &App{auth: NewAuth("admin", "new", []byte("k")), webFS: app.webFS}
	if other.auth.sessionUser(&http.Request{Header: http.Header{"Cookie": {cookie.String()}}}) != "" {
		t.Fatal("session survived password change")
	}

	// Lockout after 5 failures, per IP.
	for i := 0; i < 5; i++ {
		if r := login("bad", "2.2.2.2"); r.StatusCode != 401 {
			t.Fatalf("bad login %d: %d", i, r.StatusCode)
		}
	}
	if r := login("pw", "2.2.2.2"); r.StatusCode != 429 {
		t.Fatalf("expected lockout, got %d", r.StatusCode)
	}
	if r := login("pw", "3.3.3.3"); r.StatusCode != 200 {
		t.Fatalf("other IP should not be locked: %d", r.StatusCode)
	}

	// SPA fallback serves index.html without auth.
	r, _ := http.Get(srv.URL + "/rules")
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("spa fallback: %d", r.StatusCode)
	}
}
