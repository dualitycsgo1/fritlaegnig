# Fritlægning (web)

Fritlæg CS2 HUD- og broadcast-spillerfotos i browseren. Upload, beskær, rotér, download PNG/WEBP med gennemsigtig baggrund — eller en ZIP af hele holdet.

Alt kører lokalt i browseren. Billeder uploades ikke til en server.

Desktop-appen (Python / rembg) ligger på `master`.

## Vercel

1. I dit Vercel-projekt: sæt **Production Branch** til `web`.
2. Framework Preset: Other (buildet skriver Vercel Output API under `npm run build`).
3. Build command: `npm run build`
4. Install command: `npm install`

Første fritlægning henter AI-modellen (cachet bagefter). RAW-filer understøttes ikke i browseren — konvertér til JPEG/PNG først.
