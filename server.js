const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname))); // serve files from root

// ── Email transporter (Gmail) ───────────────────────────────
// Set these in Railway → Variables:
//   EMAIL_USER  →  your Gmail address  (ex: mycabina@gmail.com)
//   EMAIL_PASS  →  Gmail App Password  (not your normal password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Rezervare endpoint ──────────────────────────────────────
app.post('/api/rezervare', async (req, res) => {
  const { name, phone, date, eventType, location, guests, package: pkg, message } = req.body;

  // Basic validation
  if (!name || !phone || !date || !eventType || !location || !pkg) {
    return res.status(400).json({ error: 'Câmpuri obligatorii lipsă.' });
  }

  const pkgLabels = {
    '1ora-180':  'Petrecere — 1 oră (€180)',
    '2ore-250':  'Nuntă — 2 ore (€250)',
    '3ore-320':  'Eveniment Mare — 3 ore (€320)',
    '5ore-420':  'Eveniment Complet — 5 ore (€420)',
  };

  const eventLabels = {
    nunta:      'Nuntă',
    botez:      'Botez',
    petrecere:  'Petrecere',
    corporate:  'Corporativ',
    aniversare: 'Aniversare',
    altul:      'Alt eveniment',
  };

  const emailBody = `
    <div style="font-family: sans-serif; max-width: 560px; color: #1a140e;">
      <h2 style="color: #6b3e1d; border-bottom: 1px solid #d8b98a; padding-bottom: 12px;">
        🎉 Rezervare nouă — MyCabina
      </h2>
      <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
        <tr><td style="padding: 8px 0; color: #8c7a63; width: 140px;">Nume</td><td style="padding: 8px 0;"><strong>${name}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #8c7a63;">Telefon</td><td style="padding: 8px 0;"><strong>${phone}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #8c7a63;">Data evenimentului</td><td style="padding: 8px 0;"><strong>${date}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #8c7a63;">Tip eveniment</td><td style="padding: 8px 0;">${eventLabels[eventType] || eventType}</td></tr>
        <tr><td style="padding: 8px 0; color: #8c7a63;">Localitate</td><td style="padding: 8px 0;">${location}</td></tr>
        <tr><td style="padding: 8px 0; color: #8c7a63;">Nr. invitați</td><td style="padding: 8px 0;">${guests || '—'}</td></tr>
        <tr><td style="padding: 8px 0; color: #8c7a63;">Pachet ales</td><td style="padding: 8px 0;"><strong style="color:#6b3e1d;">${pkgLabels[pkg] || pkg}</strong></td></tr>
        ${message ? `<tr><td style="padding: 8px 0; color: #8c7a63; vertical-align:top;">Detalii suplimentare</td><td style="padding: 8px 0;">${message}</td></tr>` : ''}
      </table>
      <div style="margin-top: 24px; padding: 14px 18px; background: #f7f2ea; border-left: 3px solid #6b3e1d; font-size: 13px; color: #4b3a2a;">
        Răspunde direct la acest email sau contactează clientul la <strong>${phone}</strong>.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"MyCabina" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // sends to yourself
      subject: `Rezervare nouă — ${name} — ${date}`,
      html: emailBody,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: err.message || 'Eroare la trimitere.' });
  }
});

// ── Fallback: serve index.html for any unknown route ────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MyCabina server running on port ${PORT}`);
});