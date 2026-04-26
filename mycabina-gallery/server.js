const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001; // Gallery on port 3001
const EVENTS_DIR = path.join(__dirname, 'events');

// Supported image extensions
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve event images statically (no auth needed on static route)
app.use('/photos', express.static(EVENTS_DIR));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', eventDir: EVENTS_DIR });
});

// Debug: list events
app.get('/api/events', (req, res) => {
  if (!fs.existsSync(EVENTS_DIR)) {
    return res.json({ error: 'Events directory not found', path: EVENTS_DIR });
  }
  const events = fs.readdirSync(EVENTS_DIR).filter(f => {
    return fs.statSync(path.join(EVENTS_DIR, f)).isDirectory();
  });
  res.json({ events, eventsDir: EVENTS_DIR });
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'mycabina-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// Helper: get event folder path
function getEventDir(eventName) {
  // Sanitize: only allow alphanumeric, dash, underscore + convert to lowercase
  const safe = eventName.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  return path.join(EVENTS_DIR, safe);
}

// Helper: read password for event
function getEventPassword(eventDir) {
  const passFile = path.join(eventDir, 'pass.json');
  if (!fs.existsSync(passFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(passFile, 'utf8'));
    return data.password || null;
  } catch {
    return null;
  }
}

// Helper: get all images from event folder
function getEventImages(eventDir, eventName) {
  if (!fs.existsSync(eventDir)) return [];
  return fs.readdirSync(eventDir)
    .filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()) && !f.startsWith('.'))
    .sort()
    .map(f => `/photos/${eventName}/${f}`);
}

// Login POST
app.post('/:event/login', (req, res) => {
  const { event } = req.params;
  const { password } = req.body;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  const eventDir = getEventDir(event);

  if (!fs.existsSync(eventDir)) {
    return res.status(404).send('Event not found');
  }

  const correctPassword = getEventPassword(eventDir);
  if (!correctPassword) {
    return res.status(500).send('Password not configured for this event');
  }

  if (password === correctPassword) {
    req.session[`auth_${safe}`] = true;
    return res.redirect(`/${safe}`);
  } else {
    return res.redirect(`/${safe}?error=1`);
  }
});

// Logout
app.get('/:event/logout', (req, res) => {
  const { event } = req.params;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  req.session[`auth_${safe}`] = false;
  res.redirect(`/${safe}`);
});

// Main gallery route
app.get('/:event', (req, res) => {
  const { event } = req.params;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  const eventDir = getEventDir(event);

  if (!fs.existsSync(eventDir)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }

  const sessionKey = `auth_${safe}`;
  const isAuthenticated = req.session[sessionKey] === true;
  const hasError = req.query.error === '1';

  if (!isAuthenticated) {
    return res.send(renderLoginPage(safe, hasError));
  }

  const images = getEventImages(eventDir, safe);
  return res.send(renderGalleryPage(safe, images));
});

// 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`MyCabina Gallery running on port ${PORT}`);
});

// ─── RENDER FUNCTIONS ─────────────────────────────────────────────────────────

function renderLoginPage(eventName, hasError) {
  const displayName = eventName.replace(/[-_]/g, ' ');
  return `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Galerie — ${displayName} | MyCabina</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --serif: 'Cormorant Garamond', Georgia, serif;
      --sans: 'DM Sans', system-ui, sans-serif;
      --brown: #6b3e1d;
      --brown-light: #8b5a2b;
      --brown-pale: #d8b98a;
      --cream: #f7f2ea;
      --cream-dark: #eee4d2;
      --ink: #1a140e;
      --ink-mid: #4b3a2a;
      --ink-soft: #8c7a63;
    }
    html, body { height: 100%; }
    body {
      font-family: var(--sans);
      background: var(--cream);
      color: var(--ink);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      position: relative;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
      opacity: .35;
    }
    .login-wrap {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 420px;
      padding: 2rem;
      animation: fadeUp .6s ease both;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .login-logo {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .login-logo a {
      text-decoration: none;
      font-family: var(--serif);
      font-size: 2rem;
      font-weight: 300;
      color: var(--brown);
      letter-spacing: .04em;
    }
    .login-card {
      background: #fff;
      border: 1px solid var(--cream-dark);
      border-radius: 4px;
      padding: 2.5rem 2.5rem 2rem;
      box-shadow: 0 4px 32px rgba(107,62,29,.06);
    }
    .event-tag {
      font-size: .68rem;
      letter-spacing: .15em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: .5rem;
    }
    .login-title {
      font-family: var(--serif);
      font-size: 1.8rem;
      font-weight: 400;
      color: var(--ink);
      margin-bottom: .4rem;
      line-height: 1.2;
      text-transform: capitalize;
    }
    .login-subtitle {
      font-size: .82rem;
      color: var(--ink-soft);
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    .field-label {
      display: block;
      font-size: .72rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--ink-mid);
      margin-bottom: .5rem;
    }
    .field-input {
      width: 100%;
      padding: .75rem 1rem;
      border: 1px solid var(--cream-dark);
      border-radius: 2px;
      background: var(--cream);
      font-family: var(--sans);
      font-size: .9rem;
      color: var(--ink);
      outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    .field-input:focus {
      border-color: var(--brown-pale);
      box-shadow: 0 0 0 3px rgba(216,185,138,.2);
    }
    .error-msg {
      margin-top: .75rem;
      padding: .6rem .9rem;
      background: #fdf2f2;
      border: 1px solid #f5c6c6;
      border-radius: 2px;
      font-size: .8rem;
      color: #9b2c2c;
    }
    .btn-login {
      margin-top: 1.5rem;
      width: 100%;
      padding: .85rem;
      background: var(--brown);
      color: #fff;
      border: none;
      border-radius: 2px;
      font-family: var(--sans);
      font-size: .8rem;
      font-weight: 500;
      letter-spacing: .1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background .25s, transform .15s;
    }
    .btn-login:hover { background: var(--brown-light); transform: translateY(-1px); }
    .btn-login:active { transform: translateY(0); }
    .login-footer {
      text-align: center;
      margin-top: 1.5rem;
      font-size: .75rem;
      color: var(--ink-soft);
    }
    .login-footer a { color: var(--brown); text-decoration: none; }
    .lock-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: var(--cream-dark);
      border-radius: 50%;
      margin-bottom: 1.2rem;
    }
    .lock-icon svg { width: 20px; height: 20px; stroke: var(--brown); }
    .divider {
      width: 32px;
      height: 1px;
      background: var(--brown-pale);
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-logo">
      <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: center; margin-bottom: 1rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="#6b3e1d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px;">
          <rect x="2" y="2" width="20" height="20" rx="5"/>
          <circle cx="12" cy="12" r="3.5"/>
          <circle cx="17.5" cy="6.5" r="1" fill="#6b3e1d"/>
        </svg>
        <span style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.8rem; font-weight: 300; color: #6b3e1d; letter-spacing: 0.04em;">MyCabina</span>
      </div>
    </div>
    <div class="login-card">
      <p class="event-tag">Galerie privată</p>
      <h1 class="login-title">${displayName}</h1>
      <div class="divider"></div>
      <p class="login-subtitle">Introdu parola primită pentru a accesa fotografiile evenimentului.</p>
      <form method="POST" action="/${eventName}/login">
        <label class="field-label" for="password">Parolă</label>
        <input class="field-input" type="password" id="password" name="password" placeholder="••••••••" autofocus required/>
        ${hasError ? '<p class="error-msg">Parolă incorectă. Încearcă din nou.</p>' : ''}
        <button type="submit" class="btn-login">Accesează galeria</button>
      </form>
    </div>
    <p class="login-footer">
      Ai probleme? <a href="https://wa.me/37360996464">Contactează-ne</a>
    </p>
  </div>
</body>
</html>`;
}

function renderGalleryPage(eventName, images) {
  const displayName = eventName.replace(/[-_]/g, ' ');
  const imageCards = images.map((src, i) => `
    <div class="photo-item" style="animation-delay:${(i % 20) * 0.04}s" onclick="openLightbox(${i})">
      <img src="${src}" alt="Foto ${i+1}" loading="lazy"/>
    </div>
  `).join('');

  const lightboxImgs = images.map((src, i) => `
    <div class="lb-slide" id="lb-${i}">
      <img src="${src}" alt="Foto ${i+1}"/>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Galerie — ${displayName} | MyCabina</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --serif: 'Cormorant Garamond', Georgia, serif;
      --sans: 'DM Sans', system-ui, sans-serif;
      --brown: #6b3e1d;
      --brown-light: #8b5a2b;
      --brown-pale: #d8b98a;
      --cream: #f7f2ea;
      --cream-dark: #eee4d2;
      --ink: #1a140e;
      --ink-mid: #4b3a2a;
      --ink-soft: #8c7a63;
    }
    body {
      font-family: var(--sans);
      background: var(--cream);
      color: var(--ink);
      min-height: 100dvh;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
      opacity: .35;
    }

    /* HEADER */
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(247,242,234,.92);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--cream-dark);
      padding: 0 2.5rem;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      text-decoration: none;
    }
    .header-logo img {
      height: 32px;
      width: auto;
      max-width: 100px;
      display: block;
      flex-shrink: 0;
    }
    .header-logo .logo-icon {
      height: 32px;
      width: auto;
      display: block;
      flex-shrink: 0;
    }
    .header-logo .logo-text {
      height: 32px;
      width: auto;
      display: block;
      flex-shrink: 0;
      margin-left: -8px;
    }
    .header-logo:hover img {
      opacity: .8;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }
    .photo-count {
      font-size: .75rem;
      color: var(--ink-soft);
      letter-spacing: .05em;
    }
    .btn-logout {
      font-size: .72rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--ink-soft);
      text-decoration: none;
      padding: .35rem .8rem;
      border: 1px solid var(--cream-dark);
      border-radius: 2px;
      transition: all .2s;
    }
    .btn-logout:hover { color: var(--brown); border-color: var(--brown-pale); }

    /* HERO */
    .gallery-hero {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 5rem 2rem 3.5rem;
    }
    .gallery-hero-tag {
      font-size: .68rem;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: .8rem;
    }
    .gallery-hero-title {
      font-family: var(--serif);
      font-size: clamp(2.5rem, 6vw, 4.5rem);
      font-weight: 300;
      color: var(--ink);
      line-height: 1.1;
      text-transform: capitalize;
      margin-bottom: 1rem;
    }
    .gallery-hero-title em {
      font-style: italic;
      color: var(--brown);
    }
    .gallery-divider {
      width: 48px;
      height: 1px;
      background: var(--brown-pale);
      margin: 0 auto 1.2rem;
    }
    .gallery-hero-sub {
      font-size: .85rem;
      color: var(--ink-soft);
      max-width: 360px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* DOWNLOAD ALL */
    .download-bar {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: center;
      margin-bottom: 3rem;
    }
    .btn-download-all {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      padding: .75rem 1.8rem;
      background: var(--brown);
      color: #fff;
      text-decoration: none;
      font-size: .78rem;
      font-weight: 500;
      letter-spacing: .1em;
      text-transform: uppercase;
      border-radius: 2px;
      border: none;
      cursor: pointer;
      transition: background .25s, transform .15s;
    }
    .btn-download-all:hover { background: var(--brown-light); transform: translateY(-1px); }
    .btn-download-all svg { width: 15px; height: 15px; }

    /* GRID */
    .gallery-grid {
      position: relative;
      z-index: 1;
      columns: 4;
      column-gap: 12px;
      padding: 0 2.5rem 4rem;
      max-width: 1400px;
      margin: 0 auto;
    }
    @media (max-width: 1100px) { .gallery-grid { columns: 3; } }
    @media (max-width: 700px) { .gallery-grid { columns: 2; padding: 0 1rem 3rem; } }
    @media (max-width: 400px) { .gallery-grid { columns: 1; } }

    .photo-item {
      break-inside: avoid;
      margin-bottom: 12px;
      cursor: pointer;
      overflow: hidden;
      border-radius: 3px;
      opacity: 0;
      animation: photoIn .5s ease forwards;
    }
    @keyframes photoIn {
      from { opacity: 0; transform: scale(.97); }
      to   { opacity: 1; transform: scale(1); }
    }
    .photo-item img {
      width: 100%;
      height: auto;
      display: block;
      transition: transform .4s ease, filter .4s ease;
      filter: brightness(.96);
    }
    .photo-item:hover img {
      transform: scale(1.03);
      filter: brightness(1.02);
    }

    /* EMPTY STATE */
    .empty-state {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 5rem 2rem;
      color: var(--ink-soft);
    }
    .empty-state svg { width: 48px; height: 48px; stroke: var(--brown-pale); margin-bottom: 1rem; }
    .empty-state h3 { font-family: var(--serif); font-size: 1.5rem; font-weight: 300; margin-bottom: .5rem; }
    .empty-state p { font-size: .85rem; line-height: 1.6; }

    /* LIGHTBOX */
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(26,20,14,.95);
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(8px);
    }
    .lightbox.open { display: flex; }
    .lb-slide { display: none; max-width: 90vw; max-height: 90dvh; }
    .lb-slide.active { display: flex; align-items: center; justify-content: center; }
    .lb-slide img { max-width: 90vw; max-height: 90dvh; object-fit: contain; border-radius: 2px; }
    .lb-close {
      position: fixed;
      top: 1.5rem;
      right: 1.5rem;
      background: none;
      border: none;
      color: rgba(247,242,234,.7);
      cursor: pointer;
      padding: .5rem;
      transition: color .2s;
    }
    .lb-close:hover { color: #fff; }
    .lb-close svg { width: 28px; height: 28px; }
    .lb-nav {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(247,242,234,.1);
      border: 1px solid rgba(247,242,234,.15);
      border-radius: 2px;
      color: rgba(247,242,234,.8);
      cursor: pointer;
      padding: .8rem .6rem;
      transition: background .2s, color .2s;
    }
    .lb-nav:hover { background: rgba(247,242,234,.2); color: #fff; }
    .lb-nav svg { width: 22px; height: 22px; }
    .lb-prev { left: 1.5rem; }
    .lb-next { right: 1.5rem; }
    .lb-counter {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      font-size: .75rem;
      letter-spacing: .1em;
      color: rgba(247,242,234,.5);
    }
    .lb-download {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      padding: .5rem 1rem;
      background: rgba(107,62,29,.8);
      color: #fff;
      text-decoration: none;
      font-size: .72rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      border-radius: 2px;
      transition: background .2s;
    }
    .lb-download:hover { background: rgba(139,90,43,.9); }
    .lb-download svg { width: 13px; height: 13px; }

    /* SOCIAL SHARE */
    .lb-social {
      position: fixed;
      bottom: 1.5rem;
      left: 1.5rem;
      display: flex;
      align-items: center;
      gap: .8rem;
    }
    .lb-share-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(107,62,29,.8);
      color: #fff;
      border: none;
      cursor: pointer;
      transition: background .2s, transform .15s;
      text-decoration: none;
    }
    .lb-share-btn:hover {
      background: rgba(139,90,43,.9);
      transform: scale(1.1);
    }
    .lb-share-btn svg {
      width: 18px;
      height: 18px;
    }

    /* FOOTER */
    footer {
      position: relative;
      z-index: 1;
      border-top: 1px solid var(--cream-dark);
      padding: 2rem 2.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .footer-brand {
      font-family: var(--serif);
      font-size: 1.1rem;
      font-weight: 300;
      color: var(--brown);
      text-decoration: none;
    }
    .footer-copy {
      font-size: .72rem;
      color: var(--ink-soft);
    }
  </style>
</head>
<body>

<header>
  <a href="https://mycabina.com" class="header-logo" title="MyCabina">
    <img src="data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' stroke='%236b3e1d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='2' y='2' width='20' height='20' rx='5'/%3E%3Ccircle cx='12' cy='12' r='3.5'/%3E%3Ccircle cx='17.5' cy='6.5' r='1' fill='%236b3e1d'/%3E%3C/svg%3E" alt="MyCabina icon" class="logo-icon" />
    <img src="data:image/svg+xml,%3Csvg viewBox='0 0 60 30' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' font-family='Cormorant Garamond, Georgia, serif' font-size='16' font-weight='300' fill='%236b3e1d' text-anchor='middle' dominant-baseline='middle' letter-spacing='0.02em'%3EMyCabina%3C/text%3E%3C/svg%3E" alt="MyCabina" class="logo-text" />
  </a>
  <div class="header-right">
    <span class="photo-count">${images.length} fotografii</span>
    <a href="/${eventName}/logout" class="btn-logout">Ieși</a>
  </div>
</header>

<div class="gallery-hero">
  <p class="gallery-hero-tag">Galerie privată</p>
  <h1 class="gallery-hero-title"><em>${displayName}</em></h1>
  <div class="gallery-divider"></div>
  <p class="gallery-hero-sub">Amintirile tale sunt aici. Apasă pe orice fotografie pentru a o vedea mai mare.</p>
</div>

${images.length > 0 ? `
<div class="download-bar">
  <button class="btn-download-all" onclick="downloadAll()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Descarcă toate pozele
  </button>
</div>

<div class="gallery-grid">
  ${imageCards}
</div>
` : `
<div class="empty-state">
  <svg viewBox="0 0 24 24" fill="none" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
  <h3>Fotografiile vin în curând</h3>
  <p>Pozele de la eveniment vor apărea aici imediat ce sunt procesate.</p>
</div>
`}

<div class="lightbox" id="lightbox">
  <button class="lb-close" onclick="closeLightbox()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>
  <button class="lb-nav lb-prev" onclick="changeSlide(-1)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </button>
  ${lightboxImgs}
  <button class="lb-nav lb-next" onclick="changeSlide(1)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>
  <div class="lb-social" id="lb-social">
    <button class="lb-share-btn" onclick="shareToInstagram()" title="Add to Instagram Story">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="2" width="20" height="20" rx="5"/>
        <circle cx="12" cy="12" r="3.5"/>
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
      </svg>
    </button>
    <button class="lb-share-btn" onclick="shareToFacebook()" title="Add to Facebook Story">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    </button>
  </div>
  <div class="lb-counter" id="lb-counter">1 / ${images.length}</div>
  <a class="lb-download" id="lb-dl" href="#" download>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Descarcă
  </a>
</div>

<footer>
  <a href="https://mycabina.com" class="footer-brand">MyCabina</a>
  <span class="footer-copy">© 2026 MyCabina. Galerie privată.</span>
</footer>

<script>
  const images = ${JSON.stringify(images)};
  let current = 0;

  function openLightbox(i) {
    current = i;
    document.getElementById('lightbox').classList.add('open');
    updateSlide();
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.body.style.overflow = '';
  }

  function changeSlide(dir) {
    current = (current + dir + images.length) % images.length;
    updateSlide();
  }

  function updateSlide() {
    document.querySelectorAll('.lb-slide').forEach((s, i) => {
      s.classList.toggle('active', i === current);
    });
    document.getElementById('lb-counter').textContent = (current + 1) + ' / ' + images.length;
    document.getElementById('lb-dl').href = images[current];
  }

  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') changeSlide(-1);
    if (e.key === 'ArrowRight') changeSlide(1);
  });

  // Touch swipe
  let touchX = 0;
  document.getElementById('lightbox').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; });
  document.getElementById('lightbox').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) changeSlide(dx < 0 ? 1 : -1);
  });

  // Download all — triggers one by one
  function downloadAll() {
    images.forEach((src, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = src;
        a.download = 'mycabina-' + (i + 1) + '.jpg';
        a.click();
      }, i * 200);
    });
  }

  // Share to Instagram Story
  function shareToInstagram() {
    const currentImage = images[current];
    
    // For mobile: use Web Share API if available
    if (navigator.share) {
      fetch(currentImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'mycabina-photo.jpg', { type: 'image/jpeg' });
          navigator.share({
            files: [file],
            title: 'MyCabina Photo',
            text: 'Check out this memory from MyCabina!'
          }).catch(err => {
            // User may have cancelled - that's ok
            console.log('Share cancelled or not supported');
          });
        })
        .catch(() => fallbackInstagramShare());
    } else {
      // Fallback for desktop and unsupported mobile browsers
      fallbackInstagramShare();
    }
  }

  function fallbackInstagramShare() {
    // Open Instagram directly with intent to share
    const instagramUrl = 'https://www.instagram.com/';
    
    // Check if Instagram app is installed on mobile
    const isStandalone = window.navigator.standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isAndroid || isIOS) {
      // Try to open Instagram app
      const instagramAppUrl = 'instagram://share?url=' + encodeURIComponent(window.location.href);
      const timeout = setTimeout(() => {
        // If app doesn't open in 1.5 seconds, open web version
        window.open(instagramUrl, '_blank');
      }, 1500);
      
      window.location.href = instagramAppUrl;
      
      // Fallback in case the app is not installed
      window.addEventListener('blur', () => {
        clearTimeout(timeout);
      }, { once: true });
    } else {
      // Desktop - open Instagram in new tab
      window.open(instagramUrl, '_blank');
    }
  }

  // Share to Facebook Story
  function shareToFacebook() {
    const currentImage = images[current];
    const facebookShareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href);
    
    window.open(facebookShareUrl, 'facebook-share-dialog', 'width=626,height=436');
  }
</script>
</body>
</html>`;
}
