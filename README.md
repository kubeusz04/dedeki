# Roll 1 — D&D 5e Virtual Tabletop

Aplikacja do prowadzenia sesji D&D online: czat, postacie, mapa bitewna (strefy, AoE, rekwizyty), inicjatywa, kostki i panel MG.

**Push na GitHub i aktualizacja Oracle:** [GITHUB_ORACLE.md](GITHUB_ORACLE.md) · szczegóły serwera: [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)

## Wymagania

- Node.js 18+
- Docker (PostgreSQL) — zalecane przy lokalnym developmencie
- Opcjonalnie: lokalny PostgreSQL (wymaga dopasowania `DATABASE_URL`)

## Uruchomienie lokalne (Node + baza w Dockerze)

1. Skopiuj `.env.example` do `.env`.
2. Uruchom bazę (port **5435** na hoście — unika konfliktu z PostgreSQL na 5432):

```bash
npm run db:up
```

3. Uruchom serwer:

```bash
npm start
```

Albo jednym poleceniem:

```bash
npm run local
```

4. Otwórz http://localhost:3000

Jeśli port 3000 jest zajęty przez kontener `dedeki-app`:

```bash
docker stop dedeki-app
```

## Uruchomienie pełne (Docker)

```bash
docker compose up -d
```

Aplikacja: http://localhost:3000

## Skrypty npm

| Skrypt | Opis |
|--------|------|
| `npm start` | Serwer Node |
| `npm run db:up` | Tylko PostgreSQL w Dockerze |
| `npm run db:down` | Zatrzymanie bazy |
| `npm run local` | Baza + serwer |
| `npm run stop` | Zatrzymanie kontenerów compose |

## Zmienne środowiskowe

Zobacz [.env.example](.env.example). W produkcji ustaw silny `JWT_SECRET` (min. 32 znaki) i `NODE_ENV=production`.

## Healthcheck

`GET /api/health` — status `ok` (użyteczne dla Dockera/monitoringu).

## Funkcje VTT (skrót)

- Reconnect Socket.IO z ponownym dołączeniem do kampanii
- Mapa: zoom, grafiki tokenów, mgła wojny, cofanie ruchu (MG)
- Szybka edycja HP i stany na liście postaci
- Szablony rzutów per postać
- Paginacja historii czatu
