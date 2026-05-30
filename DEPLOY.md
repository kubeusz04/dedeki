# Wdrożenie: GitHub → Oracle Cloud

Ten folder (`dedeki-github`) jest gotową paczką do repozytorium Git i wdrożenia na **Oracle Cloud Free Tier** (VM + Docker).

## Co jest w paczce

| Plik / folder | Opis |
|---------------|------|
| `.gitignore` | Bez `.env`, `node_modules`, uploadów użytkowników |
| `.env.example` | Lokalny development |
| `.env.production.example` | Szablon `.env` na serwerze |
| `docker-compose.yml` | Dev (baza + app na localhost) |
| `docker-compose.prod.yml` | Produkcja (wolumeny na uploady + Postgres) |
| `deploy/oracle/setup-vm.sh` | Pierwsza konfiguracja Ubuntu na Oracle |
| `deploy/oracle/deploy.sh` | `git pull` + rebuild (aktualizacja bez kasowania danych) |
| `deploy/oracle/wipe-all.sh` | **Kasuje wszystko** (kontenery, wolumeny, folder app) |
| `deploy/oracle/fresh-from-github.sh` | **Świeża instalacja** z GitHub (po wipe) |
| `deploy/oracle/reinstall.sh` | **Wipe + fresh** w jednym poleceniu |
| `deploy/oracle/Caddyfile` | Opcjonalny HTTPS (profil `https`) |

---

## 1. GitHub

### A. Utwórz repozytorium

1. Na [github.com](https://github.com) → **New repository** → np. `dedeki` (public lub private).
2. **Nie** dodawaj README ani .gitignore (już są w projekcie).

### B. Wypchnij kod z tego folderu

W PowerShell (w folderze `dedeki-github`):

```powershell
cd C:\Users\Zawadzki\Desktop\dedeki-github
git init
git add .
git commit -m "Initial commit: Dedeki D&D VTT"
git branch -M main
git remote add origin https://github.com/TWOJ_USER/dedeki.git
git push -u origin main
```

Zamień `TWOJ_USER/dedeki` na swoje repo.

### C. Aktualizacja po zmianach w `dedeki`

Uruchom skrypt synchronizacji (nadpisuje kod z dev, zostawia pliki deploy):

```powershell
.\scripts\sync-from-dev.ps1
```

Potem commit + push jak wyżej.

---

## 2. Oracle Cloud (Free Tier)

### A. Utwórz VM

1. [Oracle Cloud Console](https://cloud.oracle.com) → **Compute** → **Instances** → **Create instance**.
2. **Shape**: Ampere A1 (ARM) — np. 2 OCPU, 12 GB RAM (free tier).
3. **Image**: Ubuntu 22.04 lub 24.04.
4. **Networking**: publiczny IP, VCN z internet gateway.
5. **SSH key**: dodaj swój klucz publiczny.
6. Po utworzeniu — **Security List** / **Ingress rules**:
   - TCP **22** (SSH)
   - TCP **3000** (app bez HTTPS) **lub** **80 + 443** (z Caddy)

### B. Połącz się SSH

```bash
ssh ubuntu@TWOJ_PUBLICZNY_IP
```

(u Oracle czasem user to `ubuntu` lub `opc` — zależnie od obrazu)

### C. Pierwsza instalacja na VM

```bash
git clone https://github.com/TWOJ_USER/dedeki.git
cd dedeki
chmod +x deploy/oracle/*.sh
./deploy/oracle/setup-vm.sh
# wyloguj się i zaloguj ponownie (grupa docker)
```

### D. Konfiguracja `.env`

```bash
cp .env.production.example .env
nano .env
```

Ustaw minimum:

- `POSTGRES_PASSWORD` — długie losowe hasło
- `DATABASE_URL` — to samo hasło w URL (`@db:5432`)
- `JWT_SECRET` — min. 32 znaki (losowe)
- `SOCKET_CORS_ORIGIN` — `http://TWOJ_IP:3000` lub `https://twoja-domena.pl`

Wygeneruj JWT:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### E. Uruchom produkcję

**Wariant 1 — IP + port 3000**

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl http://127.0.0.1:3000/api/health
```

Otwórz w przeglądarce: `http://TWOJ_PUBLICZNY_IP:3000`

**Wariant 2 — domena + HTTPS (Caddy)**

W `.env` dodaj:

```env
DOMAIN=twoja-domena.pl
SOCKET_CORS_ORIGIN=https://twoja-domena.pl
```

DNS: rekord **A** domeny → publiczny IP VM.

```bash
docker compose -f docker-compose.prod.yml --profile https up -d --build
```

### F. Aktualizacja po zmianach w GitHub (bez kasowania danych)

```bash
cd ~/dedeki
./deploy/oracle/deploy.sh
```

---

## 2G. Oracle — kasuj wszystko i postaw od nowa z GitHub

Użyj tego gdy chcesz **czystą instalację** (zeruje bazę, uploady, kampanie na serwerze).

### Krok 1 — SSH na VM

```bash
ssh ubuntu@TWOJ_PUBLICZNY_IP
```

### Krok 2 — jednym skryptem (wipe + clone + start)

Jeśli repo jest już sklonowane (masz folder `~/dedeki`):

```bash
cd ~/dedeki
chmod +x deploy/oracle/*.sh
./deploy/oracle/reinstall.sh https://github.com/TWOJ_USER/dedeki.git
```

Skrypt zapyta o potwierdzenie **`TAK`**, skasuje kontenery i wolumeny, sklonuje repo od zera i uruchomi Docker.

> **Uwaga:** kasuje też **bazę i uploady**. Eksportuj kampanie wcześniej, jeśli chcesz je zachować.

### Krok 2 alternatywnie — ręcznie w dwóch krokach

```bash
# 1) Kasuj wszystko (baza + uploady + folder ~/dedeki)
chmod +x deploy/oracle/wipe-all.sh
./deploy/oracle/wipe-all.sh ~/dedeki

# 2) Świeża instalacja z GitHub
git clone https://github.com/TWOJ_USER/dedeki.git ~/dedeki
cd ~/dedeki
chmod +x deploy/oracle/*.sh
./deploy/oracle/fresh-from-github.sh https://github.com/TWOJ_USER/dedeki.git ~/dedeki
```

`fresh-from-github.sh` utworzy `.env` z szablonu (albo zaproponuje przywrócenie backupu `.env` z `/tmp/`). **Uzupełnij `.env` przed startem** (`nano .env`).

### HTTPS po reinstalacji

```bash
cd ~/dedeki
# w .env: DOMAIN=twoja-domena.pl, SOCKET_CORS_ORIGIN=https://twoja-domena.pl
USE_HTTPS=1 ./deploy/oracle/fresh-from-github.sh https://github.com/TWOJ_USER/dedeki.git ~/dedeki
```

(albo po zwykłym `fresh-from-github`: `docker compose -f docker-compose.prod.yml --profile https up -d --build`)

### Co zostaje skasowane

| Element | Po `wipe-all.sh` |
|---------|------------------|
| PostgreSQL (kampanie, konta) | **TAK** |
| Uploady (mapy, muzyka, tokeny) | **TAK** |
| Plik `.env` w folderze app | **TAK** (kopia w `/tmp/dedeki.env.backup.*`) |
| Docker na VM | zostaje — tylko Dedeki |

**Zrób eksport kampanii w panelu MG przed wipe**, jeśli chcesz zachować dane.

---

## 3. Kopie zapasowe

Dane żyją w wolumenach Docker:

- `dedeki_postgres_data` — baza
- `dedeki_uploads_public` — mapy, tokeny, muzyka
- `dedeki_uploads_private` — handouty MG

Backup (przykład):

```bash
docker run --rm -v dedeki_postgres_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/postgres-backup.tar.gz -C /data .
```

W aplikacji MG ma też eksport kampanii (ZIP) w panelu.

---

## 4. Checklist przed go-live

- [ ] `JWT_SECRET` zmieniony (nie domyślny)
- [ ] `POSTGRES_PASSWORD` silne
- [ ] `NODE_ENV=production`
- [ ] `SOCKET_CORS_ORIGIN` = dokładny adres strony (nie `*` w produkcji)
- [ ] Porty otwarte w Oracle Security List
- [ ] Opcjonalnie: domena + HTTPS

---

## Problemy

| Objaw | Rozwiązanie |
|-------|-------------|
| `ECONNREFUSED` baza | `docker compose -f docker-compose.prod.yml ps` — czy `dedeki-db` healthy |
| Socket.IO nie łączy | `SOCKET_CORS_ORIGIN` musi pasować do URL w przeglądarce |
| Brak miejsca | `docker system prune` (ostrożnie — nie usuwaj wolumenów z danymi) |
| YouTube import | W Dockerze yt-dlp jest w obrazie; sprawdź logi `docker logs dedeki-app` |
