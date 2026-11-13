-- Current revision of each note; `seq` orders the change feed (ADR 0018).
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  hash TEXT NOT NULL,
  deleted INTEGER NOT NULL,
  envelope TEXT,
  seq INTEGER NOT NULL UNIQUE
);
