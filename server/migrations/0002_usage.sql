-- R2 usage kept by the Worker so it can stop before the free tier ends (ADR 0021).
-- One row per calendar month (UTC) for operations; `stored` is the total bytes in R2.
CREATE TABLE usage (
  month TEXT PRIMARY KEY,
  writes INTEGER NOT NULL DEFAULT 0,
  reads INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE blob_sizes (
  sha TEXT PRIMARY KEY,
  size INTEGER NOT NULL
);
