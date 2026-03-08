# Aider Phase 1 Prototype

Functional prototype for Claude-backed accounting skills with a QBO MCP-ready adapter, QA validation, review APIs, PostHog core events, and Railway/Postgres deployment baseline.

## What is included

- Node/TypeScript API endpoints:
  - `GET /health`
  - `GET /runs?limit=25`
  - `POST /runs`
  - `GET /runs/:runId`
  - `GET /runs/:runId/findings`
  - `POST /findings/:findingId/decision`
  - `GET /skills/:skillId/:version`
  - `POST /skills/register`
  - `POST /skills/update`
  - `POST /skills/archive`
  - `POST /skills/execute`
- Five starter accounting skills under `skills/*/v1`
- Deterministic QA validator
- Fault-isolated run orchestration
- Fixture-first QBO MCP adapter with live mode feature flag
- Claude adapter with fixture fallback mode
- Railway-ready Postgres schema and scripts
- PostHog core event capture
- Lightweight review UI with filters/search/pagination

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
2. Add PostgreSQL service and wire app `DATABASE_URL` to the DB reference.
3. Set env vars from `.env.example`.
4. Deploy service:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
5. Run migration + seed once against Railway DB.

## Review UI

- Open `/review` in the deployed service.
- Load runs via recent run dropdown or by entering a `run_id`.
- Use filters for skill, severity, and QA status.
- Search by `finding_id`.
- Navigate findings with pagination controls.

## Notes

- `USE_LIVE_CLAUDE=false` and `USE_LIVE_QBO_MCP=false` keeps Phase 1 fixture-first.
- Live Claude/QBO calls are optional and non-blocking.
- Human review remains mandatory for all findings.

- GET /runs/:runId/findings now includes execution_summary with mcp_mode per skill execution.

