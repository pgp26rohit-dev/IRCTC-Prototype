import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomInt } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import db from './db.js'

const app = express()
const port = process.env.PORT || 3001
app.use(cors())
app.use(express.json())

const bookingQuery = db.prepare(`SELECT b.*, u.full_name, u.age, u.gender, u.booker_name, u.language_pref, u.travel_segment, u.consent_flags,
  COALESCE((SELECT COALESCE(p.ticket_amount,p.amount) FROM demo_payments p WHERE p.pnr=b.pnr ORDER BY p.id DESC LIMIT 1),0) AS ticket_amount,
  COALESCE((SELECT p.amount FROM demo_payments p WHERE p.pnr=b.pnr ORDER BY p.id DESC LIMIT 1),0) AS payment_total,
  COALESCE((SELECT p.items_json FROM demo_payments p WHERE p.pnr=b.pnr ORDER BY p.id DESC LIMIT 1),'[]') AS paid_addons_json,
  p.dietary_pref, p.hotel_tier_pref, p.transit_mode_pref,
  j.co_travelers_count, j.co_traveler_demographics, j.lead_time_days
  FROM bookings b JOIN users u ON u.id=b.user_id
  LEFT JOIN user_preferences p ON p.user_id=u.id
  LEFT JOIN journey_telemetry j ON j.booking_id=b.pnr WHERE b.pnr=?`)
function hydrate(row) {
  if (!row) return null
  const savedConsent = JSON.parse(row.consent_flags || '{}')
  const consent_flags = {
    location_tracking: savedConsent.location_tracking ?? savedConsent.station_arrival_sharing ?? false,
    ondc_cab_sharing: savedConsent.ondc_cab_sharing ?? savedConsent.station_arrival_sharing ?? false,
    ai_recommendations: savedConsent.ai_recommendations ?? savedConsent.third_party_offers ?? false,
    push_marketing: savedConsent.push_marketing ?? false,
    sms_marketing: savedConsent.sms_marketing ?? false,
    whatsapp_marketing: savedConsent.whatsapp_marketing ?? false,
    email_marketing: savedConsent.email_marketing ?? false,
  }
  return { ...row, consent_flags, co_traveler_demographics: JSON.parse(row.co_traveler_demographics || '[]'), paid_addons: JSON.parse(row.paid_addons_json || '[]') }
}

app.get('/api/booking/:pnr', (req, res) => {
  const booking = hydrate(bookingQuery.get(req.params.pnr))
  if (!booking) return res.status(404).json({ error: 'We could not find that PNR. Check the number and try again.' })
  res.json({ booking, live_status: { label: 'On time', detail: 'Expected to depart on schedule', updated_at: new Date().toISOString(), platform: 'Platform 4' } })
})

const demoTrains = new Map([
  ['12952', { name: 'Sample Rajdhani Express', from: 'New Delhi', to: 'Mumbai Central', classes: ['3A', '2A', '1A'], fare: 2150 }],
  ['12560', { name: 'Sample Kashi Express', from: 'New Delhi', to: 'Varanasi', classes: ['SL', '3A', '2A'], fare: 1120 }],
  ['17309', { name: 'Sample Goa Express', from: 'Bengaluru', to: 'Goa', classes: ['SL', '3A', '2A'], fare: 890 }],
  ['12954', { name: 'Sample August Kranti Rajdhani', from: 'New Delhi', to: 'Mumbai Central', classes: ['3A', '2A', '1A'], fare: 2320 }],
  ['22436', { name: 'Sample Vande Bharat Express', from: 'New Delhi', to: 'Varanasi', classes: ['CC', 'EC'], fare: 1795 }],
  ['DM101', { name: 'Sample Vande Bharat Express', from: 'Bengaluru', to: 'Mysuru', classes: ['CC', 'EC'], fare: 650 }],
  ['DM102', { name: 'Sample Intercity Express', from: 'Bengaluru', to: 'Mysuru', classes: ['2S', 'CC'], fare: 280 }],
  ['DM201', { name: 'Sample Pilgrimage Express', from: 'Indore', to: 'Varanasi', classes: ['SL', '3A', '2A'], fare: 1050 }],
  ['DM202', { name: 'Sample Central India Connect', from: 'Indore', to: 'Varanasi', classes: ['SL', '3A'], fare: 890 }],
  ['DM301', { name: 'Sample Family Express', from: 'Nagpur', to: 'Goa', classes: ['SL', '3A', '2A'], fare: 970 }],
  ['DM302', { name: 'Sample Konkan Connect', from: 'Nagpur', to: 'Goa', classes: ['SL', '3A'], fare: 1120 }],
  ['DM401', { name: 'Sample Ghar Wapsi Special', from: 'Darbhanga', to: 'Surat', classes: ['SL', '3A'], fare: 720 }],
  ['DM402', { name: 'Sample Mithila–Surat Express', from: 'Darbhanga', to: 'Surat', classes: ['SL', '3A'], fare: 760 }],
  ['DM403', { name: 'Sample Darbhanga–Mumbai Express', from: 'Darbhanga', to: 'Mumbai Central', classes: ['SL', '3A'], fare: 690 }],
  ['DM501', { name: 'Sample Vidarbha Express', from: 'Nagpur', to: 'Mumbai Central', classes: ['SL', '3A', '2A'], fare: 640 }],
  ['DM601', { name: 'Sample Pandian Express', from: 'Madurai', to: 'Chennai', classes: ['SL', '3A', '2A'], fare: 530 }],
])
const paymentClassFactor = { '2S': 1, SL: 1, '3A': 1.45, '2A': 1.9, '1A': 2.5, CC: 1.3, EC: 2.3 }

app.post('/api/demo-bookings', (req, res) => {
  const { train_number, origin, destination, travel_date, full_name, booker_name, age, gender, language_pref, passengers, class_code, payment_method, addons = {} } = req.body || {}
  const train = demoTrains.get(String(train_number || ''))
  const parsedAge = Number(age)
  const passengerCount = Number(passengers)
  const parsedTravelDate = new Date(`${travel_date || ''}T00:00:00Z`)
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(String(travel_date || '')) && !Number.isNaN(parsedTravelDate.getTime()) && parsedTravelDate.toISOString().slice(0, 10) === travel_date
  const today = new Date().toISOString().slice(0, 10)
  if (!train || train.from !== origin || train.to !== destination) return res.status(400).json({ error: 'Choose a train from the available sample results.' })
  if (!train.classes.includes(class_code)) return res.status(400).json({ error: 'Choose an available travel class for this train.' })
  if (typeof full_name !== 'string' || full_name.trim().length < 2 || full_name.trim().length > 100) return res.status(400).json({ error: 'Enter the passenger’s full name.' })
  if (booker_name && (typeof booker_name !== 'string' || booker_name.trim().length > 100)) return res.status(400).json({ error: 'Enter a valid booker name.' })
  if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120) return res.status(400).json({ error: 'Enter a valid passenger age.' })
  if (!['Female', 'Male', 'Prefer not to say'].includes(gender)) return res.status(400).json({ error: 'Choose a gender option.' })
  if (!['English', 'Hindi', 'Marathi'].includes(language_pref)) return res.status(400).json({ error: 'Choose an available language.' })
  if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 6) return res.status(400).json({ error: 'Choose between 1 and 6 passengers.' })
  if (!['UPI', 'Card', 'Net banking', 'Yatra Wallet'].includes(payment_method)) return res.status(400).json({ error: 'Choose a demo payment method.' })
  if (!addons || typeof addons !== 'object' || Array.isArray(addons) || (addons.luggage_storage !== undefined && typeof addons.luggage_storage !== 'boolean')) return res.status(400).json({ error: 'Choose valid sample trip add-ons.' })
  if (!dateIsValid || travel_date < today) return res.status(400).json({ error: 'Choose a valid travel date that is today or later.' })
  const fareFactor = (paymentClassFactor[class_code] || 1) / (paymentClassFactor[train.classes[0]] || 1)
  const ticketAmount = Math.round(train.fare * fareFactor * passengerCount / 10) * 10
  const paidAddons = []
  if (addons.hotel_id !== undefined && addons.hotel_id !== null) {
    const hotel = db.prepare('SELECT id,city,name,price FROM hotels WHERE id=? AND city=?').get(Number(addons.hotel_id), destination)
    if (!hotel) return res.status(400).json({ error: 'That sample stay is not available for this destination.' })
    paidAddons.push({ type: 'stay', id: hotel.id, name: hotel.name, amount: hotel.price })
  }
  if (addons.cab_id !== undefined && addons.cab_id !== null) {
    const cab = db.prepare('SELECT id,city,vehicle_type,fare FROM cabs WHERE id=? AND city=?').get(Number(addons.cab_id), destination)
    if (!cab) return res.status(400).json({ error: 'That sample ride is not available for this destination.' })
    paidAddons.push({ type: 'pickup', id: cab.id, name: cab.vehicle_type, amount: cab.fare })
  }
  if (addons.luggage_storage) paidAddons.push({ type: 'luggage', id: 'luggage-storage', name: 'Luggage storage / early check-in', amount: 250 })
  const totalAmount = ticketAmount + paidAddons.reduce((sum, item) => sum + item.amount, 0)

  try {
    const createDemoBooking = db.transaction(() => {
      const userId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users').get().next_id
      let pnr
      do { pnr = String(randomInt(1_000_000_000, 10_000_000_000)) } while (db.prepare('SELECT 1 FROM bookings WHERE pnr=?').get(pnr))
      const travelSegment = parsedAge >= 60 ? 'Senior traveller' : passengerCount > 1 ? 'Family traveller' : 'Leisure traveller'
      db.prepare(`INSERT INTO users (id, full_name, age, gender, booker_name, language_pref, travel_segment, consent_flags)
        VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`).run(userId, full_name.trim(), parsedAge, gender, booker_name?.trim() || '', language_pref, travelSegment)
      db.prepare('INSERT INTO user_preferences (user_id,dietary_pref,hotel_tier_pref,transit_mode_pref) VALUES (?,?,?,?)')
        .run(userId, 'No preference', 'Comfort', 'Any')
      db.prepare('INSERT INTO bookings (pnr,user_id,train_name,origin,destination,travel_date,seat_number,status,class_code) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(pnr, userId, train.name, origin, destination, travel_date, `Demo · ${class_code} · seat not assigned`, 'Sample booking', class_code)
      db.prepare('INSERT INTO journey_telemetry (booking_id,co_travelers_count,co_traveler_demographics,lead_time_days) VALUES (?,?,?,?)')
        .run(pnr, passengerCount - 1, JSON.stringify(passengerCount > 1 ? [`${passengerCount - 1} additional traveller${passengerCount > 2 ? 's' : ''}`] : []), Math.max(0, Math.floor((Date.parse(`${travel_date}T00:00:00Z`) - Date.now()) / 86400000)))
      db.prepare('INSERT INTO demo_payments (pnr,gateway,method,amount,ticket_amount,items_json,status) VALUES (?,?,?,?,?,?,?)')
        .run(pnr, 'Local demo checkout (Razorpay selected for future integration)', payment_method, totalAmount, ticketAmount, JSON.stringify(paidAddons), 'SIMULATED_SUCCESS')
      return pnr
    })
    const pnr = createDemoBooking()
    res.status(201).json({ pnr, status: 'Sample booking', addons: paidAddons, payment: { provider: 'Local demo checkout', method: payment_method, amount: totalAmount, ticket_amount: ticketAmount, addon_amount: totalAmount - ticketAmount, status: 'Simulated success' }, message: 'Demo only: no IRCTC reservation or payment was made.' })
  } catch (error) {
    console.error('Could not create local demo booking:', error.message)
    res.status(500).json({ error: 'Could not save the demo booking. Please try again.' })
  }
})

const routeCache = new Map()
const stationAddresses = {
  Varanasi: 'Varanasi Junction railway station, Varanasi, India',
  'Mumbai Central': 'Mumbai Central railway station, Mumbai, India',
  'Madgaon, Goa': 'Madgaon railway station, Goa, India',
}

async function addGoogleRouteDistances(hotels, city) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return hotels.map((hotel) => ({ ...hotel, distance_text: `${hotel.distance_from_station} km · estimate`, distance_source: 'Sample estimate' }))
  try {
    const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration' },
      body: JSON.stringify({
        origins: [{ waypoint: { address: stationAddresses[city] || `${city} railway station, India` } }],
        destinations: hotels.map((hotel) => ({ waypoint: hotel.location?.latitude
          ? { location: { latLng: hotel.location } }
          : { address: `${hotel.name}, ${hotel.city}, India` } })),
        travelMode: 'DRIVE', languageCode: 'en-IN', units: 'METRIC',
      }),
      signal: AbortSignal.timeout(7000),
    })
    if (!response.ok) throw new Error(`Routes API returned ${response.status}`)
    const matrix = await response.json()
    return hotels.map((hotel, index) => {
      const route = matrix.find((entry) => entry.destinationIndex === index && entry.condition === 'ROUTE_EXISTS')
      if (!route?.distanceMeters) return { ...hotel, distance_text: 'Distance unavailable', distance_source: 'Unavailable' }
      return {
        ...hotel,
        distance_from_station: Math.round((route.distanceMeters / 1000) * 10) / 10,
        distance_text: `${(route.distanceMeters / 1000).toFixed(1)} km · driving route`,
        duration_text: route.duration ? `${Math.max(1, Math.round(parseFloat(route.duration) / 60))} min drive` : null,
        distance_source: 'Google Maps Routes',
      }
    })
  } catch (error) {
    console.warn(`Could not calculate station distances in ${city}: ${error.message}`)
    return hotels.map((hotel) => ({ ...hotel, distance_text: Number.isFinite(hotel.distance_from_station) ? `${hotel.distance_from_station} km · estimate` : 'Distance unavailable', distance_source: Number.isFinite(hotel.distance_from_station) ? 'Sample estimate' : 'Unavailable' }))
  }
}

async function findGoogleHotels(city, hotelTier) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null
  const tierText = hotelTier === 'Value' ? 'budget' : hotelTier === 'Premium' ? 'premium' : hotelTier === 'Family' ? 'family-friendly' : ''
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.location,places.googleMapsUri,places.websiteUri' },
    body: JSON.stringify({ textQuery: `${tierText} hotels near ${stationAddresses[city] || `${city}, India`}`, pageSize: 4, languageCode: 'en' }),
    signal: AbortSignal.timeout(6000),
  })
  if (!response.ok) throw new Error(`Places API returned ${response.status}`)
  const places = (await response.json()).places || []
  const hotels = places.map((place, index) => ({
    id: place.id || `google-${index}`,
    city,
    name: place.displayName?.text || 'Nearby stay',
    rating: place.rating || null,
    price: null,
    tier: hotelTier,
    location: place.location,
    address: place.formattedAddress || '',
    google_maps_url: place.googleMapsUri || '',
    website_url: place.websiteUri || '',
    distance_from_station: null,
  }))
  return hotels
}

app.get('/api/recommendations/:pnr', async (req, res) => {
  const booking = hydrate(bookingQuery.get(req.params.pnr))
  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  if (booking.age < 18) return res.json({ enabled: false, hotels: [], cabs: [], reason: 'Personalized offers are not shown for travellers under 18.' })
  if (!booking.ticket_amount) return res.json({ enabled: false, hotels: [], cabs: [], reason: 'Trip suggestions are available after the ticket payment step.' })
  if (!booking.consent_flags.ai_recommendations) return res.json({ enabled: false, hotels: [], cabs: [], reason: 'AI recommendations are turned off in your privacy settings.' })
  const sampleHotels = db.prepare(`SELECT id,city,name,rating,price,distance_from_station,tier,family_rooms,vegetarian_options,accessible,free_cancellation
    FROM hotels WHERE city=?
    ORDER BY CASE WHEN tier=? THEN 0 ELSE 1 END, rating DESC LIMIT 4`).all(booking.destination, booking.hotel_tier_pref)
  let hotelRows = sampleHotels
  let listingSource = 'sample'
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const liveHotels = await findGoogleHotels(booking.destination, booking.hotel_tier_pref)
      if (liveHotels?.length) { hotelRows = liveHotels; listingSource = 'google_places' }
    } catch (error) {
      console.warn(`Could not find live stays in ${booking.destination}: ${error.message}`)
    }
  }
  const hotels = await addGoogleRouteDistances(hotelRows, booking.destination)
  const cabs = booking.consent_flags.location_tracking && booking.consent_flags.ondc_cab_sharing
    ? db.prepare('SELECT id,city,vehicle_type,fare,eta_minutes FROM cabs WHERE city=? ORDER BY eta_minutes').all(booking.destination)
    : []
  res.json({ enabled: true, hotels, cabs, listing_source: listingSource, distance_provider: process.env.GOOGLE_MAPS_API_KEY ? 'google' : 'sample' })
})

// User-initiated sample catalogue searches do not use PNR preferences or call third parties.
app.get('/api/stays/:city', (req, res) => {
  const city = String(req.params.city || '').slice(0, 80)
  const hotels = db.prepare(`SELECT id,city,name,rating,price,distance_from_station,tier,family_rooms,vegetarian_options,accessible,free_cancellation
    FROM hotels WHERE city=? ORDER BY rating DESC`).all(city)
  res.json({ city, hotels, listing_source: 'sample', personalized: false })
})

app.get('/api/pickups/:city', (req, res) => {
  const city = String(req.params.city || '').slice(0, 80)
  const cabs = db.prepare('SELECT id,city,vehicle_type,fare,eta_minutes FROM cabs WHERE city=? ORDER BY eta_minutes').all(city)
  res.json({ city, cabs, listing_source: 'sample', personalized: false })
})

app.post('/api/user/consent', (req, res) => {
  const { pnr, consent_flags } = req.body || {}
  if (!pnr || !consent_flags || typeof consent_flags !== 'object' || Array.isArray(consent_flags)) return res.status(400).json({ error: 'Send a PNR and consent settings.' })
  const booking = hydrate(bookingQuery.get(String(pnr)))
  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  const allowed = ['location_tracking', 'ondc_cab_sharing', 'ai_recommendations', 'push_marketing', 'sms_marketing', 'whatsapp_marketing', 'email_marketing']
  const flags = { ...booking.consent_flags }
  const changed = []
  for (const key of allowed) if (typeof consent_flags[key] === 'boolean' && flags[key] !== consent_flags[key]) { flags[key] = consent_flags[key]; changed.push(key) }
  const saveConsent = db.transaction(() => {
    db.prepare('UPDATE users SET consent_flags=? WHERE id=?').run(JSON.stringify(flags), booking.user_id)
    const log = db.prepare('INSERT INTO consent_events (user_id,consent_key,enabled) VALUES (?,?,?)')
    for (const key of changed) log.run(booking.user_id, key, flags[key] ? 1 : 0)
  })
  saveConsent()
  res.json({ consent_flags: flags })
})

function makePlan(b) {
  const city = b.destination.replace(', Goa', '')
  const accessibility = /wheelchair/i.test(b.transit_mode_pref) ? 'Request an accessible cab and station assistance ahead of time.' : 'Choose a local cab or metro based on your preferred pace.'
  const family = b.travel_segment === 'Family traveller'
  const first = city === 'Varanasi'
    ? [{ time: '08:00', title: 'Ease into the old city', detail: 'Arrive, settle in, and take a relaxed transfer from the station.', tag: 'Arrival' }, { time: '10:30', title: 'Kashi Vishwanath corridor', detail: 'Explore the temple corridor at a gentle pace; reserve time for queues.', tag: 'Culture' }, { time: '17:00', title: 'Ganga aarti at Dashashwamedh Ghat', detail: 'Reach the ghat early for a comfortable riverside viewing spot.', tag: 'Local highlight' }]
    : city === 'Mumbai Central'
      ? [{ time: '09:00', title: 'Check in and reset', detail: 'Drop your bags near the station and take a short break.', tag: 'Arrival' }, { time: '11:00', title: 'Gateway of India', detail: 'Walk the waterfront and explore the Colaba heritage district.', tag: 'Culture' }, { time: '17:00', title: 'Marine Drive at sunset', detail: 'Wind down with a seaside walk and dinner nearby.', tag: 'Local highlight' }]
      : [{ time: '09:00', title: 'Arrive and get settled', detail: 'Check in, hydrate, and make your onward transfer comfortable.', tag: 'Arrival' }, { time: '11:30', title: family ? 'A day at Colva Beach' : 'Explore South Goa', detail: 'Enjoy a gentle beach morning with plenty of time to unwind.', tag: 'Outdoors' }, { time: '17:00', title: 'Sunset by the shore', detail: 'Find a relaxed spot for the evening and sample a local dinner.', tag: 'Local highlight' }]
  const second = city === 'Varanasi'
    ? [{ time: '06:00', title: 'Sunrise boat ride', detail: 'See the ghats wake up from the river; book with a licensed local operator.', tag: 'Local highlight' }, { time: '10:00', title: 'Sarnath', detail: 'Visit the archaeological site and museum, with a quiet lunch nearby.', tag: 'Culture' }, { time: '16:00', title: 'Free time and local crafts', detail: 'Browse at your own pace before an early dinner.', tag: 'Relaxed' }]
    : city === 'Mumbai Central'
      ? [{ time: '09:00', title: 'Chhatrapati Shivaji Maharaj Terminus', detail: 'Admire the landmark architecture and nearby Fort district.', tag: 'Culture' }, { time: '12:30', title: 'Lunch in Fort', detail: 'Try a neighbourhood café and keep the afternoon flexible.', tag: 'Food' }, { time: '16:00', title: 'Choose your city pace', detail: 'Explore Kala Ghoda galleries or take a quiet break at your hotel.', tag: 'Flexible' }]
      : [{ time: '09:00', title: 'A slow Goa morning', detail: 'Enjoy breakfast close to your stay and plan a low-key day.', tag: 'Relaxed' }, { time: '11:00', title: family ? 'Big Foot Museum & village walk' : 'Old Goa heritage', detail: 'Discover local history, with time for a shaded lunch.', tag: 'Culture' }, { time: '16:00', title: 'Beachside evening', detail: 'Wrap up with a sunset stroll and an easy ride back.', tag: 'Local highlight' }]
  return { title: `Two days in ${city}`, subtitle: `${b.train_name} · Arriving ${b.travel_date}`, arrival_tip: accessibility, days: [{ date_label: 'Day 1 · Arrival & first impressions', items: first }, { date_label: 'Day 2 · A little deeper', items: second }] }
}

app.post('/api/ai-plan', async (req, res) => {
  const { pnr } = req.body || {}
  const booking = hydrate(bookingQuery.get(String(pnr || '')))
  if (!booking) return res.status(404).json({ error: 'Booking not found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const sendText = (text) => {
    for (let i = 0; i < text.length; i += 72) {
      if (res.destroyed) return
      res.write(`data: ${JSON.stringify({ chunk: text.slice(i, i + 72) })}\n\n`)
    }
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (apiKey && booking.consent_flags.ai_recommendations) {
    try {
      const ai = new GoogleGenAI({ apiKey })
      const city = booking.destination
      const prompt = `Create a useful, relaxed 2-day itinerary for a train visitor to ${city}, arriving ${booking.travel_date}. Language preference: ${booking.language_pref}. Traveller context: ${booking.travel_segment}. Mobility preference: ${booking.transit_mode_pref}. Dietary preference: ${booking.dietary_pref}. Do not invent opening hours, train times, prices, live availability, or exact distances. Use practical travel pacing and account for the station arrival. Return ONLY valid JSON with this exact shape: {"title":"Two days in ${city}","subtitle":"A short helpful summary without personal names or PNRs","arrival_tip":"One practical arrival suggestion","days":[{"date_label":"Day 1 · Arrival and nearby highlights","items":[{"time":"09:00","title":"Activity","detail":"Helpful concise detail","tag":"Arrival"}]}]}. Include exactly two days and three items per day. Use 24-hour local time.`
      const stream = await ai.models.generateContentStream({
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.45, tools: [{ googleSearch: {} }] },
      })
      res.write(`data: ${JSON.stringify({ provider: 'Google Gemini + Search' })}\n\n`)
      const sources = new Map()
      for await (const chunk of stream) {
        if (chunk.text) sendText(chunk.text)
        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks || []
        for (const source of groundingChunks) {
          const web = source.web
          if (web?.uri) sources.set(web.uri, { title: web.title || 'Google Search result', uri: web.uri })
        }
      }
      if (sources.size && !res.destroyed) res.write(`data: ${JSON.stringify({ sources: [...sources.values()] })}\n\n`)
    } catch (error) {
      console.error('Gemini itinerary generation failed:', error.message)
      if (!res.destroyed) res.write(`data: ${JSON.stringify({ error: 'Google AI could not make the plan. Check the API key or try again.' })}\n\n`)
    }
  } else {
    // Local sample itinerary stays available until a Gemini key is configured.
    res.write(`data: ${JSON.stringify({ provider: 'Local guide' })}\n\n`)
    sendText(JSON.stringify(makePlan(booking)))
  }
  if (!res.destroyed) { res.write('data: [DONE]\n\n'); res.end() }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

if (process.env.NODE_ENV === 'production') {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  app.use(express.static(path.join(root, 'dist')))
  app.get('*path', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}

app.listen(port, () => console.log(`IRCTC prototype API listening on http://localhost:${port}`))
