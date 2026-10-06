-- Every record (item, person, studio, genre) is one JSON document.
-- type: 'item' | 'person' | 'company' | 'genre'
CREATE TABLE entities (
  type       TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (type, id)
);

-- Site-wide settings: medium on/off switches, home page text.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A record of every batch ingest, so its summary can be reopened later.
CREATE TABLE ingests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  filename   TEXT,
  summary    TEXT NOT NULL
);
