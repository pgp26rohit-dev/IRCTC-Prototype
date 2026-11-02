# IRCTC Digital Platform prototype

A local full-stack travel companion prototype built with React, Tailwind CSS, Express, and SQLite. The app includes sample journeys for a senior traveller to Varanasi, a corporate traveller to Mumbai, and a family travelling to Goa.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The Express API runs on port 3001 and Vite proxies `/api` requests to it. Use these sample PNRs:

| Traveller | PNR |
| --- | --- |
| Meera Sharma · Varanasi | `2458901234` |
| Arjun Mehta · Mumbai | `2458901235` |
| Ananya Rao · Goa | `2458901236` |

SQLite creates `irctc.sqlite` in the project root on first start. The database is seeded once when the `users` table is empty. To serve a production build from Express, run `npm run build` and start with `NODE_ENV=production npm start`.

## Share a free hosted demo

This repository includes a Render Blueprint in `render.yaml`. To publish it:

1. Push this project to a GitHub repository (do not commit `.env` or API keys).
2. Sign in to Render and choose **New → Blueprint**.
3. Connect the GitHub repository and deploy the `irctc-yatra-demo` service from `render.yaml`.
4. Open the generated `onrender.com` URL and try the sample PNR `2458901234`.

The free Render web service can take about a minute to wake after 15 minutes without traffic. Its filesystem is temporary, so sample data is reseeded when the service starts and changes to bookings or consent can be lost after sleep, restart, or deploy. This is suitable for showing the prototype, not for preserving real user data. Optional Gemini and Maps keys can be added as Render environment variables; keep them out of the repository.

## Optional Google APIs

Copy `.env.example` to `.env` and add server-side keys:

- `GEMINI_API_KEY` enables streamed itinerary generation with Gemini and Google Search grounding. The local sample itinerary remains available without a key.
- `GOOGLE_MAPS_API_KEY` enables live nearby hotel listings through Places API (New), plus driving distances and times from the destination station through Routes API. Sample listings and estimates remain available without a key.

Enable Places API (New) and Routes API in the Google Cloud project for the Maps key. The API keys are read by the backend only and are not sent to the React client. Gemini itinerary generation only sends the destination and relevant preferences after AI recommendations consent is enabled; it does not send the PNR or traveller name. Station distances are requested together with one Compute Route Matrix call per hotel-search request.

## API

- `GET /api/booking/:pnr` returns booking, passenger, preferences, consent and journey telemetry.
- `GET /api/recommendations/:pnr` filters destination and hotel preferences, and requires third-party offers consent. Cab recommendations additionally require station-arrival sharing consent.
- `POST /api/user/consent` updates the supported granular consent flags for a PNR.
- `POST /api/ai-plan` streams a personalized two-day station-aware itinerary as server-sent events. It uses the included local itinerary generator and does not require an external AI API key.
