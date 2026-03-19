# AR TV Viewer

Next.js app for managing marker-to-video assignments and rendering AR playback.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the viewer and `http://localhost:3000/dashboard` for the dashboard.

## Supabase persistence

The API now supports Supabase-backed persistence for shared remote data:

- Supabase Storage object `config/contentConfig.json` for client assignments.
- Supabase Storage object `config/markerConfig.json` for marker metadata.
- Supabase Storage folders `assets/` and `markers/` for uploaded media files.

If Supabase env vars are present, routes use Supabase. If not, routes fall back to local JSON/files in `src/app/data` and `public`.

### Required env vars (`.env.local`)

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=ar-tv-viewer
```

## Notes

- Supabase files are served via same-origin `GET /api/storage?path=...`.
- Legacy marker IDs (`pattern-hiro`, `pattern-letterA/B/C/D`) remain available.
