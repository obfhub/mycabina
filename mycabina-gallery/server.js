const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const EVENTS_DIR = path.join(__dirname, 'events');

// Read SVG file at startup
let SVG_CONTENT = null;
const svgPath = path.join(__dirname, 'MyCabina.svg');
if (fs.existsSync(svgPath)) {
  SVG_CONTENT = fs.readFileSync(svgPath, 'utf8');
  console.log('✓ MyCabina.svg loaded successfully');
} else {
  console.warn('⚠ MyCabina.svg not found at:', svgPath);
}

// Supported image extensions
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve SVG logo
app.get('/MyCabina.svg', (req, res) => {
  if (SVG_CONTENT) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(SVG_CONTENT);
  } else {
    res.status(404).send('SVG file not found');
  }
});

// Serve event images statically
app.use('/photos', express.static(EVENTS_DIR));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    eventDir: EVENTS_DIR,
    svgLoaded: SVG_CONTENT ? 'YES ✓' : 'NO',
    svgSize: SVG_CONTENT ? (SVG_CONTENT.length / 1024).toFixed(2) + ' KB' : 'N/A'
  });
});

// Debug endpoint
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
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// Helper functions
function getEventDir(eventName) {
  const safe = eventName.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  return path.join(EVENTS_DIR, safe);
}

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

// ──────────────────────────────────────────────────────────────────────────
// MODERN MINIMALIST LOGIN PAGE
// ──────────────────────────────────────────────────────────────────────────

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
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --brown: #6b3e1d;
      --brown-light: #8b5a2b;
      --brown-pale: #d8b98a;
      --cream: #f7f2ea;
      --cream-dark: #eee4d2;
      --ink: #1a140e;
      --ink-soft: #8c7a63;
      --white: #ffffff;
    }
    
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: var(--cream);
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    
    .login-container {
      width: 100%;
      max-width: 420px;
      animation: fadeIn 0.6s ease;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .logo-section {
      text-align: center;
      margin-bottom: 4rem;
    }
    
    .logo {
      max-width: 160px;
      width: 100%;
      height: auto;
      margin: 0 auto;
    }
    
    .header {
      text-align: center;
      margin-bottom: 3rem;
    }
    
    .tag {
      font-size: 0.7rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 0.8rem;
      font-weight: 500;
    }
    
    .title {
      font-size: 2.2rem;
      font-weight: 300;
      color: var(--ink);
      margin-bottom: 0.5rem;
      text-transform: capitalize;
      letter-spacing: -0.5px;
    }
    
    .subtitle {
      font-size: 0.9rem;
      color: var(--ink-soft);
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    label {
      display: block;
      font-size: 0.75rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 0.6rem;
      font-weight: 500;
    }
    
    input {
      width: 100%;
      padding: 0.9rem 1.1rem;
      border: 1px solid var(--cream-dark);
      background: var(--white);
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 1rem;
      color: var(--ink);
      border-radius: 2px;
      transition: all 0.3s ease;
      outline: none;
    }
    
    input:focus {
      border-color: var(--brown-pale);
      box-shadow: 0 0 0 3px rgba(216, 185, 138, 0.15);
    }
    
    .error {
      display: ${hasError ? 'block' : 'none'};
      background: #fde8e8;
      border: 1px solid #f5b6b6;
      color: #c53030;
      padding: 0.8rem 1rem;
      border-radius: 2px;
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
      text-align: center;
    }
    
    button {
      width: 100%;
      padding: 1rem;
      background: var(--brown);
      color: var(--white);
      border: none;
      border-radius: 2px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 0.9rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 1rem;
    }
    
    button:hover {
      background: var(--brown-light);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(107, 62, 29, 0.2);
    }
    
    button:active {
      transform: translateY(0);
    }
    
    footer {
      text-align: center;
      margin-top: 3rem;
      font-size: 0.8rem;
      color: var(--ink-soft);
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="logo-section">
      <svg class="logo" viewBox="0 0 841.89 459.586" xmlns="http://www.w3.org/2000/svg">
        <image href="/MyCabina.svg" style="width: 100%; height: 100%;"/>
      </svg>
    </div>
    
    <div class="header">
      <p class="tag">Galerie privată</p>
      <h1 class="title">${displayName}</h1>
      <p class="subtitle">Introdu parola primită pentru a accesa fotografiile evenimentului.</p>
    </div>
    
    <form method="POST" action="/${eventName}/login">
      <div class="error">Parolă incorrectă. Încearcă din nou.</div>
      
      <div class="form-group">
        <label for="password">Parolă</label>
        <input type="password" id="password" name="password" placeholder="••••••••" autofocus required/>
      </div>
      
      <button type="submit">Intră în galerie</button>
    </form>
    
    <footer>
      <p>© 2026 MyCabina. Galerie privată.</p>
    </footer>
  </div>
</body>
</html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// MODERN MINIMALIST GALLERY PAGE WITH INSTAGRAM-STYLE GRID
// ──────────────────────────────────────────────────────────────────────────

function renderGalleryPage(eventName, images) {
  const displayName = eventName.replace(/[-_]/g, ' ');
  
  const photoGrid = images.map((img, i) => `
    <div class="photo-item" style="animation-delay: ${i * 30}ms;">
      <img src="${img}" alt="Fotografie ${i + 1}" onclick="openLightbox(${i})"/>
    </div>
  `).join('');
  
  const lightboxSlides = images.map((img, i) => `
    <div class="lightbox-slide" data-index="${i}">
      <img src="${img}" alt="Fotografie ${i + 1}"/>
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
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --brown: #6b3e1d;
      --brown-light: #8b5a2b;
      --brown-pale: #d8b98a;
      --cream: #f7f2ea;
      --cream-dark: #eee4d2;
      --ink: #1a140e;
      --ink-soft: #8c7a63;
      --white: #ffffff;
    }
    
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: var(--cream);
      color: var(--ink);
    }
    
    /* HEADER */
    header {
      position: sticky;
      top: 0;
      background: var(--cream);
      border-bottom: 1px solid var(--cream-dark);
      padding: 1.2rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 100;
      backdrop-filter: blur(8px);
      background: rgba(247, 242, 234, 0.95);
    }
    
    .header-logo {
      width: 100px;
      height: auto;
    }
    
    .header-logo img {
      width: 100%;
      height: auto;
      display: block;
    }
    
    .header-right {
      display: flex;
      align-items: center;
      gap: 2rem;
    }
    
    .photo-count {
      font-size: 0.85rem;
      color: var(--ink-soft);
      font-weight: 500;
      letter-spacing: 0.05em;
    }
    
    .logout-btn {
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--brown);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s ease;
      padding: 0.5rem 1rem;
      border-radius: 2px;
    }
    
    .logout-btn:hover {
      background: var(--cream-dark);
      color: var(--brown-light);
    }
    
    /* HERO */
    .gallery-hero {
      padding: 4rem 2rem;
      text-align: center;
      border-bottom: 1px solid var(--cream-dark);
    }
    
    .gallery-tag {
      font-size: 0.7rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 0.8rem;
      font-weight: 500;
    }
    
    .gallery-title {
      font-size: 2.5rem;
      font-weight: 300;
      color: var(--ink);
      margin-bottom: 1rem;
      text-transform: capitalize;
      letter-spacing: -0.5px;
    }
    
    .gallery-subtitle {
      font-size: 0.9rem;
      color: var(--ink-soft);
      margin-bottom: 2rem;
      max-width: 500px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.6;
    }
    
    .download-bar {
      display: flex;
      justify-content: center;
      padding: 1.5rem 0;
    }
    
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.8rem 1.5rem;
      background: var(--brown);
      color: var(--white);
      text-decoration: none;
      border-radius: 2px;
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      transition: all 0.3s ease;
      cursor: pointer;
      border: none;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    
    .download-btn:hover {
      background: var(--brown-light);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(107, 62, 29, 0.2);
    }
    
    /* GALLERY GRID */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1px;
      background: var(--cream-dark);
      padding: 1px;
      max-width: 1400px;
      margin: 0 auto;
    }
    
    @media (max-width: 1024px) {
      .gallery-grid {
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      }
    }
    
    @media (max-width: 640px) {
      .gallery-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 1px;
      }
    }
    
    .photo-item {
      aspect-ratio: 1;
      background: var(--white);
      overflow: hidden;
      cursor: pointer;
      position: relative;
      animation: fadeUp 0.5s ease backwards;
    }
    
    @keyframes fadeUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .photo-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: all 0.4s ease;
      filter: brightness(0.95);
    }
    
    .photo-item:hover img {
      transform: scale(1.05);
      filter: brightness(1);
    }
    
    /* EMPTY STATE */
    .empty-state {
      text-align: center;
      padding: 5rem 2rem;
      color: var(--ink-soft);
    }
    
    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    
    .empty-title {
      font-size: 1.5rem;
      font-weight: 300;
      color: var(--ink);
      margin-bottom: 0.5rem;
    }
    
    /* LIGHTBOX */
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(26, 20, 14, 0.98);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    
    .lightbox.open {
      display: flex;
    }
    
    .lightbox-slide {
      display: none;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .lightbox-slide.active {
      display: flex;
    }
    
    .lightbox-slide img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      border-radius: 2px;
    }
    
    .lightbox-close {
      position: fixed;
      top: 1.5rem;
      right: 1.5rem;
      background: none;
      border: none;
      color: rgba(247, 242, 234, 0.8);
      font-size: 2rem;
      cursor: pointer;
      padding: 0.5rem;
      transition: color 0.2s;
    }
    
    .lightbox-close:hover {
      color: var(--white);
    }
    
    .lightbox-nav {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(247, 242, 234, 0.15);
      border: 1px solid rgba(247, 242, 234, 0.2);
      color: rgba(247, 242, 234, 0.8);
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      border-radius: 2px;
      font-size: 1.2rem;
    }
    
    .lightbox-nav:hover {
      background: rgba(247, 242, 234, 0.25);
      color: var(--white);
    }
    
    .lightbox-prev {
      left: 1.5rem;
    }
    
    .lightbox-next {
      right: 1.5rem;
    }
    
    .lightbox-counter {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(247, 242, 234, 0.6);
      font-size: 0.8rem;
      letter-spacing: 0.05em;
    }
    
    .lightbox-download {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.7rem 1.2rem;
      background: rgba(107, 62, 29, 0.9);
      color: var(--white);
      text-decoration: none;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-radius: 2px;
      transition: all 0.2s;
      font-weight: 500;
    }
    
    .lightbox-download:hover {
      background: rgba(107, 62, 29, 1);
    }
    
    /* FOOTER */
    footer {
      text-align: center;
      padding: 2rem;
      border-top: 1px solid var(--cream-dark);
      font-size: 0.8rem;
      color: var(--ink-soft);
    }
  </style>
</head>
<body>

<header>
  <a href="https://mycabina.com" class="header-logo">
    <img src="/MyCabina.svg" alt="MyCabina"/>
  </a>
  <div class="header-right">
    <span class="photo-count">${images.length} fotografii</span>
    <a href="/${eventName}/logout" class="logout-btn">Ieși</a>
  </div>
</header>

<section class="gallery-hero">
  <p class="gallery-tag">Galerie privată</p>
  <h1 class="gallery-title">${displayName}</h1>
  <p class="gallery-subtitle">Fotografiile tale sunt aici. Apasă pe orice imagine pentru a o vedea în mărime completă.</p>
</section>

${images.length > 0 ? `
<div class="download-bar">
  <button class="download-btn" onclick="downloadAll()">
    ⬇ Descarcă toate pozele
  </button>
</div>

<div class="gallery-grid">
  ${photoGrid}
</div>
` : `
<div class="empty-state">
  <div class="empty-icon">📷</div>
  <h3 class="empty-title">Fotografiile vin în curând</h3>
  <p>Pozele de la eveniment vor apărea aici imediat ce sunt procesate.</p>
</div>
`}

<div class="lightbox" id="lightbox">
  <button class="lightbox-close" onclick="closeLightbox()">✕</button>
  <button class="lightbox-nav lightbox-prev" onclick="changeSlide(-1)">‹</button>
  <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
    ${lightboxSlides}
  </div>
  <button class="lightbox-nav lightbox-next" onclick="changeSlide(1)">›</button>
  <div class="lightbox-counter" id="lightbox-counter">1 / ${images.length}</div>
  <a class="lightbox-download" id="lightbox-download" href="#" download>⬇ Descarcă</a>
</div>

<footer>
  <p>© 2026 MyCabina. Galerie privată.</p>
</footer>

<script>
  const images = ${JSON.stringify(images)};
  let current = 0;
  
  function openLightbox(index) {
    current = index;
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
    document.querySelectorAll('.lightbox-slide').forEach((s, i) => {
      s.classList.toggle('active', i === current);
    });
    document.getElementById('lightbox-counter').textContent = (current + 1) + ' / ' + images.length;
    document.getElementById('lightbox-download').href = images[current];
  }
  
  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') changeSlide(-1);
    if (e.key === 'ArrowRight') changeSlide(1);
  });
  
  // Touch swipe
  let touchX = 0;
  document.getElementById('lightbox').addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
  });
  document.getElementById('lightbox').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) changeSlide(dx < 0 ? 1 : -1);
  });
  
  // Download all
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
</script>

</body>
</html>`;
}
