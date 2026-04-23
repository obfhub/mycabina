# MyCabina Gallery - Photo Upload System

You now have **two ways** to upload photos to your event gallery without git push:

## Option 1: Web Upload Interface (Easiest)

Access the upload page directly in your browser:

```
https://mycabina.onrender.com/{event-name}/upload
```

Example: `https://mycabina.onrender.com/demo-event/upload`

### Steps:
1. Open the upload page
2. Drag & drop photos or click to select them
3. Enter your event password
4. Click "Încarcă fotografiile"
5. Done! Photos appear instantly in the gallery

---

## Option 2: Automatic File Watcher (For Batch Uploads)

Use the `photo-uploader.js` script to watch a folder and auto-upload new photos as you transfer them from your camera.

### Setup:

1. **Install dependencies** (first time only):
```bash
npm install
```

2. **Start the watcher**:
```bash
node photo-uploader.js ~/Pictures/Event demo-event nunta2026 https://mycabina.onrender.com
```

Replace:
- `~/Pictures/Event` → Your folder with photos (on your laptop)
- `demo-event` → Your event name
- `nunta2026` → Your event password
- `https://mycabina.onrender.com` → Your server URL

### Usage:

```bash
# Watch a folder and auto-upload new photos
node photo-uploader.js /path/to/photos event-name password https://server-url

# Upload existing photos in the folder
node photo-uploader.js /path/to/photos event-name password https://server-url --upload

# Windows example
node photo-uploader.js "C:\Users\YourName\Pictures\Wedding" nunta2026 mypassword https://mycabina.onrender.com
```

### How it works:
1. Script watches your folder continuously
2. When new photo appears, it automatically uploads it
3. Shows upload status in terminal
4. Photos appear instantly in the gallery (refresh to see)
5. Press `Ctrl+C` to stop watching

---

## Quick Event Setup

Create a new event with these steps:

### 1. Create folder structure:
```
mycabina-gallery/events/your-event/
├── pass.json
└── (photos will go here)
```

### 2. Create `pass.json` with password:
```json
{
  "password": "your-secret-password"
}
```

### 3. Push to git:
```bash
git add mycabina-gallery/events/your-event/pass.json
git commit -m "Add new event"
git push
```

### 4. Access gallery:
- View: `https://mycabina.onrender.com/your-event` (enter password)
- Upload: `https://mycabina.onrender.com/your-event/upload` (enter password)

---

## File Size Limits
- Max per file: 50MB
- Supported formats: JPG, PNG, GIF, WebP, HEIC, AVIF
- Max photos per upload: 50

## Troubleshooting

### Upload page not loading?
- Make sure event folder exists with `pass.json`
- Make sure you've pushed latest changes to Render

### Photos not appearing?
- Refresh browser after upload
- Check password is correct
- Wait a few seconds for processing

### File watcher not uploading?
- Check folder path is correct
- Verify password and event name
- Check server URL is accessible
- Look for error messages in terminal

---

## At the Event

**Recommended workflow:**

1. Set up a laptop with the file watcher script running
2. Transfer photos from camera to watched folder (via card reader or AirDrop)
3. Photos auto-upload and appear in gallery instantly
4. Guests can view on phone: `mycabina.onrender.com/your-event`
5. After event, photos are safely in Render + git repo

---

**Questions?** Check the gallery at `https://mycabina.onrender.com/your-event`
