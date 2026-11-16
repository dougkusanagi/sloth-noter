-- Separate remote spaces. Existing notes and blobs remain in the legacy tables.
CREATE TABLE profile_spaces (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 4),
  credential_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);


CREATE TABLE profile_notes (
  space_id TEXT NOT NULL REFERENCES profile_spaces(id),
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  hash TEXT NOT NULL,
  deleted INTEGER NOT NULL,
  envelope TEXT,
  seq INTEGER NOT NULL,
  PRIMARY KEY (space_id, id),
  UNIQUE (space_id, seq)
);

CREATE TABLE profile_blob_sizes (
  space_id TEXT NOT NULL REFERENCES profile_spaces(id),
  sha TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (space_id, sha)
);
