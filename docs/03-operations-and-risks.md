# Operations & Risk Register

> Updated: 2026-05-26
> Scope: local setup, deployment choices, audio serving, verification, and current risks.

## 1. Local Development

Install dependencies:

```bash
npm install
```

Run frontend only:

```bash
npm run dev
```

Run API only:

```bash
npm run dev:api
```

Run both:

```bash
npm run dev:full
```

Vite proxies `/api` to `http://localhost:4000` through `vite.config.ts`, so `npm run dev:full` is the most complete local workflow.

## 2. Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `api/lib/gemini.ts` | Server-side fallback Gemini key. |
| `GEMINI_MODEL_CHAIN` | `api/lib/gemini.ts` | Ordered text grading model candidates. |
| `GEMINI_MODEL` | `api/lib/gemini.ts` | Single preferred text model candidate. |
| `GEMINI_TRANSCRIBE_MODEL_CHAIN` | `api/lib/gemini.ts` | Ordered transcription model candidates. |
| `GEMINI_TRANSCRIBE_MODEL` | `api/lib/gemini.ts` | Single preferred transcription model candidate. |
| `VITE_AUDIO_BASE_URL` | `src/lib/speakingAudio.ts` | Base URL for speaking instruction audio. |
| `PORT` | `server/index.ts` | Express production port; defaults to `3000`. |

The frontend key modal writes `localStorage.GEMINI_API_KEY`. That key is user-controlled and sent with grading requests.

## 3. Vercel Deployment

`vercel.json` expects:

```text
buildCommand: npm run build
outputDirectory: dist
rewrite /api/(.*) -> /api/$1
```

This route is aligned with the current API handler shape. The main risk is function runtime duration for Speaking, especially when many audio answers require transcription. `api/grade-speaking.ts` sets `maxDuration = 300`, but the actual platform limit depends on the Vercel plan.

## 4. VPS Deployment

The VPS path exists in:

- `server/index.ts`
- `server/dev-server.ts`
- `ecosystem.config.cjs`
- `nginx/nginx.conf`
- `nginx/audio-config.conf`
- `scripts/*.sh`

The Express server serves:

```text
GET  /health
POST /api/grade-speaking
POST /api/grade-writing
GET  /* -> dist/index.html
```

Nginx is configured for:

- HTTPS termination through Certbot paths;
- `/api/` proxy to `127.0.0.1:3000`;
- `/assets/` static alias to `dist/assets`;
- `/audio/speaking/` static alias to `public/audio/speaking`;
- long API read/send timeouts of 300 seconds for Gemini calls.

## 5. Audio Serving

The app expects audio under:

```text
/audio/speaking/system/beep.mp3
/audio/speaking/system/begin-preparing.mp3
/audio/speaking/system/begin-speaking.mp3
/audio/speaking/directions/part1.mp3
/audio/speaking/directions/part2.mp3
/audio/speaking/directions/part3.mp3
/audio/speaking/directions/part4.mp3
/audio/speaking/directions/part5.mp3
```

The source repo currently stores source MP3s in `audio-temp/`, while `public/audio` only contains `.gitkeep`. The VPS script `scripts/setup-audio-vps.sh` uploads and renames files into the structure expected by `src/lib/speakingAudio.ts`.

This is why the old `docs/HTTPS_AUDIO_FIX.md` existed. Its content is now folded here because the old file had encoding corruption and stale references.

Manual Nginx block:

```nginx
location /audio/speaking/ {
    alias /var/www/mini-ielts-score/public/audio/speaking/;
    add_header Cache-Control "public, max-age=31536000";
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
    types { audio/mpeg mp3; }
    default_type audio/mpeg;
    try_files $uri $uri/ =404;
}
```

Verification:

```bash
curl -I https://your-domain.com/audio/speaking/system/beep.mp3
curl -I https://your-domain.com/health
```

Expected:

- audio returns `200` and `audio/mpeg`;
- health returns JSON from Express;
- microphone works only on `https://` or `localhost`.

## 6. Verification Status

During this docs pass:

| Check | Result |
|---|---|
| Source audit | Passed: frontend, contexts, API handlers, Gemini wrapper, server, Nginx, scripts were read. |
| Screenshot capture | Passed: Playwright captured homepage, Speaking selector, Writing selector. |
| `npm ci` | Failed: lockfile is out of sync with `package.json`. |
| `npm install --package-lock=false` | Passed for local inspection only; lockfile was not intentionally updated. |
| `npm run build` | Passed; Vite warns that `audioStorage.ts` and `utils.ts` are both dynamically and statically imported, so those dynamic imports do not form separate chunks. |
| `npm run lint` | Blocked by missing ESLint config; the script exists, but ESLint cannot find a configuration file. |

## 7. Risk Register

| Risk | Severity | Evidence | Recommended fix |
|---|---|---|---|
| Lockfile drift | High | `npm ci` fails with missing Express/CORS transitive dependencies | Run a dependency maintenance commit that updates `package-lock.json`, then verify `npm ci`. |
| Source encoding corruption | Medium | Vietnamese text in TS/MD/scripts contains mojibake | Separate UI text cleanup pass; verify screenshots after changing strings. |
| Audio deployment split | Medium | `public/audio` is empty; scripts depend on `audio-temp` | Either commit normalized audio under `public/audio/speaking` or document `audio-temp` as deployment input with checksum. |
| User API key in localStorage | Medium | `GeminiKeyInput.tsx` saves raw key | Acceptable for a personal tool; for shared deployment, move key ownership server-side. |
| Long Speaking request duration | Medium | Batch delay can be 60s plus model latency | Keep Vercel max duration in mind; VPS path may be more predictable. |
| No submission persistence | Low/Medium | No DB or auth layer | Fine for practice lab; insufficient for learner history or admin review. |
| Product naming drift | Low | Repo name says IELTS, source says TOEIC | README now clarifies; rename repo only if public branding matters. |

## 8. Cleanup Decisions

Removed or superseded:

- `docs/screenshot.png`: stale single screenshot replaced by current Playwright captures.
- `docs/HTTPS_AUDIO_FIX.md`: merged into this operations doc.
- `assets/c__Users_Lenovo_...png`: editor workspace artifacts, not app assets.

Kept:

- `audio-temp/*.mp3`: operational input for VPS audio setup scripts.
- `nginx/*` and `scripts/*`: still useful because the repo contains a real VPS deployment path.
