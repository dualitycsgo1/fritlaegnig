# Fritlægning

Web-app til at fritlægge CS2 HUD- og broadcast-spillerfotos i browseren. Billederne forlader aldrig din maskine.

- **`web` branch** — denne app (Vercel)
- **`master` branch** — den originale Python/Tkinter desktop-app

## Vercel

Vercel-projektet skal bygge **Vite / Other**, ikke Python.

1. Project → Settings → General
2. **Framework Preset:** `Vite` (eller `Other`)
3. **Node.js Version:** `22.x`
4. **Root Directory:** tom / `.`
5. Git branch: `web`

`vercel.json` i denne branch tvinger Vite-build. Hvis du stadig ser `No python entrypoint found`, er Framework Preset stadig sat til Python i dashboardet — skift den.

## Lokalt

```bash
npm install
npm run dev
```
