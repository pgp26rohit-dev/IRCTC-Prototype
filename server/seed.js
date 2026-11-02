import db from './db.js'

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
console.log('SQLite tables:')
for (const { name } of tables) console.log(`- ${name}`)

const rows = db.prepare(`SELECT b.pnr, b.destination, u.full_name,
  json_extract(u.consent_flags, '$.ai_recommendations') AS ai_recommendations,
  json_extract(u.consent_flags, '$.ondc_cab_sharing') AS ondc_cab_sharing,
  json_extract(u.consent_flags, '$.location_tracking') AS location_tracking
  FROM bookings b JOIN users u ON u.id = b.user_id ORDER BY b.pnr`).all()
console.log('\nMock query: bookings joined with user consent flags')
console.table(rows)
db.close()
