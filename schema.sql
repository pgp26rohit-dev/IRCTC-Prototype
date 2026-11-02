PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  booker_name TEXT NOT NULL DEFAULT '',
  language_pref TEXT NOT NULL DEFAULT 'English',
  travel_segment TEXT NOT NULL,
  consent_flags TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dietary_pref TEXT NOT NULL DEFAULT 'No preference',
  hotel_tier_pref TEXT NOT NULL DEFAULT 'Any',
  transit_mode_pref TEXT NOT NULL DEFAULT 'Any'
);
CREATE TABLE IF NOT EXISTS journey_telemetry (
  booking_id TEXT PRIMARY KEY,
  co_travelers_count INTEGER NOT NULL DEFAULT 0,
  co_traveler_demographics TEXT NOT NULL DEFAULT '[]',
  lead_time_days INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bookings (
  pnr TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  train_name TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  seat_number TEXT NOT NULL,
  class_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Confirmed'
);
CREATE TABLE IF NOT EXISTS hotels (
  id INTEGER PRIMARY KEY,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  rating REAL NOT NULL,
  price INTEGER NOT NULL,
  distance_from_station REAL NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Comfort',
  family_rooms INTEGER NOT NULL DEFAULT 0,
  vegetarian_options INTEGER NOT NULL DEFAULT 0,
  accessible INTEGER NOT NULL DEFAULT 0,
  free_cancellation INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cabs (
  id INTEGER PRIMARY KEY,
  city TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  fare INTEGER NOT NULL,
  eta_minutes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prototype_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS demo_payments (
  id INTEGER PRIMARY KEY,
  pnr TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  ticket_amount INTEGER NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS consent_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
