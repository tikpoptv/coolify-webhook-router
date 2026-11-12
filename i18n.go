package main

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// The admin UI sends Accept-Language: th or en. User-facing messages carry both
// languages and are localized when written to the response.

// LocalError is an error with Thai and English text. Error() returns English, which is
// also what goes into logs and the stored delivery history.
type LocalError struct{ TH, EN string }

func (e *LocalError) Error() string { return e.EN }

// L builds a bilingual message; args are applied to both format strings.
func L(th, en string, args ...any) *LocalError {
	return &LocalError{TH: fmt.Sprintf(th, args...), EN: fmt.Sprintf(en, args...)}
}

func langOf(r *http.Request) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(r.Header.Get("Accept-Language"))), "th") {
		return "th"
	}
	return "en"
}

func localize(err error, lang string) string {
	var le *LocalError
	if errors.As(err, &le) {
		if lang == "th" {
			return le.TH
		}
		return le.EN
	}
	return err.Error()
}

// langWriter carries the request language so writeErr can localize without the request.
type langWriter struct {
	http.ResponseWriter
	lang string
}

func (w *langWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func withLang(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(&langWriter{ResponseWriter: w, lang: langOf(r)}, r)
	})
}

func writerLang(w http.ResponseWriter) string {
	if lw, ok := w.(*langWriter); ok {
		return lw.lang
	}
	return "en"
}
