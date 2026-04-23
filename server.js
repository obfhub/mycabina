const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve gallery photos as static files
app.use('/galerii', express.static(path.join(__dirname, 'galerii')));

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