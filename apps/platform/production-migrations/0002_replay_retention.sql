ALTER TABLE scores ADD COLUMN proof_expires_at TEXT;
ALTER TABLE scores ADD COLUMN proof_deleted_at TEXT;

UPDATE scores
SET proof_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+5 days')
WHERE proof_expires_at IS NULL;

CREATE INDEX score_proof_expiry
  ON scores (proof_expires_at)
  WHERE proof_deleted_at IS NULL;
