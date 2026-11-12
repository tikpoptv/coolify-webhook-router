package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS destinations (
	id      INTEGER PRIMARY KEY,
	name    TEXT NOT NULL,
	type    TEXT NOT NULL,
	url     TEXT NOT NULL,
	chat_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS rules (
	id             INTEGER PRIMARY KEY,
	project        TEXT NOT NULL DEFAULT '',
	environment    TEXT NOT NULL DEFAULT '',
	event          TEXT NOT NULL DEFAULT '',
	status         TEXT NOT NULL DEFAULT '',
	destination_id INTEGER NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
	enabled        INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
	id          INTEGER PRIMARY KEY,
	ts          INTEGER NOT NULL,
	event       TEXT NOT NULL,
	project     TEXT NOT NULL,
	environment TEXT NOT NULL,
	resource    TEXT NOT NULL,
	destination TEXT NOT NULL,
	ok          INTEGER NOT NULL,
	error       TEXT NOT NULL,
	payload     TEXT NOT NULL
);
`

var destinationTypes = map[string]bool{"discord": true, "slack": true, "telegram": true, "webhook": true}

type Destination struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	URL    string `json:"url"`
	ChatID string `json:"chat_id"`
}

type Rule struct {
	ID              int64  `json:"id"`
	Project         string `json:"project"`
	Environment     string `json:"environment"`
	Event           string `json:"event"`
	Status          string `json:"status"` // "", "success", "failure"
	DestinationID   int64  `json:"destination_id"`
	DestinationName string `json:"destination_name"`
	Enabled         bool   `json:"enabled"`
}

type Delivery struct {
	ID          int64     `json:"id"`
	Time        time.Time `json:"time"`
	Event       string    `json:"event"`
	Project     string    `json:"project"`
	Environment string    `json:"environment"`
	Resource    string    `json:"resource"`
	Destination string    `json:"destination"`
	OK          bool      `json:"ok"`
	Error       string    `json:"error"`
	Payload     string    `json:"payload"`
}

type Store struct{ db *sql.DB }

var errNotFound = errors.New("not found")

func OpenStore(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// ---- settings ----

func (s *Store) Setting(key string) string {
	var v string
	_ = s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	return v
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func (s *Store) FallbackID() int64 {
	id, _ := strconv.ParseInt(s.Setting("fallback_destination_id"), 10, 64)
	return id
}

// ---- destinations ----

func (s *Store) ListDestinations() ([]Destination, error) {
	rows, err := s.db.Query(`SELECT id, name, type, url, chat_id FROM destinations ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Destination{}
	for rows.Next() {
		var d Destination
		if err := rows.Scan(&d.ID, &d.Name, &d.Type, &d.URL, &d.ChatID); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) GetDestination(id int64) (Destination, error) {
	var d Destination
	err := s.db.QueryRow(`SELECT id, name, type, url, chat_id FROM destinations WHERE id = ?`, id).
		Scan(&d.ID, &d.Name, &d.Type, &d.URL, &d.ChatID)
	if errors.Is(err, sql.ErrNoRows) {
		return d, errNotFound
	}
	return d, err
}

// SaveDestination inserts (ID == 0) or updates. On update an empty URL keeps the stored one,
// so the UI never has to show secrets back to the browser.
func (s *Store) SaveDestination(d *Destination) error {
	d.Name = strings.TrimSpace(d.Name)
	d.URL = strings.TrimSpace(d.URL)
	d.ChatID = strings.TrimSpace(d.ChatID)
	if d.Name == "" {
		return fmt.Errorf("กรุณาใส่ชื่อปลายทาง")
	}
	if !destinationTypes[d.Type] {
		return fmt.Errorf("ประเภทปลายทางไม่ถูกต้อง: %q", d.Type)
	}
	if d.ID != 0 && d.URL == "" {
		old, err := s.GetDestination(d.ID)
		if err != nil {
			return err
		}
		d.URL = old.URL
	}
	if d.URL == "" {
		return fmt.Errorf("กรุณาใส่ URL หรือ token")
	}
	if d.Type != "telegram" && !strings.HasPrefix(d.URL, "http://") && !strings.HasPrefix(d.URL, "https://") {
		return fmt.Errorf("URL ต้องขึ้นต้นด้วย http:// หรือ https://")
	}
	if d.Type == "telegram" && d.ChatID == "" {
		return fmt.Errorf("Telegram ต้องใส่ chat ID")
	}
	if d.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO destinations(name, type, url, chat_id) VALUES(?, ?, ?, ?)`,
			d.Name, d.Type, d.URL, d.ChatID)
		if err != nil {
			return err
		}
		d.ID, err = res.LastInsertId()
		return err
	}
	res, err := s.db.Exec(`UPDATE destinations SET name = ?, type = ?, url = ?, chat_id = ? WHERE id = ?`,
		d.Name, d.Type, d.URL, d.ChatID, d.ID)
	return mustAffect(res, err)
}

func (s *Store) DeleteDestination(id int64) error {
	if s.FallbackID() == id {
		if err := s.SetSetting("fallback_destination_id", ""); err != nil {
			return err
		}
	}
	return mustAffect(s.db.Exec(`DELETE FROM destinations WHERE id = ?`, id))
}

// ---- rules ----

func (s *Store) ListRules() ([]Rule, error) {
	rows, err := s.db.Query(`SELECT r.id, r.project, r.environment, r.event, r.status, r.destination_id, d.name, r.enabled
		FROM rules r JOIN destinations d ON d.id = r.destination_id ORDER BY r.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Rule{}
	for rows.Next() {
		var r Rule
		if err := rows.Scan(&r.ID, &r.Project, &r.Environment, &r.Event, &r.Status, &r.DestinationID, &r.DestinationName, &r.Enabled); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) SaveRule(r *Rule) error {
	r.Project = strings.TrimSpace(r.Project)
	r.Environment = strings.TrimSpace(r.Environment)
	r.Event = strings.TrimSpace(r.Event)
	if r.Status != "" && r.Status != "success" && r.Status != "failure" {
		return fmt.Errorf("status ต้องเป็น success หรือ failure")
	}
	if _, err := s.GetDestination(r.DestinationID); err != nil {
		return fmt.Errorf("ไม่พบปลายทางที่เลือก")
	}
	if r.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO rules(project, environment, event, status, destination_id, enabled) VALUES(?, ?, ?, ?, ?, ?)`,
			r.Project, r.Environment, r.Event, r.Status, r.DestinationID, r.Enabled)
		if err != nil {
			return err
		}
		r.ID, err = res.LastInsertId()
		return err
	}
	return mustAffect(s.db.Exec(`UPDATE rules SET project = ?, environment = ?, event = ?, status = ?, destination_id = ?, enabled = ? WHERE id = ?`,
		r.Project, r.Environment, r.Event, r.Status, r.DestinationID, r.Enabled, r.ID))
}

func (s *Store) DeleteRule(id int64) error {
	return mustAffect(s.db.Exec(`DELETE FROM rules WHERE id = ?`, id))
}

// ---- deliveries (history) ----

func (s *Store) AddDelivery(d Delivery) error {
	_, err := s.db.Exec(`INSERT INTO deliveries(ts, event, project, environment, resource, destination, ok, error, payload)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.Time.UnixMilli(), d.Event, d.Project, d.Environment, d.Resource, d.Destination, d.OK, d.Error, d.Payload)
	return err
}

func (s *Store) ListDeliveries(limit int) ([]Delivery, error) {
	rows, err := s.db.Query(`SELECT id, ts, event, project, environment, resource, destination, ok, error, payload
		FROM deliveries ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Delivery{}
	for rows.Next() {
		var d Delivery
		var ts int64
		if err := rows.Scan(&d.ID, &ts, &d.Event, &d.Project, &d.Environment, &d.Resource, &d.Destination, &d.OK, &d.Error, &d.Payload); err != nil {
			return nil, err
		}
		d.Time = time.UnixMilli(ts)
		out = append(out, d)
	}
	return out, rows.Err()
}

// PruneDeliveries keeps only the newest `keep` rows.
func (s *Store) PruneDeliveries(keep int) error {
	_, err := s.db.Exec(`DELETE FROM deliveries WHERE id <= (SELECT id FROM deliveries ORDER BY id DESC LIMIT 1 OFFSET ?)`, keep)
	return err
}

func mustAffect(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errNotFound
	}
	return nil
}
