import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const db = new Database(path.join(root, 'irctc.sqlite'))
db.pragma('journal_mode = WAL')
db.exec(readFileSync(path.join(root, 'schema.sql'), 'utf8'))
const addColumnIfMissing = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((entry) => entry.name)
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
addColumnIfMissing('users', 'booker_name', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('bookings', 'class_code', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('hotels', 'family_rooms', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('hotels', 'vegetarian_options', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('hotels', 'accessible', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('hotels', 'free_cancellation', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('demo_payments', 'ticket_amount', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('demo_payments', 'items_json', "TEXT NOT NULL DEFAULT '[]'")
db.exec('UPDATE demo_payments SET ticket_amount=amount WHERE ticket_amount=0')

const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
if (userCount === 0) {
  const seed = db.transaction(() => {
    const addUser = db.prepare(`INSERT INTO users (id, full_name, age, gender, booker_name, language_pref, travel_segment, consent_flags)
      VALUES (@id,@full_name,@age,@gender,@booker_name,@language_pref,@travel_segment,@consent_flags)`)
    const addPrefs = db.prepare('INSERT INTO user_preferences VALUES (@user_id,@dietary_pref,@hotel_tier_pref,@transit_mode_pref)')
    const addBooking = db.prepare(`INSERT INTO bookings (pnr,user_id,train_name,origin,destination,travel_date,seat_number,status,class_code)
      VALUES (@pnr,@user_id,@train_name,@origin,@destination,@travel_date,@seat_number,@status,@class_code)`)
    const addTelemetry = db.prepare('INSERT INTO journey_telemetry VALUES (@booking_id,@co_travelers_count,@co_traveler_demographics,@lead_time_days)')
    const users = [
      { id: 1, full_name: 'Ananya Iyer', age: 29, gender: 'Not specified', booker_name: '', language_pref: 'English', travel_segment: 'Frequent traveller', consent_flags: '{}' },
      { id: 2, full_name: 'Ramesh Agarwal', age: 66, gender: 'Not specified', booker_name: 'Rohit Agarwal', language_pref: 'Hindi', travel_segment: 'Senior traveller · proxy booked', consent_flags: '{}' },
      { id: 3, full_name: 'Meera Kulkarni', age: 41, gender: 'Not specified', booker_name: '', language_pref: 'Marathi', travel_segment: 'Family traveller', consent_flags: '{}' },
      { id: 4, full_name: 'Raju Paswan', age: 26, gender: 'Not specified', booker_name: '', language_pref: 'Hindi', travel_segment: 'Budget traveller', consent_flags: '{}' },
    ]
    const prefs = [
      { user_id: 1, dietary_pref: 'No preference', hotel_tier_pref: 'Comfort', transit_mode_pref: 'Cab' },
      { user_id: 2, dietary_pref: 'Vegetarian', hotel_tier_pref: 'Value', transit_mode_pref: 'Wheelchair accessible' },
      { user_id: 3, dietary_pref: 'Vegetarian', hotel_tier_pref: 'Family', transit_mode_pref: 'Cab' },
      { user_id: 4, dietary_pref: 'No preference', hotel_tier_pref: 'Value', transit_mode_pref: 'Public transport' },
    ]
    const bookings = [
      { pnr: '2458901234', user_id: 1, train_name: 'Sample Vande Bharat Express', origin: 'Bengaluru', destination: 'Mysuru', travel_date: '2026-11-04', seat_number: 'Demo · CC · seat not assigned', class_code: 'CC', status: 'Sample booking' },
      { pnr: '2458901235', user_id: 2, train_name: 'Sample Pilgrimage Express', origin: 'Indore', destination: 'Varanasi', travel_date: '2026-11-08', seat_number: 'Demo · 3A · seat not assigned', class_code: '3A', status: 'Sample booking' },
      { pnr: '2458901236', user_id: 3, train_name: 'Sample Family Express', origin: 'Nagpur', destination: 'Goa', travel_date: '2026-11-12', seat_number: 'Demo · SL · seat not assigned', class_code: 'SL', status: 'Sample booking' },
      { pnr: '2458901237', user_id: 4, train_name: 'Sample Ghar Wapsi Express', origin: 'Darbhanga', destination: 'Surat', travel_date: '2026-11-18', seat_number: 'Demo · SL · seat not assigned', class_code: 'SL', status: 'Sample booking' },
    ]
    users.forEach((user) => addUser.run(user));
    prefs.forEach((preference) => addPrefs.run(preference));
    bookings.forEach((b, i) => {
      addBooking.run(b)
      addTelemetry.run({ booking_id: b.pnr, co_travelers_count: [2, 1, 3, 0][i], co_traveler_demographics: JSON.stringify([['2 friends'], ['Sushila Agarwal (61)'], ['3 family members (ages not stored)'], []][i]), lead_time_days: [21, 12, 18, 8][i] })
    })
    const hotel = db.prepare('INSERT INTO hotels (city,name,rating,price,distance_from_station,tier) VALUES (?,?,?,?,?,?)')
    ;[
      ['Varanasi','Ganges View Residency',4.7,4200,1.2,'Comfort'],['Varanasi','BrijRama Palace',4.9,18500,2.8,'Premium'],['Varanasi','Kashi Comfort Inn',4.2,2400,0.8,'Value'],
      ['Mumbai Central','The Fern Residency',4.5,6800,1.1,'Premium'],['Mumbai Central','Bloom Hotel',4.3,3900,0.7,'Comfort'],
      ['Madgaon, Goa','Coconut Grove Family Stay',4.6,5100,3.4,'Family'],['Madgaon, Goa','The Postcard Cuelim',4.8,14500,8.2,'Premium'],
      ['Mysuru','Mysuru Central Stay',4.4,3100,1.6,'Comfort'],['Varanasi','Ganga Guest House',4.2,2100,1.4,'Value'],
      ['Goa','Konkan Family Stay',4.5,4800,2.4,'Family'],['Surat','Surat Station Lodge',4.0,1800,1.0,'Value'],
      ['Mumbai Central','Dadar Budget Rooms',4.0,2200,2.7,'Value'],['Chennai','Central Park Chennai',4.3,3900,1.8,'Comfort'],
      ['Madurai','Temple City Residency',4.4,3200,1.3,'Comfort'],['Indore','Rajwada Comfort Inn',4.2,2600,2.1,'Value'],
    ].forEach((row) => hotel.run(...row))
    const cab = db.prepare('INSERT INTO cabs (city,vehicle_type,fare,eta_minutes) VALUES (?,?,?,?)')
    ;[
      ['Varanasi','Accessible cab',650,8],['Varanasi','Electric sedan',420,5],['Mumbai Central','Premium sedan',780,7],['Mumbai Central','Electric hatchback',490,4],['Madgaon, Goa','Family SUV',1050,12],['Madgaon, Goa','Electric sedan',620,9],
      ['Mysuru','Electric hatchback',340,6],['Goa','Family SUV',980,10],['Surat','Shared station cab',260,9],['Chennai','Accessible sedan',590,7],['Madurai','Accessible van',720,10],['Indore','Compact cab',380,6],
    ].forEach((row) => cab.run(...row))
  })
  seed()
}
db.exec(`UPDATE hotels SET family_rooms=CASE WHEN tier='Family' THEN 1 ELSE family_rooms END,
  vegetarian_options=CASE WHEN tier IN ('Family','Value') THEN 1 ELSE vegetarian_options END,
  accessible=CASE WHEN city IN ('Varanasi','Madurai') THEN 1 ELSE accessible END,
  free_cancellation=CASE WHEN tier IN ('Comfort','Family') THEN 1 ELSE free_cancellation END`)

// Replace the original starter personas once, while preserving any other local records.
const personaMigration = 'brd-personas-and-routes-v1'
if (!db.prepare('SELECT 1 FROM prototype_migrations WHERE id=?').get(personaMigration)) {
  const personas = [
    { pnr: '2458901234', full_name: 'Ananya Iyer', age: 29, language_pref: 'English', travel_segment: 'Frequent traveller', booker_name: '', dietary_pref: 'No preference', hotel_tier_pref: 'Comfort', transit_mode_pref: 'Cab', train_name: 'Sample Vande Bharat Express', origin: 'Bengaluru', destination: 'Mysuru', travel_date: '2026-11-04', class_code: 'CC', passengers: 3, co_traveler_demographics: ['2 friends'], lead_time_days: 21 },
    { pnr: '2458901235', full_name: 'Ramesh Agarwal', age: 66, language_pref: 'Hindi', travel_segment: 'Senior traveller · proxy booked', booker_name: 'Rohit Agarwal', dietary_pref: 'Vegetarian', hotel_tier_pref: 'Value', transit_mode_pref: 'Wheelchair accessible', train_name: 'Sample Pilgrimage Express', origin: 'Indore', destination: 'Varanasi', travel_date: '2026-11-08', class_code: '3A', passengers: 2, co_traveler_demographics: ['Sushila Agarwal (61)'], lead_time_days: 12 },
    { pnr: '2458901236', full_name: 'Meera Kulkarni', age: 41, language_pref: 'Marathi', travel_segment: 'Family traveller', booker_name: '', dietary_pref: 'Vegetarian', hotel_tier_pref: 'Family', transit_mode_pref: 'Cab', train_name: 'Sample Family Express', origin: 'Nagpur', destination: 'Goa', travel_date: '2026-11-12', class_code: 'SL', passengers: 4, co_traveler_demographics: ['3 family members (ages not stored)'], lead_time_days: 18 },
    { pnr: '2458901237', full_name: 'Raju Paswan', age: 26, language_pref: 'Hindi', travel_segment: 'Budget traveller', booker_name: '', dietary_pref: 'No preference', hotel_tier_pref: 'Value', transit_mode_pref: 'Public transport', train_name: 'Sample Ghar Wapsi Express', origin: 'Darbhanga', destination: 'Surat', travel_date: '2026-11-18', class_code: 'SL', passengers: 1, co_traveler_demographics: [], lead_time_days: 8 },
  ]
  const sampleTicketAmounts = { '2458901234': 780, '2458901235': 1520, '2458901236': 3880, '2458901237': 720 }
  const applyPersonaMigration = db.transaction(() => {
    let nextUserId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users').get().next_id
    for (const persona of personas) {
      const currentBooking = db.prepare('SELECT user_id FROM bookings WHERE pnr=?').get(persona.pnr)
      const userId = currentBooking?.user_id ?? nextUserId++
      if (currentBooking) {
        db.prepare(`UPDATE users SET full_name=?,age=?,gender='Not specified',booker_name=?,language_pref=?,travel_segment=?,consent_flags='{}' WHERE id=?`)
          .run(persona.full_name, persona.age, persona.booker_name, persona.language_pref, persona.travel_segment, userId)
        db.prepare('UPDATE user_preferences SET dietary_pref=?,hotel_tier_pref=?,transit_mode_pref=? WHERE user_id=?')
          .run(persona.dietary_pref, persona.hotel_tier_pref, persona.transit_mode_pref, userId)
        if (!db.prepare('SELECT 1 FROM user_preferences WHERE user_id=?').get(userId)) db.prepare('INSERT INTO user_preferences VALUES (?,?,?,?)').run(userId, persona.dietary_pref, persona.hotel_tier_pref, persona.transit_mode_pref)
        db.prepare(`UPDATE bookings SET train_name=?,origin=?,destination=?,travel_date=?,seat_number=?,class_code=?,status='Sample booking' WHERE pnr=?`)
          .run(persona.train_name, persona.origin, persona.destination, persona.travel_date, `Demo · ${persona.class_code} · seat not assigned`, persona.class_code, persona.pnr)
        if (db.prepare('SELECT 1 FROM journey_telemetry WHERE booking_id=?').get(persona.pnr)) {
          db.prepare('UPDATE journey_telemetry SET co_travelers_count=?,co_traveler_demographics=?,lead_time_days=? WHERE booking_id=?')
            .run(persona.passengers - 1, JSON.stringify(persona.co_traveler_demographics), persona.lead_time_days, persona.pnr)
        } else db.prepare('INSERT INTO journey_telemetry VALUES (?,?,?,?)').run(persona.pnr, persona.passengers - 1, JSON.stringify(persona.co_traveler_demographics), persona.lead_time_days)
      } else {
        db.prepare(`INSERT INTO users (id,full_name,age,gender,booker_name,language_pref,travel_segment,consent_flags) VALUES (?,?,?,'Not specified',?,?,?,'{}')`)
          .run(userId, persona.full_name, persona.age, persona.booker_name, persona.language_pref, persona.travel_segment)
        db.prepare('INSERT INTO user_preferences VALUES (?,?,?,?)').run(userId, persona.dietary_pref, persona.hotel_tier_pref, persona.transit_mode_pref)
        db.prepare('INSERT INTO bookings (pnr,user_id,train_name,origin,destination,travel_date,seat_number,status,class_code) VALUES (?,?,?,?,?,?,?,\'Sample booking\',?)')
          .run(persona.pnr, userId, persona.train_name, persona.origin, persona.destination, persona.travel_date, `Demo · ${persona.class_code} · seat not assigned`, persona.class_code)
        db.prepare('INSERT INTO journey_telemetry VALUES (?,?,?,?)').run(persona.pnr, persona.passengers - 1, JSON.stringify(persona.co_traveler_demographics), persona.lead_time_days)
      }
      db.prepare(`INSERT OR IGNORE INTO demo_payments (pnr,gateway,method,amount,status)
        VALUES (?,'Local demo checkout','UPI',?,'SIMULATED_SUCCESS')`).run(persona.pnr, sampleTicketAmounts[persona.pnr])
    }
    const extraHotels = [
      ['Mysuru','Mysuru Central Stay',4.4,3100,1.6,'Comfort'],['Goa','Konkan Family Stay',4.5,4800,2.4,'Family'],['Surat','Surat Station Lodge',4.0,1800,1.0,'Value'],['Chennai','Central Park Chennai',4.3,3900,1.8,'Comfort'],['Madurai','Temple City Residency',4.4,3200,1.3,'Comfort'],['Indore','Rajwada Comfort Inn',4.2,2600,2.1,'Value'],
    ]
    const addHotel = db.prepare('INSERT INTO hotels (city,name,rating,price,distance_from_station,tier) VALUES (?,?,?,?,?,?)')
    for (const row of extraHotels) if (!db.prepare('SELECT 1 FROM hotels WHERE city=? LIMIT 1').get(row[0])) addHotel.run(...row)
    const extraCabs = [['Mysuru','Electric hatchback',340,6],['Goa','Family SUV',980,10],['Surat','Shared station cab',260,9],['Chennai','Accessible sedan',590,7],['Madurai','Accessible van',720,10],['Indore','Compact cab',380,6]]
    const addCab = db.prepare('INSERT INTO cabs (city,vehicle_type,fare,eta_minutes) VALUES (?,?,?,?)')
    for (const row of extraCabs) if (!db.prepare('SELECT 1 FROM cabs WHERE city=? LIMIT 1').get(row[0])) addCab.run(...row)
    db.prepare('INSERT INTO prototype_migrations (id) VALUES (?)').run(personaMigration)
  })
  applyPersonaMigration()
}

const paymentSeedMigration = 'sample-ticket-payments-v1'
if (!db.prepare('SELECT 1 FROM prototype_migrations WHERE id=?').get(paymentSeedMigration)) {
  const insertSamplePayment = db.prepare(`INSERT OR IGNORE INTO demo_payments (pnr,gateway,method,amount,status)
    VALUES (?,'Local demo checkout','UPI',?,'SIMULATED_SUCCESS')`)
  ;[['2458901234',780],['2458901235',1520],['2458901236',3880],['2458901237',720]].forEach(([pnr,amount]) => {
    if (db.prepare('SELECT 1 FROM bookings WHERE pnr=?').get(pnr)) insertSamplePayment.run(pnr, amount)
  })
  db.prepare('INSERT INTO prototype_migrations (id) VALUES (?)').run(paymentSeedMigration)
}

// Upgrade consent JSON from earlier prototype versions without changing user choices.
const migrateConsent = db.prepare('UPDATE users SET consent_flags=? WHERE id=?')
for (const user of db.prepare('SELECT id, consent_flags FROM users').all()) {
  const flags = JSON.parse(user.consent_flags || '{}')
  const canonical = {
    location_tracking: flags.location_tracking ?? flags.station_arrival_sharing ?? false,
    ondc_cab_sharing: flags.ondc_cab_sharing ?? flags.station_arrival_sharing ?? false,
    ai_recommendations: flags.ai_recommendations ?? flags.third_party_offers ?? false,
  }
  if (JSON.stringify(flags) !== JSON.stringify(canonical)) migrateConsent.run(JSON.stringify(canonical), user.id)
}
db.exec('UPDATE demo_payments SET ticket_amount=amount WHERE ticket_amount=0')

export default db
