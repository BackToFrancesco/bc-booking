CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS bookings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(30),
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end   TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- status: 'pending' | 'approved' | 'confirmed' | 'rejected'

CREATE TABLE IF NOT EXISTS blocked_slots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end   TIMESTAMPTZ NOT NULL,
  reason     VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS day_schedules (
  day_of_week SMALLINT PRIMARY KEY,  -- 0=Sun, 1=Mon, ..., 6=Sat
  open_hour   SMALLINT NOT NULL,     -- 0-23
  close_hour  SMALLINT NOT NULL      -- 0-23, exclusive
);
INSERT INTO day_schedules (day_of_week, open_hour, close_hour) VALUES
  (0, 16, 23),
  (1, 18, 23),
  (2, 18, 23),
  (3, 18, 23),
  (4, 18, 23),
  (5, 18, 23),
  (6, 16, 23)
ON CONFLICT (day_of_week) DO NOTHING;
