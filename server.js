const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Resend helper (HTTPS, no SMTP — works on Railway) ───────
// Railway Variables needed:
//   RESEND_API_KEY  →  re_xxxxxxxxxxxx   (from resend.com)
//   EMAIL_TO        →  the email where you want to receive bookings
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

// ── Rezervare endpoint ──────────────────────────────────────
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`MyCabina running on port ${PORT}`));