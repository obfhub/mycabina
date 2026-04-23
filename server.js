const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Serve gallery photos as static files
app.use('/galerii', express.static(path.join(__dirname, 'galerii')));

// Session middleware (for event galleries)
app.use(session({
  secret: process.env.SESSION_SECRET || 'mycabina-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// Serve event images statically
app.use('/photos', express.static(path.join(__dirname, 'mycabina-gallery', 'events')));

// ── Helpers ─────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function isImage(filename) {
  return IMAGE_EXTS.has(path.extname(filename).toLowerCase());
}

// Read optional metadata file: galerii/<folder>/meta.json
// Format: { "title": "Nunta Ana & Ion", "date": "2026-06-14" }
function readMeta(folder) {
  try {
    const metaPath = path.join(__dirname, 'galerii', folder, 'meta.json');
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return {};
  }
}

// ── Resend helper ────────────────────────────────────────────
async function sendEmail(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'MyCabina <onboarding@resend.dev>',
      to: [process.env.EMAIL_TO],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

// ── API: Get gallery metadata + photo list ───────────────────
// GET /api/galerie/:folder
app.get('/api/galerie/:folder', (req, res) => {
  const folder = req.params.folder;

  // Security: block path traversal
  if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
    return res.status(400).json({ error: 'Invalid folder name.' });
  }

  const galleryDir = path.join(__dirname, 'galerii', folder);

  if (!fs.existsSync(galleryDir) || !fs.statSync(galleryDir).isDirectory()) {
    return res.status(404).json({ error: 'Gallery not found.' });
  }

  const meta = readMeta(folder);

  let files;
  try {
    files = fs.readdirSync(galleryDir)
      .filter(f => isImage(f))
      .sort(); // alphabetical — rename files as 001.jpg, 002.jpg etc for order control
  } catch {
    return res.status(500).json({ error: 'Could not read gallery.' });
  }

  const photos = files.map(f => ({
    filename: f,
    url: `/galerii/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`,
  }));

  res.json({
    folder,
    title: meta.title || formatFolderName(folder),
    eventDate: meta.date || null,
    photoCount: photos.length,
    photos,
  });
});

// ── API: Download all photos as ZIP ─────────────────────────
// GET /api/galerie/:folder/download
app.get('/api/galerie/:folder/download', (req, res) => {
  const folder = req.params.folder;

  if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
    return res.status(400).send('Invalid folder name.');
  }

  const galleryDir = path.join(__dirname, 'galerii', folder);

  if (!fs.existsSync(galleryDir)) {
    return res.status(404).send('Gallery not found.');
  }

  const files = fs.readdirSync(galleryDir).filter(f => isImage(f));

  if (files.length === 0) {
    return res.status(404).send('No photos in this gallery.');
  }

  const meta = readMeta(folder);
  const zipName = `MyCabina-${folder}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  files.forEach(f => {
    archive.file(path.join(galleryDir, f), { name: f });
  });

  archive.finalize();
});

// ── Rezervare endpoint ───────────────────────────────────────
app.post('/api/rezervare', async (req, res) => {
  const { name, phone, date, eventType, location, guests, package: pkg, message } = req.body;

  if (!name || !phone || !date || !eventType || !location || !pkg) {
    return res.status(400).json({ error: 'Campuri obligatorii lipsa.' });
  }

  const pkgLabels = {
    '1ora-180':  'Petrecere — 1 ora (180EUR)',
    '2ore-250':  'Nunta — 2 ore (250EUR)',
    '3ore-320':  'Eveniment Mare — 3 ore (320EUR)',
    '5ore-420':  'Eveniment Complet — 5 ore (420EUR)',
  };

  const eventLabels = {
    nunta: 'Nunta', botez: 'Botez', petrecere: 'Petrecere',
    corporate: 'Corporativ', aniversare: 'Aniversare', altul: 'Alt eveniment',
  };

  const html = `
    <div style="font-family:sans-serif;max-width:560px;color:#1a140e;">
      <h2 style="color:#6b3e1d;border-bottom:1px solid #d8b98a;padding-bottom:12px;">Rezervare noua MyCabina</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:8px 0;color:#8c7a63;width:160px;">Nume</td><td style="padding:8px 0;"><strong>${name}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#8c7a63;">Telefon</td><td style="padding:8px 0;"><strong>${phone}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#8c7a63;">Data</td><td style="padding:8px 0;"><strong>${date}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#8c7a63;">Tip eveniment</td><td style="padding:8px 0;">${eventLabels[eventType] || eventType}</td></tr>
        <tr><td style="padding:8px 0;color:#8c7a63;">Localitate</td><td style="padding:8px 0;">${location}</td></tr>
        <tr><td style="padding:8px 0;color:#8c7a63;">Nr. invitati</td><td style="padding:8px 0;">${guests || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#8c7a63;">Pachet</td><td style="padding:8px 0;"><strong style="color:#6b3e1d;">${pkgLabels[pkg] || pkg}</strong></td></tr>
        ${message ? `<tr><td style="padding:8px 0;color:#8c7a63;vertical-align:top;">Detalii</td><td style="padding:8px 0;">${message}</td></tr>` : ''}
      </table>
      <div style="margin-top:24px;padding:14px 18px;background:#f7f2ea;border-left:3px solid #6b3e1d;font-size:13px;color:#4b3a2a;">
        Contacteaza clientul la <strong>${phone}</strong>.
      </div>
    </div>
  `;

  try {
    await sendEmail(`Rezervare noua — ${name} — ${date}`, html);
    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Gallery page route ────────────────────────────────────────
// All /galerie/* routes → serve galerie.html (JS handles the rest)
app.get('/galerie/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'galerie.html'));
});

// ─── EVENT GALLERY ROUTES ────────────────────────────────────

const EVENTS_DIR = path.join(__dirname, 'mycabina-gallery', 'events');
const EVENT_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'];

function getEventDir(eventName) {
  const safe = eventName.replace(/[^a-zA-Z0-9\-_]/g, '');
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
    .filter(f => EVENT_IMAGE_EXTS.includes(path.extname(f).toLowerCase()) && !f.startsWith('.'))
    .sort()
    .map(f => `/photos/${eventName}/${f}`);
}

// Login POST
app.post('/:event/login', (req, res) => {
  const { event } = req.params;
  const { password } = req.body;
  const eventDir = getEventDir(event);

  if (!fs.existsSync(eventDir)) {
    return res.status(404).send('Event not found');
  }

  const correctPassword = getEventPassword(eventDir);
  if (!correctPassword) {
    return res.status(500).send('Password not configured for this event');
  }

  if (password === correctPassword) {
    req.session[`auth_${event}`] = true;
    return res.redirect(`/${event}`);
  } else {
    return res.redirect(`/${event}?error=1`);
  }
});

// Logout
app.get('/:event/logout', (req, res) => {
  const { event } = req.params;
  req.session[`auth_${event}`] = false;
  res.redirect(`/${event}`);
});

// Multer configuration for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const event = req.body.event || '';
    const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '');
    const eventDir = path.join(EVENTS_DIR, safe);
    cb(null, eventDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (EVENT_IMAGE_EXTS.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Upload endpoint: POST /:event/upload
app.post('/:event/upload', upload.array('photos', 50), (req, res) => {
  const event = req.params.event;
  const password = req.body.password;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '');
  const eventDir = getEventDir(safe);

  // Validate event exists
  if (!fs.existsSync(eventDir)) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // Validate password
  const correctPassword = getEventPassword(eventDir);
  if (password !== correctPassword) {
    // Delete uploaded files if password wrong
    if (req.files) {
      req.files.forEach(f => fs.unlinkSync(f.path));
    }
    return res.status(401).json({ error: 'Invalid password' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploaded = req.files.map(f => ({
    filename: f.filename,
    size: f.size,
  }));

  res.json({
    success: true,
    message: `${req.files.length} photo(s) uploaded`,
    files: uploaded,
  });
});

// Upload page: GET /:event/upload
app.get('/:event/upload', (req, res) => {
  const event = req.params.event;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '');
  const eventDir = getEventDir(safe);

  if (!fs.existsSync(eventDir)) {
    return res.status(404).send('Event not found');
  }

  const displayName = safe.replace(/[-_]/g, ' ');
  return res.send(renderUploadPage(safe, displayName));
});

function renderUploadPage(eventName, displayName) {
  return \`<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Încarcă fotos — \${displayName} | MyCabina</title>
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
      --ink-soft: #8c7a63;
    }
    html, body { height: 100%; }
    body {
      font-family: var(--sans);
      background: var(--cream);
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: 2rem;
    }
    .upload-wrap {
      width: 100%;
      max-width: 500px;
    }
    .upload-card {
      background: #fff;
      border: 1px solid var(--cream-dark);
      border-radius: 4px;
      padding: 3rem 2.5rem;
      box-shadow: 0 4px 32px rgba(107,62,29,.06);
    }
    .upload-title {
      font-family: var(--serif);
      font-size: 2rem;
      font-weight: 400;
      color: var(--ink);
      margin-bottom: 1rem;
      text-transform: capitalize;
    }
    .upload-subtitle {
      font-size: .85rem;
      color: var(--ink-soft);
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    .dropzone {
      border: 2px dashed var(--brown-pale);
      border-radius: 4px;
      padding: 2.5rem;
      text-align: center;
      cursor: pointer;
      transition: all .3s;
      margin-bottom: 1.5rem;
      background: rgba(216,185,138,.08);
    }
    .dropzone:hover, .dropzone.active {
      border-color: var(--brown);
      background: rgba(216,185,138,.15);
    }
    .dropzone-icon {
      font-size: 2.5rem;
      margin-bottom: .8rem;
    }
    .dropzone-text {
      font-size: .9rem;
      color: var(--ink);
      margin-bottom: .3rem;
    }
    .dropzone-hint {
      font-size: .75rem;
      color: var(--ink-soft);
    }
    .file-input {
      display: none;
    }
    .field-label {
      display: block;
      font-size: .72rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: .5rem;
      margin-top: 1.5rem;
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
    }
    .field-input:focus {
      border-color: var(--brown-pale);
      box-shadow: 0 0 0 3px rgba(216,185,138,.2);
    }
    .btn-upload {
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
      transition: background .25s;
    }
    .btn-upload:hover { background: var(--brown-light); }
    .btn-upload:disabled {
      background: var(--ink-soft);
      cursor: not-allowed;
      opacity: .6;
    }
    .file-list {
      margin-top: 1.5rem;
      padding: 1rem;
      background: var(--cream);
      border-radius: 2px;
      font-size: .85rem;
      max-height: 200px;
      overflow-y: auto;
    }
    .file-item {
      padding: .5rem 0;
      border-bottom: 1px solid var(--cream-dark);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .file-item:last-child {
      border-bottom: none;
    }
    .file-name {
      color: var(--ink);
    }
    .file-remove {
      color: var(--brown-pale);
      cursor: pointer;
      font-weight: bold;
    }
    .file-remove:hover {
      color: var(--brown);
    }
    .message {
      margin-top: 1rem;
      padding: .75rem 1rem;
      border-radius: 2px;
      font-size: .85rem;
      display: none;
    }
    .message.success {
      background: #e8f5e9;
      color: #2e7d32;
      border: 1px solid #a5d6a7;
    }
    .message.error {
      background: #ffebee;
      color: #c62828;
      border: 1px solid #ef9a9a;
    }
    .uploading {
      display: none;
      text-align: center;
      color: var(--ink-soft);
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="upload-wrap">
    <div class="upload-card">
      <h1 class="upload-title">\${displayName}</h1>
      <p class="upload-subtitle">Încarcă fotografiile din evenimentul tău. Drag & drop sau click pentru a selecta.</p>

      <form id="uploadForm" enctype="multipart/form-data">
        <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
          <div class="dropzone-icon">📸</div>
          <p class="dropzone-text">Trage imaginile aici</p>
          <p class="dropzone-hint">sau click pentru a selecta</p>
        </div>

        <input type="file" id="fileInput" class="file-input" multiple accept="image/*"/>

        <div id="fileList" class="file-list" style="display:none;"></div>

        <label class="field-label" for="password">Parolă eveniment</label>
        <input type="password" id="password" name="password" class="field-input" placeholder="Introdu parola" required/>

        <button type="submit" class="btn-upload" id="uploadBtn">Încarcă fotografiile</button>
      </form>

      <div class="uploading" id="uploading">
        ⏳ Se încarcă... Stai liniștit
      </div>

      <div id="message" class="message"></div>
    </div>
  </div>

  <script>
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const form = document.getElementById('uploadForm');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploading = document.getElementById('uploading');
    const message = document.getElementById('message');
    let selectedFiles = [];

    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, e => e.preventDefault());
    });
    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, () => dropzone.classList.add('active'));
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, () => dropzone.classList.remove('active'));
    });

    dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files);
      selectedFiles.push(...files.filter(f => f.type.startsWith('image/')));
      updateFileList();
    });

    fileInput.addEventListener('change', (e) => {
      selectedFiles.push(...Array.from(e.target.files));
      updateFileList();
    });

    function updateFileList() {
      if (selectedFiles.length === 0) {
        fileList.style.display = 'none';
        return;
      }
      fileList.style.display = 'block';
      fileList.innerHTML = selectedFiles.map((f, i) => \`
        <div class="file-item">
          <span class="file-name">\${f.name}</span>
          <span class="file-remove" onclick="removeFile(\${i})">✕</span>
        </div>
      \`).join('');
    }

    function removeFile(idx) {
      selectedFiles.splice(idx, 1);
      updateFileList();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (selectedFiles.length === 0) {
        showMessage('Selectează cel puțin o imagine', 'error');
        return;
      }

      const password = document.getElementById('password').value;
      if (!password) {
        showMessage('Introdu parola evenimentului', 'error');
        return;
      }

      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('photos', f));
      formData.append('password', password);
      formData.append('event', '\${eventName}');

      uploadBtn.disabled = true;
      uploading.style.display = 'block';
      message.style.display = 'none';

      try {
        const res = await fetch('/\${eventName}/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (res.ok) {
          showMessage(\`✓ \${data.message}\`, 'success');
          selectedFiles = [];
          updateFileList();
          fileInput.value = '';
          setTimeout(() => window.location.href = '/\${eventName}', 2000);
        } else {
          showMessage(data.error || 'Upload failed', 'error');
        }
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        uploadBtn.disabled = false;
        uploading.style.display = 'none';
      }
    });

    function showMessage(text, type) {
      message.textContent = text;
      message.className = \`message \${type}\`;
      message.style.display = 'block';
    }
  </script>
</body>
</html>\`;
}

// Main event gallery route (but NOT for special routes like /api, /galerie, etc)
app.get('/:event', (req, res, next) => {
  // Skip if it matches known routes
  if (['api', 'galerie', 'galerii', 'photos', 'health', 'index', 'rezervare', 'guestbook', 'upload'].includes(req.params.event)) {
    return next();
  }
  
  const event = req.params.event;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '');
  const eventDir = getEventDir(safe);

  if (!fs.existsSync(eventDir)) {
    return next(); // Pass to 404 handler
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
      <a href="https://mycabina.com">MyCabina</a>
    </div>
    <div class="login-card">
      <div class="lock-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
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

  const html = `<!DOCTYPE html>
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
      font-family: var(--serif);
      font-size: 1.3rem;
      font-weight: 300;
      color: var(--brown);
      text-decoration: none;
      letter-spacing: .04em;
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
    .empty-state {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 5rem 2rem;
      color: var(--ink-soft);
    }
    .empty-state h3 { font-family: var(--serif); font-size: 1.5rem; font-weight: 300; margin-bottom: .5rem; }
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
    footer {
      position: relative;
      z-index: 1;
      border-top: 1px solid var(--cream-dark);
      padding: 2rem 2.5rem;
      text-align: center;
    }
    .footer-copy {
      font-size: .72rem;
      color: var(--ink-soft);
    }
  </style>
</head>
<body>
<header>
  <a href="https://mycabina.com" class="header-logo">MyCabina</a>
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
<div class="gallery-grid">
  ${imageCards}
</div>
` : `
<div class="empty-state">
  <h3>Fotografiile vin în curând</h3>
  <p>Pozele de la eveniment vor apărea aici imediat ce sunt procesate.</p>
</div>
`}
<div class="lightbox" id="lightbox">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <button class="lb-nav lb-prev" onclick="changeSlide(-1)">‹</button>
  ${lightboxImgs}
  <button class="lb-nav lb-next" onclick="changeSlide(1)">›</button>
  <div class="lb-counter" id="lb-counter">1 / ${images.length}</div>
</div>
<footer>
  <p class="footer-copy">© 2026 MyCabina. Galerie privată.</p>
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
  }
  document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') changeSlide(-1);
    if (e.key === 'ArrowRight') changeSlide(1);
  });
  let touchX = 0;
  document.getElementById('lightbox').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; });
  document.getElementById('lightbox').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) changeSlide(dx < 0 ? 1 : -1);
  });
</script>
</body>
</html>`;

  return html;
}

// ── Fallback ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Utils ──────────────────────────────────────────────────────
function formatFolderName(folder) {
  // "nunta-ana-ion-2026" → "Nunta Ana Ion 2026"
  return folder
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

app.listen(PORT, () => console.log(`MyCabina running on port ${PORT}`));