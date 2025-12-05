# Backend (API) Guide

Tech: Fastify + Prisma (Postgres). Serves `/api` endpoints for news CRUD and publish controls.

## Env
- Copy `.env.example` to `.env` and set:
  - `DATABASE_URL` (Postgres on Railway)
  - `ADMIN_TOKEN` (shared secret for crawler/admin)
  - `PORT` (default 4000), `HOST` (default 0.0.0.0)

## Install & Generate
```sh
npm install
npm run prisma:generate
```

## Local DB Migrate
```sh
# edit prisma/schema.prisma if needed
npm run prisma:migrate -- --name init
```

## Run API (dev)
```sh
npm run api:dev
# server on http://localhost:4000
# Swagger docs at http://localhost:4000/docs
```

## Build & Start (prod)
```sh
npm run api:build
npm run api:start
```

## Auth
- Admin endpoints require header `x-admin-token: <ADMIN_TOKEN>` (or `Authorization: Bearer <token>`).

## Key Routes
- `GET /api/news?published=true&highlight=false&limit=20&offset=0`
- `GET /api/news/:id`
- `POST /api/news` (admin) — full payload with all languages.
- `PUT /api/news/:id` (admin) — update fields.
- `PATCH /api/news/:id/publish` (admin) — toggle publish/highlight.
- `DELETE /api/news/:id` (admin)
- `GET /api/health`

## Railway
- `Dockerfile.api` builds a standalone API image.
- `railway.json` defines two services (`api`, `web`).
- Set environment variables in Railway dashboard; run `prisma migrate deploy` on the API service.
