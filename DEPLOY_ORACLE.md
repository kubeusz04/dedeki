# Dedeki — wdrożenie na Oracle Cloud Free Tier

Instrukcja krok po kroku: repozytorium GitHub → maszyna wirtualna Oracle (Always Free) → Docker → aplikacja dostępna z internetu.

---

## Co jest w tym repozytorium

| Plik / folder | Opis |
|---------------|------|
| `docker-compose.prod.yml` | Produkcja: PostgreSQL + aplikacja Node |
| `docker-compose.yml` | Dev lokalny (baza + app) |
| `.env.example` | Szablon zmiennych — skopiuj do `.env` |
| `deploy/scripts/setup-oracle.sh` | Skrypt instalacji Dockera + pierwsze `up` |
| `deploy/nginx/dedeki.conf` | Opcjonalny reverse proxy (port 80) |
| `public/uploads/` | Pliki użytkowników (w prod: wolumen Docker) |

---

## Część 1 — GitHub

### 1. Utwórz repozytorium

1. Wejdź na https://github.com/new
2. Nazwa np. `dedeki` — **bez** README (już jest w projekcie)
3. Repozytorium **public** lub **private**

### 2. Wgraj kod z folderu `dedeki-github`

W PowerShell (Windows), w folderze **dedeki-github**:

```powershell
cd C:\Users\Zawadzki\Desktop\dedeki-github
git init
git add .
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "Initial commit: Dedeki VTT + deploy Oracle"
git branch -M main
git remote add origin https://github.com/TWOJ_LOGIN/dedeki.git
git push -u origin main
```

**Nigdy nie commituj pliku `.env`** — jest w `.gitignore`.

---

## Część 2 — Oracle Cloud (Always Free)

### 1. Konto i instancja VM

1. Załóż konto: https://cloud.oracle.com (Free Tier)
2. **Compute → Instances → Create instance**
3. Zalecenia:
   - **Name:** `dedeki-vtt`
   - **Image:** Ubuntu 22.04 lub 24.04
   - **Shape:** Ampere — **VM.Standard.A1.Flex** (1 OCPU, 6 GB RAM)
   - **Networking:** publiczny subnet, przydziel **public IPv4**
   - **SSH keys:** wklej swój klucz publiczny

### 2. Security List — otwórz porty

W VCN → **Security Lists** → domyślna lista subnetu → **Add Ingress Rules**:

| Port | Protokół | Źródło | Opis |
|------|----------|--------|------|
| 22 | TCP | 0.0.0.0/0 | SSH |
| 3000 | TCP | 0.0.0.0/0 | Aplikacja (szybki start) |
| 80 | TCP | 0.0.0.0/0 | Nginx (opcjonalnie) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (opcjonalnie) |

### 3. Firewall na Ubuntu (opcjonalnie)

```bash
sudo apt update
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw enable
```

---

## Część 3 — Instalacja aplikacji

### SSH na serwer

```bash
ssh ubuntu@TWOJE_PUBLICZNE_IP
```

### Szybka instalacja (skrypt)

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/TWOJ_LOGIN/dedeki.git ~/dedeki
cd ~/dedeki
bash deploy/scripts/setup-oracle.sh
```

### Ręczna instalacja

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# wyloguj i zaloguj ponownie

git clone https://github.com/TWOJ_LOGIN/dedeki.git ~/dedeki
cd ~/dedeki
cp .env.example .env
nano .env
```

Wygeneruj sekrety:

```bash
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
```

Uruchom:

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl http://127.0.0.1:3000/api/health
```

Otwórz: **http://TWOJE_PUBLICZNE_IP:3000**

---

## Część 4 — Nginx (port 80, opcjonalnie)

```bash
sudo apt install -y nginx
sudo cp ~/dedeki/deploy/nginx/dedeki.conf /etc/nginx/sites-available/dedeki
sudo ln -sf /etc/nginx/sites-available/dedeki /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS (Let's Encrypt) — gdy masz domenę:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d twoja-domena.pl
```

Potem `SOCKET_CORS_ORIGIN=https://twoja-domena.pl`

---

## Część 5 — Utrzymanie

```bash
cd ~/dedeki
docker compose -f docker-compose.prod.yml logs -f app
git pull && docker compose -f docker-compose.prod.yml up -d --build
docker exec dedeki-db pg_dump -U dedeki dedeki > backup-$(date +%F).sql
```

---

## Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---------|-------------|
| `#!/usr/bin/env: No such file or directory` | BOM w pliku — `git pull` (naprawiony skrypt) lub: `sed -i '1s/^\xEF\xBB\xBF//' deploy/scripts/setup-oracle.sh` |
| Brak docker compose | `curl -fsSL https://get.docker.com \| sudo sh` potem `sudo apt install -y docker-compose-plugin` |
| Strona się nie ładuje | Security List Oracle (3000/80) + `ufw` |
| Błąd JWT_SECRET | Min. 32 znaki, `NODE_ENV=production` |
| WebSocket nie działa | `SOCKET_CORS_ORIGIN` = dokładny URL (http/https) |
| Brak miejsca | `docker system prune -a` (ostrożnie) |

---

## Checklist przed produkcją

- [ ] Silne `POSTGRES_PASSWORD` i `JWT_SECRET`
- [ ] `NODE_ENV=production`
- [ ] `SOCKET_CORS_ORIGIN` = rzeczywisty adres użytkowników
- [ ] Porty otwarte w Oracle Security List
- [ ] Kopia zapasowa `.env`

