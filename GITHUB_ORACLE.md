# Roll 1 (Dedeki) — GitHub + aktualizacja Oracle

Folder **`C:\Users\Zawadzki\Desktop\dedeki-github`** jest gotowy do wysłania na GitHub.  
Kod aplikacji synchronizujesz z folderu roboczego `dedeki` skryptem poniżej.

---

## 1. Synchronizacja z `dedeki` (Windows)

Po każdej większej zmianie w `dedeki`:

```powershell
cd C:\Users\Zawadzki\Desktop\dedeki-github
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\sync-from-dedeki.ps1
```

Ręcznie (bez skryptu):

```powershell
robocopy C:\Users\Zawadzki\Desktop\dedeki C:\Users\Zawadzki\Desktop\dedeki-github /E /XD node_modules .git uploads .vscode /XF .env .env.local
```

**Nie commituj** pliku `.env` — tylko `.env.example`.

---

## 2. Pierwszy push na GitHub

W folderze `dedeki-github`:

```powershell
cd C:\Users\Zawadzki\Desktop\dedeki-github
git init
git add .
git status
git commit -m "Roll 1 VTT: map zones, spell AoE, map props, deploy Oracle"
git branch -M main
git remote add origin https://github.com/TWOJ_LOGIN/TWOJE_REPO.git
git push -u origin main
```

Jeśli repozytorium już istnieje i masz historię:

```powershell
cd C:\Users\Zawadzki\Desktop\dedeki-github
git add .
git commit -m "Aktualizacja: strefy mapy, AoE, rekwizyty, Roll 1 UI"
git push origin main
```

---

## 3. Aktualizacja na Oracle (serwer)

Zastąp `TWOJ_LOGIN`, `TWOJE_REPO` i IP. Przykład z wcześniejszego wdrożenia: **138.2.148.228**, katalog `~/dedeki`.

### SSH

```bash
ssh ubuntu@138.2.148.228
```

### Jednorazowo (pierwsza instalacja)

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/TWOJ_LOGIN/TWOJE_REPO.git ~/dedeki
cd ~/dedeki
cp .env.example .env
nano .env
```

W `.env` ustaw m.in.:

- `POSTGRES_PASSWORD` — silne hasło (`openssl rand -base64 24`)
- `JWT_SECRET` — min. 32 znaki (`openssl rand -base64 48`)
- `NODE_ENV=production`
- `SOCKET_CORS_ORIGIN=http://138.2.148.228:3000` (lub Twoja domena)
- `DATABASE_SSL=false`

Uruchom:

```bash
bash deploy/scripts/setup-oracle.sh
```

Lub ręcznie:

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:3000/api/health
```

Aplikacja: **http://138.2.148.228:3000**

### Każda aktualizacja po `git push` (z Windows)

Na serwerze:

```bash
cd ~/dedeki
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app --tail 80
```

Sprawdzenie zdrowia:

```bash
curl -s http://127.0.0.1:3000/api/health
```

### Backup bazy (zalecane przed dużą aktualizacją)

```bash
docker exec dedeki-db pg_dump -U dedeki dedeki > ~/backup-$(date +%F).sql
```

---

## 4. Checklist

| Krok | Gdzie |
|------|--------|
| `sync-from-dedeki.ps1` | PC Windows |
| `git add` / `commit` / `push` | PC → GitHub |
| `git pull` + `docker compose ... up -d --build` | Oracle VM |
| Port **3000** otwarty w Oracle Security List | Oracle Cloud |
| `.env` tylko na serwerze, nie w Git | Oracle |

---

## 5. Problemy

| Objaw | Działanie |
|-------|-----------|
| Stara wersja w przeglądarce | Ctrl+F5; sprawdź `git log -1` na serwerze |
| Błąd SSL do Postgres | `DATABASE_SSL=false` w `.env` |
| Biała strona / HTTPS | `deploy/scripts/fix-helmet-http.sh` (patrz DEPLOY_ORACLE.md) |
| Brak `docker compose` | `sudo apt install -y docker-compose-v2` |

Szczegóły: [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)
