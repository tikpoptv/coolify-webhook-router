package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	sessionCookie = "wr_session"
	sessionTTL    = 7 * 24 * time.Hour
	maxFailures   = 5
	lockDuration  = 5 * time.Minute
)

// Auth issues HMAC-signed session cookies and throttles failed logins per client IP.
//
// Cookie value: base64(user) "." expiryUnix "." hex(hmac(secret, user|expiry|passwordFingerprint)).
// Including a fingerprint of the password means changing ADMIN_PASSWORD logs everyone out.
type Auth struct {
	user, pass string
	secret     []byte

	mu       sync.Mutex
	failures map[string]*failure
}

type failure struct {
	count       int
	lockedUntil time.Time
}

func NewAuth(user, pass string, secret []byte) *Auth {
	return &Auth{user: user, pass: pass, secret: secret, failures: map[string]*failure{}}
}

func (a *Auth) sign(user string, exp int64) string {
	pw := sha256.Sum256([]byte(a.pass))
	m := hmac.New(sha256.New, a.secret)
	m.Write([]byte(user + "|" + strconv.FormatInt(exp, 10) + "|"))
	m.Write(pw[:])
	return hex.EncodeToString(m.Sum(nil))
}

func (a *Auth) issue(w http.ResponseWriter, r *http.Request) {
	exp := time.Now().Add(sessionTTL).Unix()
	value := base64.RawURLEncoding.EncodeToString([]byte(a.user)) + "." + strconv.FormatInt(exp, 10) + "." + a.sign(a.user, exp)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    value,
		Path:     "/",
		Expires:  time.Unix(exp, 0),
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteStrictMode,
	})
}

func (a *Auth) clear(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteStrictMode,
	})
}

// sessionUser returns the logged-in user, or "" when the cookie is missing, expired or forged.
func (a *Auth) sessionUser(r *http.Request) string {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	parts := strings.Split(c.Value, ".")
	if len(parts) != 3 {
		return ""
	}
	userBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return ""
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return ""
	}
	user := string(userBytes)
	if user != a.user || !hmac.Equal([]byte(parts[2]), []byte(a.sign(user, exp))) {
		return ""
	}
	return user
}

// require wraps admin API handlers.
func (a *Auth) require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.sessionUser(r) == "" {
			writeErr(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบ")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// checkLogin validates credentials, applying a per-IP lockout after repeated failures.
// When the client is locked out it returns false and the remaining lock time.
func (a *Auth) checkLogin(ip, user, pass string) (ok bool, retryAfter time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	f := a.failures[ip]
	if f != nil && now.Before(f.lockedUntil) {
		return false, f.lockedUntil.Sub(now)
	}
	good := subtle.ConstantTimeCompare([]byte(user), []byte(a.user)) == 1 &&
		subtle.ConstantTimeCompare([]byte(pass), []byte(a.pass)) == 1
	if good {
		delete(a.failures, ip)
		return true, 0
	}
	if f == nil || now.After(f.lockedUntil) && f.count >= maxFailures {
		f = &failure{}
		a.failures[ip] = f
	}
	f.count++
	if f.count >= maxFailures {
		f.lockedUntil = now.Add(lockDuration)
	}
	// Keep the map from growing without bound.
	if len(a.failures) > 10000 {
		for k, v := range a.failures {
			if now.After(v.lockedUntil) {
				delete(a.failures, k)
			}
		}
	}
	return false, 0
}

// clientIP prefers the last X-Forwarded-For hop (added by the reverse proxy, e.g. Traefik in Coolify).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
