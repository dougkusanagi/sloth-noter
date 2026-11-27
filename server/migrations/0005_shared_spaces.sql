-- Shared spaces between accounts (ADR 0054).
-- Each account gets an ECDH P-256 key pair: public_key in clear, wrapped_private_key
-- encrypted by the account's wrapKey (same mechanism as wrapped_key).
ALTER TABLE accounts ADD COLUMN public_key TEXT;
ALTER TABLE accounts ADD COLUMN wrapped_private_key TEXT;

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE space_members (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  wrapped_space_key TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id, account_id)
);

CREATE TABLE space_invites (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES accounts(id),
  invitee_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  wrapped_space_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (space_id, invitee_id)
);

CREATE TABLE shared_space_notes (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  hash TEXT NOT NULL,
  deleted INTEGER NOT NULL,
  envelope TEXT,
  seq INTEGER NOT NULL,
  PRIMARY KEY (space_id, id),
  UNIQUE (space_id, seq)
);

CREATE TABLE shared_space_blob_sizes (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (space_id, sha)
);
