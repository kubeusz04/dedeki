# Dedeki — D&D 5e Virtual Tabletop

Aplikacja do prowadzenia sesji D&D online: czat, postacie, mapa bitewna, inicjatywa, kostki, ekonomia i panel MG.

## Szybki start (lokalnie)

```bash
cp .env.example .env
npm run db:up    # PostgreSQL w Dockerze (port 5435)
npm start        # http://localhost:3000
```

Wymagania: **Node.js 18+**, **Docker** (dla bazy).

Pełny stack w Dockerze (dev):

```bash
docker compose up -d
```

## Wdrożenie na serwer (Oracle Free Tier / VPS)

Szczegółowa instrukcja: **[DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)**

Skrót na Ubuntu:

```bash
git clone https://github.com/TWOJ_LOGIN/dedeki.git
cd dedeki
bash deploy/scripts/setup-oracle.sh
```

Produkcja:

```bash
cp .env.example .env   # uzupełnij hasła
docker compose -f docker-compose.prod.yml up -d --build
```

## Zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `DATABASE_URL` | PostgreSQL (w prod ustawia compose) |
| `JWT_SECRET` | Min. 32 znaki w produkcji |
| `NODE_ENV` | `production` na serwerze |
| `SOCKET_CORS_ORIGIN` | URL frontendu dla Socket.IO |
| `POSTGRES_PASSWORD` | Hasło bazy (compose prod) |

Zobacz [.env.example](.env.example).

## API

- `GET /api/health` — status aplikacji (healthcheck)

## Funkcje

- Rejestracja / logowanie, kampanie z kodem zaproszenia
- Czat (IC, szept, akcje), mapa VTT z mgłą wojny i tokenami
- Walka taktyczna 5e, inicjatywa, kostki, postacie, import/eksport JSON
- Panel MG: NPC, ekonomia, muzyka, kreator map i presety
