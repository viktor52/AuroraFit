# AuroraFit

Fitness PWA (Next.js + Tailwind + Prisma + Postgres).

## Requirements

- **Node.js 20.19+** (see `.nvmrc`). Install from [nodejs.org](https://nodejs.org/) or use **nvm-windows** and run `nvm install 20.19.0` then `nvm use 20.19.0`.
- **Docker Desktop** (for local Postgres)

If you previously ran `npm install` on Node 18 and it failed part-way, delete `node_modules` and `package-lock.json`, upgrade Node, then run `npm install` again.

## Local database (Docker + Postgres)

From the `aurorafit/` folder:

```bash
docker compose up -d
copy .env.example .env
npm install
npm run db:migrate
```

`db:migrate` applies migrations and runs `prisma generate` (Prisma 7 does not auto-generate after migrate alone).

## Run the app

```bash
npm run dev
```

- App: `http://localhost:8080`
- Login: `http://localhost:8080/login`
- Register: `http://localhost:8080/register` (athlete or coach)

## Registration

- **Athletes**: `http://localhost:8080/register/athlete` (or start from `/register`).
- **Coaches**: `http://localhost:8080/register/coach` — requires a **one-time key** minted by an admin (see below).

## Admin dashboard

Open `http://localhost:8080/admin/login` and sign in using the value of `ADMIN_SETUP_SECRET` from your `.env`.

From the admin dashboard you can:

- Mint one-time **coach validation keys**
- Create **exercises**
- Create **programs** from exercises
- Assign a program to an **athlete**

### Mint a coach validation key (admin)

Set `ADMIN_SETUP_SECRET` in `.env` (see `.env.example`). Then:

```bash
curl -s -X POST http://localhost:8080/api/admin/coach-invite-keys ^
  -H "Content-Type: application/json" ^
  -H "X-Admin-Secret: YOUR_ADMIN_SETUP_SECRET" ^
  -d "{\"expiresInDays\": 14}"
```

The JSON response includes `key` once — give that string to the coach. It is **single-use**.

Optional JSON fields: `expiresInDays` (number), `createdByUserId` (UUID of an existing **ADMIN** user).

### Register via API (optional)

- Athlete: `POST /api/auth/register/athlete` with `{ "email", "password", "fullName?" }`
- Coach: `POST /api/auth/register/coach` with `{ "email", "password", "inviteKey", "fullName?" }`
- Legacy: `POST /api/auth/register` forwards to athlete registration only (no `role: COACH`).

## Stop the database

```bash
docker compose down
```
