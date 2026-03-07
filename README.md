# Aider Phase 1 Prototype

Functional prototype for Claude-backed accounting skills with QBO MCP-ready adapter, QA validation, review APIs, PostHog core events, and Railway/Postgres deployment baseline.

## What is included

- Node/TypeScript API with endpoints:
  - `POST /runs`
  - `GET /runs/:runId`
  - `GET /runs/:runId/findings`
  - `POST /findings/:findingId/decision`
  - `POST /skills/register`
  - `POST /skills/execute`
- Five starter accounting skills under `skills/*/v1`
- Deterministic QA validator
- Fault-isolated run orchestration
- Fixture-first QBO MCP adapter with live mode feature flag
- Claude adapter with fixture fallback mode
- Railway-ready Postgres schema and scripts
- PostHog core event capture

## Quick start

1. Copy `.env.example` to `.env` and set values.
2. Install dependencies: `npm install`
3. Run migrations: `npm run db:migrate`
4. Seed demo client: `npm run db:seed`
5. Start API: `npm run dev`

## Demo run

- Run end-to-end in memory: `npm run demo:run`

## Railway deployment

1. Create Railway project.
2. Add PostgreSQL plugin and copy `DATABASE_URL`.
3. Set env vars from `.env.example`.
4. Deploy service with:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
5. Run migration once using Railway shell: `npm run db:migrate`

## Notes

- `USE_LIVE_CLAUDE=false` and `USE_LIVE_QBO_MCP=false` keeps Phase 1 fixture-first.
- Live Claude/QBO calls are optional and non-blocking.
- Human review remains mandatory for all findings.
