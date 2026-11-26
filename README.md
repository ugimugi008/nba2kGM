# Hardwood GM

Head-to-head NBA spin-draft game: spin a franchise + season, draft a 13-man roster 1-by-1, set your rotation, and watch SimCast Live play it out. Play a friend with a **Party Code** (no sign-in) or practice against a CPU GM.

## Deploy to Vercel

1. **Import the repo** in Vercel (Add New → Project). The settings are picked up from `vercel.json` (Vite, output `dist`), so you don't need to change anything.
2. **Add storage for Party Codes.** In the project, open **Storage → Create / Connect → Upstash for Redis** (the free plan is enough) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. **Redeploy** so the new environment variables take effect.
4. Check `https://<your-app>.vercel.app/api/health`. It should show `{"ok":true,"storage":"upstash"}`.

Without step 2, practice mode still works, but creating a Party Code shows a message asking you to add storage. Party rooms must live in a shared store because Vercel runs each API request on whichever serverless instance is free.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000 (rooms kept in memory; no Redis needed)
npm test           # rules, sim engine, spin draft
```

To try the real storage locally, put `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `REDIS_URL`) in `.env.local` and run with those variables exported.

## How Party Code sync works

- `api/party.ts` (Vercel) and `server.ts` (local Express) both call `server/partyHandler.ts`.
- The rules for joining, turn order, re-spin budget, picks, lineups and series all live in `server/partyLogic.ts`.
- Rooms are stored in Redis with a revision number. Every write is an atomic compare-and-set, so two players acting at the same moment (for example both locking lineups) can't overwrite each other.
- Clients poll `GET /api/party/:code?since=<rev>` about once a second. The server answers `204` when nothing has changed, which keeps Redis usage low. Polling slows down when the tab is in the background.
- Rooms expire 6 hours after the last action. Refreshing the page resumes your match.
