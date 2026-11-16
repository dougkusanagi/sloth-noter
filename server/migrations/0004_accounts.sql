-- Accounts with e-mail and password (ADR 0024). The server never sees the password:
-- it keeps SHA-256 of a key derived from it, and the note key wrapped by another one.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  auth_hash TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Single-use invite codes, stored only as SHA-256.
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_by TEXT REFERENCES accounts(id),
  used_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE TABLE account_notes (
  space_id TEXT NOT NULL REFERENCES accounts(id),
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  hash TEXT NOT NULL,
  deleted INTEGER NOT NULL,
  envelope TEXT,
  seq INTEGER NOT NULL,
  PRIMARY KEY (space_id, id),
  UNIQUE (space_id, seq)
);

CREATE TABLE account_blob_sizes (
  space_id TEXT NOT NULL REFERENCES accounts(id),
  sha TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (space_id, sha)
);
