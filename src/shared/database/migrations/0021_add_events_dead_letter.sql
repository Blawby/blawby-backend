-- Events Dead Letter Table Migration
-- Stores events that have exceeded max retries for manual inspection

CREATE TABLE IF NOT EXISTS events_dead_letter (
  id SERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT '1.0.0',
  actor_id UUID NOT NULL,
  actor_type TEXT NOT NULL,
  organization_id UUID,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL,
  last_error TEXT,
  retry_count INTEGER NOT NULL,
  failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  original_created_at TIMESTAMP NOT NULL
);

-- Index for looking up by original event ID
CREATE INDEX idx_events_dead_letter_event_id ON events_dead_letter(event_id);

-- Index for filtering by event type
CREATE INDEX idx_events_dead_letter_event_type ON events_dead_letter(event_type);

-- Index for querying recent failures
CREATE INDEX idx_events_dead_letter_failed_at ON events_dead_letter(failed_at);

-- Index for filtering by organization
CREATE INDEX idx_events_dead_letter_organization_id ON events_dead_letter(organization_id);
