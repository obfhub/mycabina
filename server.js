const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const { S3Client, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Cloudflare R2 Configuration ──────────────────────────────
const useR2 = process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY;

let s3Client = null;
if (useR2) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('✅ Cloudflare R2 connected');
} else {
  console.log('⚠️  R2 not configured - using local storage');
}

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

// Serve event images (from R2 or local disk)
app.get('/photos/:event/:filename', async (req, res) => {
  const { event, filename } = req.params;
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  
  // Security: validate filename
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).send('Invalid filename');
  }
  
  if (useR2 && s3Client) {
    // Serve from R2
    try {
      const key = `events/${safe}/${filename}`;
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      });
      
      const response = await s3Client.send(command);
      res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
      response.Body.pipe(res);
    } catch (err) {
      console.error('Error fetching from R2:', err);
      res.status(404).send('Photo not found');
    }
  } else {
    // Serve from local disk
    const filepath = path.join(__dirname, 'mycabina-gallery', 'events', safe, filename);
    
    // Security: ensure path is within events directory
    const resolvedPath = path.resolve(filepath);
    const allowedDir = path.resolve(path.join(__dirname, 'mycabina-gallery', 'events'));
    
    if (!resolvedPath.startsWith(allowedDir)) {
      return res.status(400).send('Invalid path');
    }
    
    res.sendFile(filepath, (err) => {
      if (err) {
        res.status(404).send('Photo not found');
      }
    });
  }
});

// Fallback for backwards compatibility: /photos/* (legacy static route)
app.use('/photos', express.static(path.join(__dirname, 'mycabina-gallery', 'events')));

// ── Custom S3 Storage Class for AWS SDK v3 ──────────────────
class S3Storage {
  constructor(options) {
    this.s3Client = options.s3Client;
    this.bucket = options.bucket;
    this.keyGenerator = options.key;
    this.metadataGenerator = options.metadata;
  }

  _handleFile(req, file, cb) {
    const self = this;
    
    const keyGenerator = (callback) => {
      if (typeof this.keyGenerator === 'function') {
        this.keyGenerator(req, file, callback);
      } else {
        callback(null, Date.now() + '-' + Math.random().toString(36).substring(7));
      }
    };

    keyGenerator((err, key) => {
      if (err) {
        console.error('[S3] Key generation error:', err);
        return cb(err);
      }

      const chunks = [];
      let uploadError = null;
      let streamEnded = false;

      file.stream.on('data', chunk => {
        chunks.push(chunk);
      });

      file.stream.on('error', (streamErr) => {
        console.error('[S3] Stream error:', streamErr);
        uploadError = streamErr;
        if (!streamEnded) {
          streamEnded = true;
          cb(streamErr);
        }
      });

      file.stream.on('end', async () => {
        if (streamEnded) return; // Already handled
        streamEnded = true;

        if (uploadError) {
          return cb(uploadError);
        }

        try {
          const buffer = Buffer.concat(chunks);
          
          console.log(`[S3] Preparing upload: bucket=${self.bucket}, key=${key}, size=${buffer.length}`);
          
          const params = {
            Bucket: self.bucket,
            Key: key,
            Body: buffer,
            ContentType: file.mimetype,
          };

          // Add metadata if provided
          if (typeof self.metadataGenerator === 'function') {
            self.metadataGenerator(req, file, (err, metadata) => {
              if (!err && metadata) {
                params.Metadata = metadata;
              }
            });
          }

          console.log('[S3] Sending PutObjectCommand...');
          
          const command = new PutObjectCommand(params);
          const result = await self.s3Client.send(command);

          console.log('[S3] Upload successful:', result.$metadata);

          cb(null, {
            fieldname: file.fieldname,
            originalname: file.originalname,
            encoding: file.encoding,
            mimetype: file.mimetype,
            size: buffer.length,
            bucket: self.bucket,
            key: key,
            location: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`,
          });
        } catch (uploadErr) {
          console.error('[S3] PutObjectCommand failed:', uploadErr.message, uploadErr.code);
          console.error('[S3] Full error:', uploadErr);
          cb(uploadErr);
        }
      });
    });
  }

  _removeFile(req, file, cb) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: file.key,
    });

    this.s3Client.send(command)
      .then(() => {
        console.log('[S3] File deleted:', file.key);
        cb();
      })
      .catch(err => {
        console.error('[S3] Delete failed:', err);
        cb(err);
      });
  }
}

// ── Multer Configuration ────────────────────────────────────
const uploadDir = path.join(__dirname, 'mycabina-gallery', 'events');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

let storage;
if (useR2 && s3Client) {
  // Use R2 storage with custom S3Storage class
  storage = new S3Storage({
    s3Client: s3Client,
    bucket: process.env.R2_BUCKET_NAME,
    metadata: (req, file, cb) => {
      const eventName = req.params.event || 'upload';
      cb(null, { fieldName: file.fieldname, event: eventName });
    },
    key: (req, file, cb) => {
      const eventName = req.params.event;
      const safe = eventName.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const ext = path.extname(file.originalname);
      const key = `events/${safe}/${timestamp}-${random}${ext}`;
      cb(null, key);
    },
  });
} else {
  // Use local disk storage
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const eventName = req.params.event;
      const safe = eventName.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
      const eventDir = path.join(uploadDir, safe);
      
      if (!fs.existsSync(eventDir)) {
        fs.mkdirSync(eventDir, { recursive: true });
      }
      
      cb(null, eventDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const ext = path.extname(file.originalname);
      cb(null, `${timestamp}-${random}${ext}`);
    }
  });
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: JPG, PNG, GIF, WebP, HEIC, AVIF'));
    }
  }
});

// Multer error handler middleware
function handleMulterError(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Upload error: ' + err.message });
  }
  next();
}

// ── Helpers ─────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const EVENT_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'];

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

// ─── ADMIN ROUTES ──────────────────────────────────────────────

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve upload page
app.get('/upload.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// Serve upload page for specific event
app.get('/:event/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// Get all events (API)
app.get('/api/admin/events', async (req, res) => {
  try {
    console.log('[DEBUG] /api/admin/events called, useR2:', !!useR2);
    
    if (useR2 && s3Client) {
      // List events from R2
      try {
        const command = new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME,
          Prefix: 'events/',
          Delimiter: '/',
        });
        
        const response = await s3Client.send(command);
        const events = [];
        
        if (response.CommonPrefixes) {
          for (const prefix of response.CommonPrefixes) {
            const folderPath = prefix.Prefix;
            const folder = folderPath.split('/')[1];
            
            // Get metadata from filesystem if available
            const eventDir = path.join(__dirname, 'mycabina-gallery', 'events', folder);
            let meta = {};
            let password = null;
            let galleryPassword = null;
            
            try {
              const metaFile = path.join(eventDir, 'meta.json');
              const passFile = path.join(eventDir, 'pass.json');
              if (fs.existsSync(metaFile)) {
                meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
              }
              if (fs.existsSync(passFile)) {
                const passData = JSON.parse(fs.readFileSync(passFile, 'utf8'));
                password = passData.password || null;
                galleryPassword = passData.galleryPassword || null;
              }
            } catch (e) {
              // Ignore errors reading metadata
            }
            
            // Count images in R2
            const imageListCmd = new ListObjectsV2Command({
              Bucket: process.env.R2_BUCKET_NAME,
              Prefix: folderPath,
            });
            const imageResponse = await s3Client.send(imageListCmd);
            const imageCount = imageResponse.Contents 
              ? imageResponse.Contents.filter(obj => EVENT_IMAGE_EXTS.includes(path.extname(obj.Key).toLowerCase())).length
              : 0;
            
            events.push({
              slug: folder,
              name: meta.name || folder.replace(/[-_]/g, ' '),
              date: meta.date || null,
              location: meta.location || null,
              uploadPassword: password ? '***' : null,
              galleryPassword: galleryPassword ? '***' : null,
              photoCount: imageCount,
            });
          }
        }
        
        console.log('[DEBUG] R2 events found:', events.length);
        
        // If no events in R2, also check local filesystem
        if (events.length === 0) {
          const eventsDir = path.join(__dirname, 'mycabina-gallery', 'events');
          if (fs.existsSync(eventsDir)) {
            const folders = fs.readdirSync(eventsDir).filter(f => {
              const fullPath = path.join(eventsDir, f);
              return fs.statSync(fullPath).isDirectory();
            });
            
            for (const folder of folders) {
              const eventDir = path.join(eventsDir, folder);
              const metaFile = path.join(eventDir, 'meta.json');
              const passFile = path.join(eventDir, 'pass.json');

              let meta = {};
              let password = null;
              let galleryPassword = null;

              try {
                if (fs.existsSync(metaFile)) {
                  meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
                }
                if (fs.existsSync(passFile)) {
                  const passData = JSON.parse(fs.readFileSync(passFile, 'utf8'));
                  password = passData.password || null;
                  galleryPassword = passData.galleryPassword || null;
                }
              } catch (e) {
                // Ignore errors
              }

              const images = fs.readdirSync(eventDir)
                .filter(f => EVENT_IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
                .length;

              events.push({
                slug: folder,
                name: meta.name || folder.replace(/[-_]/g, ' '),
                date: meta.date || null,
                location: meta.location || null,
                uploadPassword: password ? '***' : null,
                galleryPassword: galleryPassword ? '***' : null,
                photoCount: images,
              });
            }
          }
        }
        
        res.json(events);
      } catch (r2Err) {
        console.error('Error reading from R2:', r2Err);
        // Fallback to local filesystem if R2 fails
        const eventsDir = path.join(__dirname, 'mycabina-gallery', 'events');
        
        if (!fs.existsSync(eventsDir)) {
          return res.json([]);
        }

        const folders = fs.readdirSync(eventsDir).filter(f => {
          const fullPath = path.join(eventsDir, f);
          return fs.statSync(fullPath).isDirectory();
        });

        const events = folders.map(folder => {
          const eventDir = path.join(eventsDir, folder);
          const metaFile = path.join(eventDir, 'meta.json');
          const passFile = path.join(eventDir, 'pass.json');

          let meta = {};
          let password = null;
          let galleryPassword = null;

          try {
            if (fs.existsSync(metaFile)) {
              meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            }
            if (fs.existsSync(passFile)) {
              const passData = JSON.parse(fs.readFileSync(passFile, 'utf8'));
              password = passData.password || null;
              galleryPassword = passData.galleryPassword || null;
            }
          } catch (e) {
            console.log('[DEBUG] Error reading metadata for', folder, ':', e.message);
          }

          const images = fs.readdirSync(eventDir)
            .filter(f => EVENT_IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
            .length;

          return {
            slug: folder,
            name: meta.name || folder.replace(/[-_]/g, ' '),
            date: meta.date || null,
            location: meta.location || null,
            uploadPassword: password ? '***' : null,
            galleryPassword: galleryPassword ? '***' : null,
            photoCount: images,
          };
        });

        res.json(events);
      }
    } else {
      // List events from local filesystem
      const eventsDir = path.join(__dirname, 'mycabina-gallery', 'events');
      console.log('[DEBUG] Reading events from:', eventsDir);
      
      if (!fs.existsSync(eventsDir)) {
        console.log('[DEBUG] Events directory does not exist');
        return res.json([]);
      }

      const folders = fs.readdirSync(eventsDir).filter(f => {
        const fullPath = path.join(eventsDir, f);
        return fs.statSync(fullPath).isDirectory();
      });
      
      console.log('[DEBUG] Folders found:', folders);

      const events = folders.map(folder => {
        const eventDir = path.join(eventsDir, folder);
        const metaFile = path.join(eventDir, 'meta.json');
        const passFile = path.join(eventDir, 'pass.json');

        let meta = {};
        let password = null;
        let galleryPassword = null;

        try {
          if (fs.existsSync(metaFile)) {
            meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
          }
          if (fs.existsSync(passFile)) {
            const passData = JSON.parse(fs.readFileSync(passFile, 'utf8'));
            password = passData.password || null;
            galleryPassword = passData.galleryPassword || null;
          }
        } catch (e) {
          console.log('[DEBUG] Error reading metadata for', folder, ':', e.message);
        }

        const images = fs.readdirSync(eventDir)
          .filter(f => EVENT_IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
          .length;

        return {
          slug: folder,
          name: meta.name || folder.replace(/[-_]/g, ' '),
          date: meta.date || null,
          location: meta.location || null,
          uploadPassword: password ? '***' : null,
          galleryPassword: galleryPassword ? '***' : null,
          photoCount: images,
        };
      });

      console.log('[DEBUG] Total events to return:', events.length);
      res.json(events);
    }
  } catch (err) {
    console.error('Error reading events:', err);
    res.status(500).json({ error: 'Failed to read events: ' + err.message });
  }
});

// Create new event (API)
app.post('/api/admin/create-event', (req, res) => {
  const { name, uploadPassword, galleryPassword, date, location } = req.body;

  if (!name || !uploadPassword) {
    return res.status(400).json({ error: 'Event name and upload password are required' });
  }

  // Sanitize event name for folder
  const slug = name.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');

  if (!slug) {
    return res.status(400).json({ error: 'Invalid event name' });
  }

  const eventsDir = path.join(__dirname, 'mycabina-gallery', 'events');
  const eventDir = path.join(eventsDir, slug);

  // Create events directory if it doesn't exist
  if (!fs.existsSync(eventsDir)) {
    fs.mkdirSync(eventsDir, { recursive: true });
  }

  // Check if event already exists
  if (fs.existsSync(eventDir)) {
    return res.status(400).json({ error: 'Event already exists' });
  }

  try {
    // Create event directory
    fs.mkdirSync(eventDir, { recursive: true });

    // Save metadata
    const meta = {
      name,
      date: date || null,
      location: location || null,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(eventDir, 'meta.json'), JSON.stringify(meta, null, 2));

    // Save passwords
    const passData = {
      password: uploadPassword,
      galleryPassword: galleryPassword || null,
    };
    fs.writeFileSync(path.join(eventDir, 'pass.json'), JSON.stringify(passData, null, 2));

    res.json({
      success: true,
      slug,
      name,
      message: `Event "${name}" created successfully`,
    });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Delete event (API)
app.post('/api/admin/delete-event', (req, res) => {
  const { slug } = req.body;

  if (!slug) {
    return res.status(400).json({ error: 'Event slug is required' });
  }

  // Security: validate slug format
  if (!/^[a-zA-Z0-9\-_]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid event slug' });
  }

  const eventsDir = path.join(__dirname, 'mycabina-gallery', 'events');
  const eventDir = path.join(eventsDir, slug);

  // Security: ensure we're not deleting outside the events directory
  if (!eventDir.startsWith(eventsDir)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  if (!fs.existsSync(eventDir)) {
    return res.status(404).json({ error: 'Event not found' });
  }

  try {
    fs.rmSync(eventDir, { recursive: true, force: true });
    res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ─── EVENT GALLERY ROUTES ────────────────────────────────────

const EVENTS_DIR = path.join(__dirname, 'mycabina-gallery', 'events');

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

// List images from R2 bucket
async function getEventImagesFromR2(eventName) {
  if (!useR2 || !s3Client) return [];
  
  try {
    const safe = eventName.replace(/[^a-zA-Z0-9\-_]/g, '');
    const prefix = `events/${safe}/`;
    
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: prefix,
    });
    
    const response = await s3Client.send(command);
    if (!response.Contents) return [];
    
    return response.Contents
      .map(obj => {
        const key = obj.Key;
        const filename = key.split('/').pop();
        return filename;
      })
      .filter(f => EVENT_IMAGE_EXTS.includes(path.extname(f).toLowerCase()) && !f.startsWith('.'))
      .sort();
  } catch (err) {
    console.error('Error listing R2 objects:', err);
    return [];
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
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');

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

// Upload endpoint
app.post('/:event/upload', (req, res, next) => {
  upload.array('photos', 50)(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'Upload error: ' + err.message });
    }
    
    const { event } = req.params;
    const { password } = req.body;
    const eventDir = getEventDir(event);

    try {
      if (!fs.existsSync(eventDir)) {
        // Clean up uploaded files if event doesn't exist
        if (req.files && req.files.length > 0) {
          if (!useR2 && req.files[0].path) {
            // Only delete local files
            req.files.forEach(f => {
              try { fs.unlinkSync(f.path); } catch(e) {}
            });
          }
        }
        return res.status(404).json({ error: 'Event not found' });
      }

      const correctPassword = getEventPassword(eventDir);
      if (!correctPassword || password !== correctPassword) {
        // Clean up uploaded files if password is wrong
        if (req.files && req.files.length > 0) {
          if (!useR2 && req.files[0].path) {
            // Only delete local files
            req.files.forEach(f => {
              try { fs.unlinkSync(f.path); } catch(e) {}
            });
          }
        }
        return res.status(401).json({ error: 'Invalid password' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Format response based on storage type
      const uploadedFiles = req.files.map(f => {
        if (useR2 && s3Client) {
          // Custom S3Storage structure
          return {
            filename: f.key ? f.key.split('/').pop() : f.originalname,
            originalname: f.originalname,
            size: f.size,
            location: f.location || null,
          };
        } else {
          // Local disk structure
          return {
            filename: f.filename,
            originalname: f.originalname,
            size: f.size,
          };
        }
      });

      res.json({
        success: true,
        message: `${uploadedFiles.length} photo(s) uploaded successfully`,
        files: uploadedFiles,
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
  });
});

// Main event gallery route (but NOT for special routes like /api, /galerie, etc)
app.get('/:event', (req, res, next) => {
  // Skip if it matches known routes
  if (['api', 'galerie', 'galerii', 'photos', 'health', 'index', 'rezervare', 'guestbook', 'admin', 'upload.html'].includes(req.params.event)) {
    return next();
  }
  
  const event = req.params.event;
  const eventDir = getEventDir(event);
  const safe = event.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');

  if (!fs.existsSync(eventDir)) {
    return next(); // Pass to 404 handler
  }

  const sessionKey = `auth_${safe}`;
  const isAuthenticated = req.session[sessionKey] === true;
  const hasError = req.query.error === '1';

  if (!isAuthenticated) {
    return res.send(renderLoginPage(safe, hasError));
  }

  // Load images from R2 if available, otherwise from disk
  (async () => {
    try {
      let images;
      if (useR2) {
        const filenames = await getEventImagesFromR2(safe);
        images = filenames.map(f => `/photos/${safe}/${f}`);
      } else {
        images = getEventImages(eventDir, safe);
      }
      return res.send(renderGalleryPage(safe, images));
    } catch (err) {
      console.error('Error loading gallery:', err);
      return res.send(renderGalleryPage(safe, []));
    }
  })();
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
      display: inline-block;
    }
    .login-logo img {
      height: 56px;
      width: auto;
      display: block;
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
      <a href="https://mycabina.com"><img src="/MyCabina.svg" alt="MyCabina"/></a>
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
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .header-logo img {
      height: 36px;
      width: auto;
      display: block;
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
  <a href="https://mycabina.com" class="header-logo"><img src="/MyCabina.svg" alt="MyCabina"/></a>
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