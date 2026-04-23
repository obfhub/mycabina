# MyCabina Gallery

Galerie foto privată pentru evenimente. Fiecare eveniment are URL propriu și parolă separată.

## Structura fișierelor

```
mycabina-gallery/
├── server.js          ← serverul principal
├── package.json
├── render.yaml        ← config Render
├── public/
│   └── 404.html
└── events/
    ├── nunta-ion-maria/   ← folder eveniment (numele = URL-ul)
    │   ├── pass.json      ← parola
    │   ├── foto1.jpg
    │   ├── foto2.jpg
    │   └── ...
    └── botez-sofia/
        ├── pass.json
        └── ...
```

## Cum funcționează

- `mycabina.com/nunta-ion-maria` → pagină login cu parolă
- Parola se citește din `events/nunta-ion-maria/pass.json`
- După autentificare → galerie masonry cu toate pozele
- Click pe poză → lightbox (navigare cu tastele ← →, swipe pe telefon)
- Buton "Descarcă toate pozele" + buton individual per poză

## Adăugare eveniment nou

1. Creezi un folder în `events/` cu numele evenimentului (fără spații, ex: `nunta-popescu`):
```bash
mkdir events/nunta-popescu
```

2. Creezi `pass.json` în folderul respectiv:
```json
{
  "password": "parola-ta-secreta"
}
```

3. Copiezi pozele din cabina foto direct în acel folder (jpg, jpeg, png, gif, webp, heic)

4. URL-ul devine automat: `mycabina.com/nunta-popescu`

## Deploy pe Render

### Prima oară:
1. Push codul pe GitHub
2. Pe Render → New Web Service → conectezi repo-ul
3. **Important**: activezi un **Disk** (persistent storage) în settings-ul serviciului:
   - Mount path: `/opt/render/project/src/events`
   - Size: 10GB (sau cât ai nevoie)
4. Deploy!

### Adăugare poze în timp real (în timpul evenimentului):
Ai două opțiuni:

**Opțiunea A — SSH pe Render:**
```bash
# Render oferă SSH pentru planurile plătite
ssh user@server
cp /path/to/photos/* /opt/render/project/src/events/nunta-popescu/
```

**Opțiunea B — Script upload (recomandat):**
Folosești `scp` sau un tool de sync din laptopul cabinei:
```bash
scp ./poze/*.jpg user@render-server:/opt/render/project/src/events/nunta-popescu/
```

**Opțiunea C — Adaugi un endpoint de upload** (dacă vrei din browser):
Spune-mi și adaug un endpoint protejat cu parolă admin pentru upload direct.

## Variabile de mediu Render

| Variabilă | Descriere |
|-----------|-----------|
| `SESSION_SECRET` | Secret pentru sesiuni (generat automat) |
| `PORT` | Port (setat automat de Render) |

## Format pass.json

```json
{
  "password": "parola-eveniment"
}
```

Parola e în text plain în fișier. Folderul `events/` nu e servit public — pozele sunt protejate de server.

## Extensii suportate

`.jpg` `.jpeg` `.png` `.gif` `.webp` `.heic`
