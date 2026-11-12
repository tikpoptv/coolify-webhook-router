package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

//go:embed all:web/dist
var webDist embed.FS

type App struct {
	store     *Store
	resolver  *Resolver
	auth      *Auth
	client    *http.Client
	queue     chan []byte
	hookToken string
	webFS     fs.FS
}

func main() {
	addr := envOr("LISTEN_ADDR", ":8080")
	dbPath := envOr("DB_PATH", "data/router.db")
	adminPass := os.Getenv("ADMIN_PASSWORD")
	if adminPass == "" {
		log.Fatal("ADMIN_PASSWORD is required")
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatal(err)
	}
	store, err := OpenStore(dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	// Env values only seed the settings; after that the UI owns them.
	for key, env := range map[string]string{"coolify_url": "COOLIFY_URL", "coolify_api_token": "COOLIFY_API_TOKEN"} {
		if store.Setting(key) == "" && os.Getenv(env) != "" {
			_ = store.SetSetting(key, os.Getenv(env))
		}
	}

	hookToken := os.Getenv("HOOK_TOKEN")
	if hookToken == "" {
		hookToken = store.Setting("hook_token")
		if hookToken == "" {
			hookToken = randomToken()
			if err := store.SetSetting("hook_token", hookToken); err != nil {
				log.Fatal(err)
			}
		}
	}

	// Session signing key, persisted so logins survive restarts.
	secretHex := store.Setting("session_secret")
	if secretHex == "" {
		secretHex = randomToken()
		if err := store.SetSetting("session_secret", secretHex); err != nil {
			log.Fatal(err)
		}
	}
	secret, _ := hex.DecodeString(secretHex)

	webFS, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		log.Fatal(err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	app := &App{
		store:     store,
		auth:      NewAuth(envOr("ADMIN_USER", "admin"), adminPass, secret),
		client:    client,
		queue:     make(chan []byte, 256),
		hookToken: hookToken,
		webFS:     webFS,
	}
	app.resolver = NewResolver(func() (string, string) {
		return store.Setting("coolify_url"), store.Setting("coolify_api_token")
	}, client)

	for i := 0; i < 4; i++ {
		go app.worker()
	}
	go func() {
		_ = app.resolver.Refresh(context.Background())
		for range time.Tick(time.Hour) {
			if err := store.PruneDeliveries(2000); err != nil {
				log.Printf("prune history: %v", err)
			}
		}
	}()

	srv := &http.Server{Addr: addr, Handler: app.routes(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Printf("listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func randomToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
