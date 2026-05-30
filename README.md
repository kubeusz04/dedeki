# Dedeki — D&D 5e Virtual Tabletop

Aplikacja do prowadzenia sesji D&D online: czat, postacie, mapa bitewna, inicjatywa, kostki i panel MG.

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

## Muzyka z YouTube (prywatna sesja)

MG może w zakładce **Muzyka** wkleić link YouTube — serwer pobiera audio jako MP3 (`yt-dlp` + `ffmpeg`) i odtwarza je zsynchronizowanie u wszystkich graczy (jak zwykły upload).

- **Docker** (`docker compose up`): `yt-dlp` i `ffmpeg` są w obrazie aplikacji.
- **Windows / lokalny Node** (bez Dockera na app): zainstaluj [yt-dlp](https://github.com/yt-dlp/yt-dlp) i [ffmpeg](https://ffmpeg.org/) i dodaj do `PATH`, albo ustaw `YTDLP_PATH` w `.env`.
- Limit domyślny: utwory do **15 min** (`YTDLP_MAX_DURATION_SEC`).

Używaj tylko na własną, prywatną sesję — respektuj prawa autorskie.

## Healthcheck

`GET /api/health` — status `ok` (użyteczne dla Dockera/monitoringu).

## GitHub i Oracle Cloud

Ten folder jest przygotowany pod repozytorium Git i wdrożenie na VPS (Oracle Free Tier).

**Pełna instrukcja:** [DEPLOY.md](DEPLOY.md)

Skrót:

```powershell
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/TWOJ_USER/dedeki.git
git push -u origin main
```

Na serwerze Ubuntu:

```bash
git clone https://github.com/TWOJ_USER/dedeki.git && cd dedeki
cp .env.production.example .env && nano .env
docker compose -f docker-compose.prod.yml up -d --build
```

## Funkcje VTT (skrót)

- Reconnect Socket.IO z ponownym dołączeniem do kampanii
- Mapa: zoom, grafiki tokenów, mgła wojny, cofanie ruchu (MG)
- Szybka edycja HP i stany na liście postaci
- Szablony rzutów per postać
- Paginacja historii czatu
