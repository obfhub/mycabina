# MyCabina 📸

Site web pentru servicii de cabină foto profesională.

## Fișiere

```
mycabina/
├── index.html       # Site-ul principal
├── MyCabina.svg     # Logo-ul brandului
├── hero.png         # Poza principală a cabinei
└── package.json     # Config pentru Railway
```

## Deploy pe Railway

1. Creează un repo pe GitHub și încarcă toate fișierele
2. Mergi pe [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Selectează repo-ul tău
4. Railway detectează automat `package.json` și rulează `npm start`
5. Site-ul e live! 🎉

## Personalizare

Înainte de deploy, actualizează în `index.html`:
- **Numărul de WhatsApp**: înlocuiește `37300000000` cu numărul tău real
- **Email-ul**: înlocuiește `contact@mycabina.ro` cu emailul tău
- **Fotografii galerie**: înlocuiește placeholder-ele din secțiunea Galerie cu poze reale

## Tehnologii

- HTML5 + CSS3 pură (zero dependențe JS externe)
- Fonturi: Cormorant Garamond + DM Sans (Google Fonts)
- Deploy: Railway via `serve`
