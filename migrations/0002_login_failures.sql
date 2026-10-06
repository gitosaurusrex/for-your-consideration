-- Wrong admin passwords, kept for 15 minutes to rate-limit guessing.
CREATE TABLE login_failures (
  ip TEXT    NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_failures_ip_at ON login_failures (ip, at);
