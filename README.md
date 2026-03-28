# ingredient-db

Lightweight HTTP API for ingredient and section data.

## Getting started

```bash
npm install
npm run dev
```

`GET /health` responds with:

```json
{
  "status": "ok"
}
```

## Scripts

- `npm run dev` - run server with watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm run start` - run compiled server
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript checks with no emit
- `npm run test` - run Vitest
- `npm run format` - run Prettier in check mode
- `npm run db:generate` - generate SQL migrations from Drizzle schema
- `npm run db:migrate` - apply migrations to SQLite database
- `npm run db:seed` - seed default section layout data
- `npm run db:init` - migrate then seed local database
- `npm run db:reset` - delete local DB, migrate, then reseed
- `npm run db:local` - alias for `db:init`

## Local database operations

The default database file is `./ingredient.db`. To target a different file, set `DB_FILE`.

```bash
# first-time setup
npm run db:init

# re-run seed safely (idempotent)
npm run db:seed

# hard reset local DB file and rebuild
npm run db:reset
```

## Deployment environment variables

- `PORT` - API listen port inside the container (default `3000`)
- `HOST` - API bind address (default `0.0.0.0`)
- `DB_FILE` - SQLite file path (default `./ingredient.db`; container default `/data/ingredient.db`)
- `APP_PORT` - host port mapping used by `docker-compose.yml` (default `3000`)

## Docker deployment (local or VPS)

1. Copy `./.env.docker.example` to `./.env` and adjust `APP_PORT` if needed.
2. Build and start the service:

```bash
docker compose up -d --build
```

3. Verify health:

```bash
curl http://localhost:${APP_PORT:-3000}/health
```

The compose service stores SQLite data in the named volume `ingredient-db-data`, so restarts or image updates do not wipe the database file.

Update flow on VPS:

```bash
git pull
docker compose up -d --build
docker compose ps
```

Useful operations:

```bash
# inspect logs
docker compose logs -f ingredient-db

# stop while keeping database volume
docker compose down
```

For operational procedures (deploy verification notes, backup/restore, restart, troubleshooting), see `docs/operations-runbook.md`.

## Architecture decisions (Phase 0)

- **Runtime and server:** Node.js + TypeScript + H3 keeps the API minimal, fast, and easy to evolve for route-first development.
- **Database layer:** Drizzle ORM with `better-sqlite3` is the default for a typed schema and reliable local-first SQLite workflow.
- **Validation:** Zod will define request/response validation and parsing at API boundaries to keep handlers explicit and safe.
- **Testing:** Vitest is the baseline test runner for fast local feedback and TypeScript-first ergonomics.
- **Batch behavior:** Batch endpoints will apply per-item transactions to isolate failures, allowing partial success responses where appropriate.
- **Search behavior:** Case-insensitive `contains` search is the default UX, with exact-match scoring boost for the most relevant ingredient names.

## Error envelope

All API errors should follow this shared JSON shape:

```json
{
  "error": {
    "status": 400,
    "message": "Validation failed",
    "details": {
      "field": "name"
    }
  }
}
```

Use `sendApiError(...)` from `src/api-error.ts` in route handlers.
