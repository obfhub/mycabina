#!/usr/bin/env node

/**
 * MyCabina Photo Uploader
 * 
 * Usage:
 *   node photo-uploader.js /path/to/photos eventName password serverUrl
 * 
 * Example:
 *   node photo-uploader.js ~/Pictures/Event demo-event nunta2026 https://mycabina.onrender.com
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error(`
Usage: node photo-uploader.js <folder> <event-name> <password> <server-url>

Example:
  node photo-uploader.js ~/Pictures/Wedding demo-event nunta2026 https://mycabina.onrender.com
  `);
  process.exit(1);
}

const [folderPath, eventName, password, serverUrl] = args;

// Expand home directory
const fullPath = folderPath.startsWith('~') 
  ? path.join(process.env.HOME || process.env.USERPROFILE, folderPath.slice(1))
  : path.resolve(folderPath);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ Folder not found: ${fullPath}`);
  process.exit(1);
}

console.log(`
📷 MyCabina Photo Uploader
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Folder: ${fullPath}
🎉 Event: ${eventName}
🔒 Password: ${password.replace(/./g, '*')}
🌐 Server: ${serverUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Watching for new photos... (Ctrl+C to stop)
`);

const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'];
const uploadedFiles = new Set();

async function uploadFiles(filePaths) {
  if (filePaths.length === 0) return;

  console.log(`\n⏳ Uploading ${filePaths.length} photo(s)...`);

  const formData = new FormData();
  let addedCount = 0;

  for (const filePath of filePaths) {
    try {
      const stream = fs.createReadStream(filePath);
      formData.append('photos', stream, path.basename(filePath));
      addedCount++;
    } catch (err) {
      console.error(`❌ Error reading ${path.basename(filePath)}: ${err.message}`);
    }
  }

  formData.append('password', password);
  formData.append('event', eventName);

  try {
    const res = await fetch(`${serverUrl}/${eventName}/upload`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const data = await res.json();

    if (res.ok) {
      console.log(`✅ Success! Uploaded ${data.files.length} photo(s)`);
    } else {
      console.error(`❌ Upload failed: ${data.error}`);
      filePaths.forEach(f => uploadedFiles.delete(f)); // Remove from tracking if upload fails
    }
  } catch (err) {
    console.error(`❌ Network error: ${err.message}`);
  }
}

function getImageFiles() {
  try {
    return fs.readdirSync(fullPath)
      .filter(f => imageExts.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(fullPath, f))
      .filter(f => {
        try {
          return fs.statSync(f).isFile();
        } catch {
          return false;
        }
      });
  } catch (err) {
    console.error(`Error reading folder: ${err.message}`);
    return [];
  }
}

// Watch folder
const watcher = fs.watch(fullPath, async (eventType, filename) => {
  if (!filename) return;

  const filePath = path.join(fullPath, filename);
  const ext = path.extname(filename).toLowerCase();

  // Only process image files
  if (!imageExts.includes(ext)) return;

  // Wait for file to finish writing (check size stability)
  let lastSize = 0;
  let stable = false;
  let checks = 0;

  const checkStable = setInterval(() => {
    checks++;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === lastSize && stat.size > 0) {
        stable = true;
        clearInterval(checkStable);
        if (!uploadedFiles.has(filePath)) {
          uploadedFiles.add(filePath); // Mark as uploaded BEFORE uploading
          uploadFiles([filePath]);
        }
      }
      lastSize = stat.size;
    } catch {
      // File might be deleted or locked
    }

    if (checks > 30) {
      clearInterval(checkStable);
    }
  }, 200);
});

watcher.on('error', (err) => {
  console.error(`Watcher error: ${err.message}`);
});

// Initial scan
console.log('Initial scan...');
const existingFiles = getImageFiles();
if (existingFiles.length > 0) {
  console.log(`Found ${existingFiles.length} existing photo(s). Use --upload flag to upload them.`);
  if (process.argv.includes('--upload')) {
    uploadFiles(existingFiles);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  watcher.close();
  process.exit(0);
});
