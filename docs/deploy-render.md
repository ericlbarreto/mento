# Deploying the API on Render

> Verified 2026-10-31: a clean checkout, `pnpm install --frozen-lockfile` and `pnpm start:api` with only `PORT` set answer `GET /api/health` with `mongo: connected`. The Render dashboard steps are from Render's documentation and were not run from here.

The API (`apps/api`) has **no build step**: it runs the TypeScript directly with `tsx` (a dependency of the package), and the workspace packages (`@mento/*`) are TypeScript sources. So "build" is just installing the monorepo.

## Web service settings

| Field | Value |
|---|---|
| Type | Web Service |
| Repository / branch | `ericlbarreto/mento`, `main` |
| **Root Directory** | **empty (the repo root).** Do not set `apps/api`: the API reads `prompts/` at the repo root and needs the `pnpm-workspace.yaml` |
| Runtime | Node |
| **Build Command** | `corepack enable pnpm && pnpm install --frozen-lockfile` |
| **Start Command** | `pnpm start:api` |
| Health Check Path | `/api/health` |
| Plan | Starter or higher if you add the disk below (the free plan sleeps after 15 min idle and has no disk) |
| Auto-Deploy | On commit |

`pnpm start:api` runs `pnpm --filter @mento/api start`, that is `tsx src/server.ts`. `packageManager` in the root `package.json` pins pnpm (`pnpm@12.16.1`).

## Environment variables

| Variable | Value |
|---|---|
| `NODE_VERSION` | `24` (the repo needs Node ≥ 22) |
| `PORT` | set by Render itself (the API reads it; `API_PORT` wins if you set both) |
| `WEB_ORIGIN` | the exact URL of the deployed web app, no trailing slash (CORS allows only this origin), for example `https://mento-web.onrender.com` |
| `MONGODB_URI` | the Atlas connection string (secret) |
| `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `GEMINI_API_KEY`, `VOYAGE_API_KEY` | the provider keys (secrets) |
| `TUTOR_MODEL`, `TUTOR_THINKING`, `TUTOR_EFFORT`, `JUDGE_MODEL`, `EXERCISES_MODEL`, `IMAGE_MODEL`, `ELEVENLABS_MODEL`, `TTS_MODE`, `DEMO_MODE` | optional; the defaults in `apps/api/src/config.ts` are the tested ones |
| `DATA_DIR`, `UPLOAD_DIR` | see "Disk" below |

Names and meanings are in `.env.example`. Never commit keys; paste them in Render's Environment tab.

## Disk (images, audio and uploaded PDFs)

The API writes to the local filesystem: generated images and the audio cache (`DATA_DIR`, served at `/api/gen/…`) and the teacher's PDFs (`UPLOAD_DIR`). Render's filesystem is **erased on every deploy and restart**. Without a disk, re-opened sessions lose their pictures and uploaded PDFs disappear (their text chunks stay in MongoDB).

1. Service → **Disks** → add a disk, mount path `/var/data` (1 GB is plenty).
2. Set `DATA_DIR=/var/data/cache` and `UPLOAD_DIR=/var/data/uploads`.

A service with a disk runs one instance and redeploys with a short downtime. For a demo with no disk, everything works but images and uploads do not survive a restart.

## MongoDB Atlas

Atlas → Network Access must allow Render. Quick option: `0.0.0.0/0` (protected by the connection string; acceptable for the hackathon). Render's fixed outbound addresses are in the service's **Connect → Outbound** tab if you want to restrict it. The Atlas search indexes are created by the API at start.

## The web app

The web is already deployed. After the API has its URL, set `NEXT_PUBLIC_API_URL` on the web service to it (`https://<api-service>.onrender.com`) and **redeploy the web**: Next.js inlines `NEXT_PUBLIC_*` at build time. Then set `WEB_ORIGIN` on the API to the web's URL.

## Checks after the first deploy

```bash
curl https://<api-service>.onrender.com/api/health
curl https://<api-service>.onrender.com/api/subjects
```

`mongo: "connected"` and the subject list mean the database works. Then open the web app, start a voice session and watch the Render logs for `ANTHROPIC`, `Deepgram` or `ElevenLabs` errors (a 503 `voice_unavailable` or `tts_unavailable` means a missing key).

## Notes

- Streaming (SSE) and the audio stream work on Render web services; no extra setting.
- The microphone needs HTTPS: Render URLs are HTTPS, so this works there.
- Cold start: a service on the free plan takes ~30–60 s to wake up; use Starter for the demo.
