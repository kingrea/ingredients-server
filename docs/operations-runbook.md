# ingredient-db operations runbook

## Scope

Production operations for the VPS Docker Compose deployment of `ingredient-db`.

## Deployment verification (Phase 8)

### Environment limitation

- Docker is not available in this execution environment (`docker: command not found` in WSL), so a true VPS/Compose deployment dry run could not be executed here.

### Closest validated fallback executed

The API was validated using the same runtime assumptions as the container (`PORT`, `HOST`, `DB_FILE`, and startup flow with `dist/db/init.js` before `dist/server.js`).

Commands run:

```bash
npm run build
PORT=3100 HOST=127.0.0.1 DB_FILE=/tmp/ingredient-db-phase8.sqlite node dist/db/init.js
PORT=3100 HOST=127.0.0.1 DB_FILE=/tmp/ingredient-db-phase8.sqlite node dist/server.js
```

Health + CRUD checks were then executed against the running service:

- `GET /health` returned `{"status":"ok"}`
- `POST /api/sections` returned `201` with created section payload
- `POST /api/ingredients` returned `201` with created ingredient payload
- `PUT /api/ingredients/:id` returned `200` with updated aliases
- `DELETE /api/ingredients/:id` returned `204`
- `DELETE /api/sections/:id` returned `204`

This confirms application startup, DB initialization, and core API write/read/delete behavior with deployment-like runtime env vars.

## VPS deploy procedure

### Prerequisites

- Docker Engine + Docker Compose plugin installed on VPS
- Repo checked out on VPS
- `.env` file present (copy from `.env.docker.example`)

### First deploy

```bash
cp .env.docker.example .env
docker compose up -d --build
docker compose ps
curl http://localhost:${APP_PORT:-3000}/health
```

Expected result:

- Service `ingredient-db` shows `Up`
- Health endpoint returns `{"status":"ok"}`

### Update deploy

```bash
git pull --rebase
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 ingredient-db
```

## Backup and restore (SQLite volume)

Compose stores SQLite data in named volume `ingredient-db-data` mounted at `/data`.

### Backup

```bash
mkdir -p backups
docker run --rm \
  -v ingredient-db-data:/volume \
  -v "$(pwd)/backups:/backup" \
  busybox sh -c 'tar czf /backup/ingredient-db-data-$(date +%Y%m%d-%H%M%S).tgz -C /volume .'
```

### Restore

1. Stop app container:

```bash
docker compose down
```

2. Restore archive into volume (replace backup filename):

```bash
docker run --rm \
  -v ingredient-db-data:/volume \
  -v "$(pwd)/backups:/backup" \
  busybox sh -c 'rm -rf /volume/* && tar xzf /backup/<backup-file>.tgz -C /volume'
```

3. Start app and verify:

```bash
docker compose up -d
curl http://localhost:${APP_PORT:-3000}/health
```

## Restart and routine operations

- Restart app container: `docker compose restart ingredient-db`
- Stop app but keep volume: `docker compose down`
- View logs: `docker compose logs -f ingredient-db`
- Check container health: `docker inspect --format='{{json .State.Health}}' ingredient-db`

## Troubleshooting

### Health check failing

1. `docker compose ps`
2. `docker compose logs --tail=200 ingredient-db`
3. Confirm port and env values in `.env` and `docker-compose.yml`
4. Verify app process started: `docker exec ingredient-db ps -ef`

### DB or migration startup errors

1. Validate writable volume mount at `/data`
2. Confirm `DB_FILE` points to `/data/ingredient.db`
3. Inspect container logs for `dist/db/init.js` errors
4. Restore last known good backup if DB file is corrupted

### Port conflict on VPS

1. Change `APP_PORT` in `.env`
2. Recreate service: `docker compose up -d --build`
3. Verify with `curl http://localhost:<new-port>/health`
