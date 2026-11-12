package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()

	// Public: Coolify posts here. The token in the path is the only auth Coolify supports.
	mux.HandleFunc("POST /hook/{token}", a.handleHook)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })

	// Admin API, behind a session cookie.
	admin := http.NewServeMux()
	admin.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"user": a.auth.sessionUser(r)})
	})
	admin.HandleFunc("GET /api/overview", a.handleOverview)
	admin.HandleFunc("PUT /api/settings", a.handleSettings)
	admin.HandleFunc("POST /api/coolify/refresh", a.handleCoolifyRefresh)
	admin.HandleFunc("GET /api/projects", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, a.resolver.Projects()) })

	admin.HandleFunc("GET /api/destinations", a.handleListDestinations)
	admin.HandleFunc("POST /api/destinations", a.handleSaveDestination)
	admin.HandleFunc("PUT /api/destinations/{id}", a.handleSaveDestination)
	admin.HandleFunc("DELETE /api/destinations/{id}", func(w http.ResponseWriter, r *http.Request) {
		respond(w, a.store.DeleteDestination(pathID(r)), nil)
	})
	admin.HandleFunc("POST /api/destinations/{id}/test", a.handleTestDestination)

	admin.HandleFunc("GET /api/rules", func(w http.ResponseWriter, _ *http.Request) {
		rules, err := a.store.ListRules()
		respond(w, err, rules)
	})
	admin.HandleFunc("POST /api/rules", a.handleSaveRule)
	admin.HandleFunc("PUT /api/rules/{id}", a.handleSaveRule)
	admin.HandleFunc("DELETE /api/rules/{id}", func(w http.ResponseWriter, r *http.Request) {
		respond(w, a.store.DeleteRule(pathID(r)), nil)
	})

	admin.HandleFunc("GET /api/deliveries", func(w http.ResponseWriter, _ *http.Request) {
		list, err := a.store.ListDeliveries(200)
		respond(w, err, list)
	})
	admin.HandleFunc("POST /api/simulate", a.handleSimulate)
	admin.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeErr(w, 404, L("ไม่พบ API นี้", "Unknown API endpoint"))
	})

	mux.HandleFunc("POST /api/login", a.handleLogin)
	mux.HandleFunc("POST /api/logout", func(w http.ResponseWriter, r *http.Request) {
		a.auth.clear(w, r)
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	mux.Handle("/api/", a.auth.require(admin))

	// The web UI (built React app). Unknown paths fall back to index.html.
	mux.Handle("/", spaHandler(a.webFS))
	return securityHeaders(withLang(mux))
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	ok, wait := a.auth.checkLogin(clientIP(r), in.Username, in.Password)
	if wait > 0 {
		writeErr(w, http.StatusTooManyRequests, L("ใส่รหัสผิดหลายครั้ง ลองใหม่ในอีก %d นาที", "Too many failed attempts. Try again in %d min.", int(wait.Minutes())+1))
		return
	}
	if !ok {
		writeErr(w, http.StatusUnauthorized, L("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "Incorrect username or password"))
		return
	}
	a.auth.issue(w, r)
	writeJSON(w, 200, map[string]string{"user": in.Username})
}

func spaHandler(webFS fs.FS) http.Handler {
	files := http.FileServer(http.FS(webFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" && p != "index.html" {
			if f, err := webFS.Open(p); err == nil {
				f.Close()
				if strings.HasPrefix(p, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		index, err := fs.ReadFile(webFS, "index.html")
		if err != nil {
			http.Error(w, "web UI not built — run: cd web && npm install && npm run build", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(index)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func (a *App) handleHook(w http.ResponseWriter, r *http.Request) {
	if subtle.ConstantTimeCompare([]byte(r.PathValue("token")), []byte(a.hookToken)) != 1 {
		http.NotFound(w, r)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil || !json.Valid(body) {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	select {
	case a.queue <- body:
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		// Coolify retries 5xx, so a full queue just delays delivery.
		http.Error(w, "queue full", http.StatusServiceUnavailable)
	}
}

// ---- overview / settings ----

type overview struct {
	HookPath        string         `json:"hook_path"`
	CoolifyURL      string         `json:"coolify_url"`
	CoolifyTokenSet bool           `json:"coolify_token_set"`
	FallbackID      int64          `json:"fallback_destination_id"`
	Coolify         ResolverStatus `json:"coolify"`
}

func (a *App) overview(lang string) overview {
	return overview{
		HookPath:        "/hook/" + a.hookToken,
		CoolifyURL:      a.store.Setting("coolify_url"),
		CoolifyTokenSet: a.store.Setting("coolify_api_token") != "",
		FallbackID:      a.store.FallbackID(),
		Coolify:         a.resolver.Status(lang),
	}
}

func (a *App) handleOverview(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, a.overview(langOf(r)))
}

func (a *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CoolifyURL      *string `json:"coolify_url"`
		CoolifyAPIToken *string `json:"coolify_api_token"`
		FallbackID      *int64  `json:"fallback_destination_id"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	coolifyChanged := false
	if in.CoolifyURL != nil {
		u := strings.TrimRight(strings.TrimSpace(*in.CoolifyURL), "/")
		if u != "" && !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			writeErr(w, 400, L("Coolify URL ต้องขึ้นต้นด้วย http:// หรือ https://", "Coolify URL must start with http:// or https://"))
			return
		}
		if err := a.store.SetSetting("coolify_url", u); err != nil {
			writeErr(w, 500, err)
			return
		}
		coolifyChanged = true
	}
	if in.CoolifyAPIToken != nil && strings.TrimSpace(*in.CoolifyAPIToken) != "" {
		if err := a.store.SetSetting("coolify_api_token", strings.TrimSpace(*in.CoolifyAPIToken)); err != nil {
			writeErr(w, 500, err)
			return
		}
		coolifyChanged = true
	}
	if in.FallbackID != nil {
		v := ""
		if *in.FallbackID > 0 {
			if _, err := a.store.GetDestination(*in.FallbackID); err != nil {
				writeErr(w, 400, errDestMissing)
				return
			}
			v = strconv.FormatInt(*in.FallbackID, 10)
		}
		if err := a.store.SetSetting("fallback_destination_id", v); err != nil {
			writeErr(w, 500, err)
			return
		}
	}
	if coolifyChanged {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		_ = a.resolver.Refresh(ctx)
		cancel()
	}
	writeJSON(w, 200, a.overview(langOf(r)))
}

func (a *App) handleCoolifyRefresh(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	_ = a.resolver.Refresh(ctx)
	writeJSON(w, 200, a.overview(langOf(r)))
}

// ---- destinations ----

func (a *App) handleListDestinations(w http.ResponseWriter, _ *http.Request) {
	list, err := a.store.ListDestinations()
	for i := range list {
		list[i].URL = mask(list[i].URL)
	}
	respond(w, err, list)
}

func (a *App) handleSaveDestination(w http.ResponseWriter, r *http.Request) {
	var d Destination
	if !readJSON(w, r, &d) {
		return
	}
	d.ID = 0
	if r.PathValue("id") != "" {
		d.ID = pathID(r)
	}
	if err := a.store.SaveDestination(&d); err != nil {
		respond(w, err, nil)
		return
	}
	d.URL = mask(d.URL)
	writeJSON(w, 200, d)
}

func (a *App) handleTestDestination(w http.ResponseWriter, r *http.Request) {
	d, err := a.store.GetDestination(pathID(r))
	if err != nil {
		respond(w, err, nil)
		return
	}
	msg := "Test from Webhook Router — if you can see this, the destination works."
	if langOf(r) == "th" {
		msg = "ทดสอบจาก Webhook Router — ถ้าเห็นข้อความนี้แปลว่าเชื่อมต่อสำเร็จ"
	}
	raw := map[string]any{"success": true, "event": "test", "message": msg}
	e := Event{Name: "test", Message: msg, Success: true, Raw: raw}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := a.send(ctx, d, e); err != nil {
		writeErr(w, 502, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ---- rules ----

func (a *App) handleSaveRule(w http.ResponseWriter, r *http.Request) {
	var rule Rule
	if !readJSON(w, r, &rule) {
		return
	}
	rule.ID = 0
	if r.PathValue("id") != "" {
		rule.ID = pathID(r)
	}
	respond(w, a.store.SaveRule(&rule), rule)
}

// ---- simulate ----

func (a *App) handleSimulate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	e, err := parseEvent(body)
	if err != nil {
		writeErr(w, 400, L("JSON ไม่ถูกต้อง: %v", "Invalid JSON: %v", err))
		return
	}
	a.enrich(r.Context(), &e)
	dests, fallback, err := a.route(e)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	names := []string{}
	for _, d := range dests {
		names = append(names, d.Name)
	}
	sent := false
	if r.URL.Query().Get("send") == "1" {
		select {
		case a.queue <- body:
			sent = true
		default:
			writeErr(w, 503, L("คิวเต็ม ลองใหม่อีกครั้ง", "Queue is full, try again"))
			return
		}
	}
	writeJSON(w, 200, map[string]any{
		"event":        e.Name,
		"project":      e.Project,
		"environment":  e.Environment,
		"resource":     e.Resource,
		"destinations": names,
		"fallback":     fallback,
		"sent":         sent,
	})
}

// ---- helpers ----

func mask(s string) string {
	r := []rune(s)
	if len(r) <= 12 {
		return strings.Repeat("•", len(r))
	}
	keep := len(r) / 3
	if keep > 40 {
		keep = 40
	}
	return string(r[:keep]) + "••••••"
}

func pathID(r *http.Request) int64 {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(v); err != nil {
		writeErr(w, 400, L("JSON ไม่ถูกต้อง: %v", "Invalid JSON: %v", err))
		return false
	}
	return true
}

func respond(w http.ResponseWriter, err error, v any) {
	switch {
	case errors.Is(err, errNotFound):
		writeErr(w, 404, L("ไม่พบข้อมูล", "Not found"))
	case err != nil:
		writeErr(w, 400, err)
	case v == nil:
		writeJSON(w, 200, map[string]bool{"ok": true})
	default:
		writeJSON(w, 200, v)
	}
}

// writeErr writes {"error": msg}; msg may be a string, an error or a *LocalError,
// localized to the request language.
func writeErr(w http.ResponseWriter, code int, msg any) {
	var text string
	switch m := msg.(type) {
	case error:
		text = localize(m, writerLang(w))
	default:
		text = fmt.Sprint(m)
	}
	writeJSON(w, code, map[string]string{"error": text})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
