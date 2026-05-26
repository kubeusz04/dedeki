# Roll 1 — D&D 5e Virtual Tabletop

Aplikacja do prowadzenia sesji D&D online: czat, postacie, mapa bitewna z mgłą wojny, strefy/AoE, inicjatywa z auto-przewijaniem, kostki 2D z własnymi skórkami, biblioteka grafik tokenów, sklepy/łup, własne przedmioty, motywy interfejsu i panel MG.

## Wymagania

- Node.js 20+ (lub Docker)
- PostgreSQL 16+ (lub Docker — w composie jest gotowa baza)
- 1 GB RAM minimum (Oracle Cloud Free Tier wystarczy)

## Uruchomienie lokalne (Docker, najszybsze)

```bash
git clone https://github.com/kubeusz04/dedeki.git
cd dedeki
cp .env.example .env
docker compose up -d
```

Otwórz http://localhost:3000

## Uruchomienie lokalne (Node + baza w Dockerze)

```bash
cp .env.example .env
npm install
npm run db:up
npm start
```

Albo jednym poleceniem: `npm run local`

## Skrypty npm

| Skrypt | Opis |
|--------|------|
| `npm start` | Serwer Node |
| `npm run db:up` | Tylko PostgreSQL w Dockerze |
| `npm run db:down` | Zatrzymanie bazy |
| `npm run local` | Baza + serwer |
| `npm run stop` | Zatrzymanie kontenerów compose |

## Zmienne środowiskowe

Patrz `.env.example`. **W produkcji**: ustaw silny `JWT_SECRET` (min. 32 znaki) i `NODE_ENV=production`.

## Healthcheck

`GET /api/health` zwraca `{ "status": "ok" }`.

---

# Wdrożenie na Oracle Cloud (od zera, czysta instalacja)

Przewodnik zakłada **Oracle Linux 8/9** lub **Ubuntu 22.04** na maszynie ARM64 (VM.Standard.A1.Flex) lub x86. Wszystko stawiamy w Dockerze.

## Krok 1 — Podłącz się do serwera

```bash
ssh -i ~/.ssh/twoj_klucz.pem opc@TWOJ_IP_PUBLICZNY
# Ubuntu: ubuntu@... ; Oracle Linux: opc@...
```

## Krok 2 — Wyczyść poprzednią instalację (jeśli była)

```bash
sudo docker stop dedeki-app dedeki-db 2>/dev/null
sudo docker rm dedeki-app dedeki-db 2>/dev/null

# UWAGA: kasuje wszystkie kampanie/postacie/mapy z bazy
sudo docker volume rm $(sudo docker volume ls -q | grep dedeki) 2>/dev/null

sudo docker rmi $(sudo docker images -q dedeki*) 2>/dev/null
sudo rm -rf ~/dedeki ~/Roll1 ~/roll1
```

## Krok 3 — Zainstaluj Docker (jeśli go nie ma)

**Oracle Linux:**
```bash
sudo dnf install -y dnf-utils git
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

**Ubuntu:**
```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

Sprawdź:
```bash
sudo docker --version
sudo docker compose version
```

## Krok 4 — Sklonuj repozytorium z GitHub

```bash
cd ~
git clone https://github.com/kubeusz04/dedeki.git
cd dedeki
```

## Krok 5 — Skonfiguruj `.env` produkcyjny

```bash
cp .env.example .env
nano .env
```

Ustaw:
```
DATABASE_URL=postgresql://postgres:postgres@db:5432/dedeki
PORT=3000
JWT_SECRET=ZMIEN_NA_MIN_32_ZNAKOWY_RANDOMOWY_CIAG
NODE_ENV=production
SOCKET_CORS_ORIGIN=*
```

Zapisz: `Ctrl+O`, `Enter`, `Ctrl+X`.

Wygeneruj losowy JWT secret: `openssl rand -base64 48`

## Krok 6 — Otwórz port 3000 w firewall

**Oracle Cloud Security List**: w panelu Oracle dodaj Ingress Rule TCP 3000 dla 0.0.0.0/0.

**Na serwerze (Oracle Linux):**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

**Na serwerze (Ubuntu):**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
```

## Krok 7 — Zbuduj i uruchom

```bash
sudo docker compose up -d --build
```

Pierwsze uruchomienie potrwa kilka minut (build obrazu).

## Krok 8 — Sprawdź czy działa

```bash
sudo docker compose ps
sudo docker compose logs -f app
```

W przeglądarce: **http://TWOJ_IP_PUBLICZNY:3000**

Healthcheck: `curl http://localhost:3000/api/health`

---

# Aktualizacja istniejącej instalacji (bez kasowania danych)

```bash
cd ~/dedeki
git pull
sudo docker compose up -d --build
```

Baza jest w wolumenie i pozostaje nietknięta.

---

# Funkcje (skrót)

- **Mapa bitwy** — siatka z presetami rozdzielczości (720p–4K), zoom scrollem, panning Space/MMB, fullscreen, mgła wojny, ślady ruchu, blokady LoS
- **Strefy mapy** — trudny teren, lód, błoto, woda + niebezpieczne (ogień, kwas, trucizna, błyskawica, nekrotyk) zadające obrażenia podczas tury
- **Czary AoE** — geometria 5e (kula, sześcian, stożek, linia) + zużycie slotu i akcji wg RAW
- **Walka 5e** — auto-detekcja Attacks of Opportunity, akcja/bonus/reakcja, długi/krótki odpoczynek, znane czary, sloty per klasa
- **Kości 2D** — d4/d6/d8/d10/d12/d20/d100 obracające się jak felgi, własne skórki (presety + custom obrazy)
- **Auto-switch** — każdy rzut przełącza na panel kości na czas animacji i wraca
- **Biblioteka tokenów** — upload + galeria grafik per kampania, jeden obrazek dla wielu tokenów
- **Ekonomia** — handlarze, tabele łupu, **własne przedmioty** (broń/zbroja/tarcza/wyposażenie ze statystykami D&D)
- **Motywy UI** — presety + custom (kolory, gradienty, cienie) zapisywane lokalnie
- **Inicjatywa** — auto-przewijanie do aktywnego, integracja z mapą
- **Panel MG** — sterowanie NPC, dowolny HP +/-, przyznanie monet, wysyłka łupu

---

# Licencja

MIT
