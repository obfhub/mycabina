# MyCabina Admin System — Complete Setup Guide

Welcome! You now have a complete admin system to manage events and configure auto-uploads from your laptop. Here's everything you need to know.

## 📋 Quick Overview

Your new MyCabina setup consists of three main components:

1. **Admin Page** (`http://localhost:3000/admin`)
   - Create and manage events
   - Generate passwords for guests
   - Configure upload settings

2. **Guest Upload Page** (`http://localhost:3000/{event-name}/upload`)
   - Guests can upload photos from their phones
   - Simple, intuitive interface
   - Works on mobile and desktop

3. **Auto-Upload Script** (`photo-uploader.js`)
   - Upload photos automatically from your laptop
   - Watch folder for new images
   - Works from Command Prompt or Terminal

---

## 🚀 Getting Started

### Step 1: Start the Server

```bash
node server.js
```

Your server will start on `http://localhost:3000`

### Step 2: Open the Admin Page

Open your browser and go to:
```
http://localhost:3000/admin
```

You should see the MyCabina Admin dashboard.

---

## 📅 Creating Your First Event

1. Go to the **Admin Page**
2. Click on the **"Events"** tab (if not already selected)
3. Fill in the event details:
   - **Event Name**: e.g., "Wedding Ana & Ion" or "Birthday Party"
   - **Upload Password**: A password for guests uploading photos
   - **Gallery Password** (optional): A password for viewing the gallery
   - **Event Date** (optional): The date of your event
   - **Location** (optional): Where the event takes place

4. Click **"✓ Create Event"**
5. Your event will appear in the "Your Events" section

### Example Event Names (Will create URLs):
- "Wedding Ana & Ion" → `localhost:3000/wedding-ana-ion`
- "Birthday Party" → `localhost:3000/birthday-party`
- "Corporate Event 2026" → `localhost:3000/corporate-event-2026`

---

## 🎁 Sharing with Guests

### For Photo Upload (Guests from their phones):

1. Go to Admin → Events
2. Click **"📋 Copy Upload Link"** for your event
3. Share the link with guests
4. They can paste it in their browser and upload photos

Example link structure:
```
http://localhost:3000/{event-name}/upload
```

Guests need the upload password you created.

### For Viewing Gallery:

1. Click **"👁️ Copy Gallery Link"** in Admin
2. Share this link with guests who want to view photos
3. If you set a gallery password, they'll need to enter it

---

## 📤 Auto-Upload from Your Laptop

This is the easiest way to upload photos from your camera/laptop automatically.

### Prerequisites:
- Node.js installed ([download here](https://nodejs.org))
- A folder with your photos on your laptop

### How It Works:

1. Go to Admin → **"Auto-Upload"** tab
2. Select your event from the dropdown
3. Copy the command shown (it's already formatted for your event!)
4. Paste it into Command Prompt (Windows) or Terminal (Mac/Linux)
5. The script will watch your folder and automatically upload new photos!

### Step-by-Step Example:

**Windows Command Prompt:**
```bash
# Navigate to your photos folder
cd C:\Users\YourName\Pictures\MyEvent

# Paste the command from admin page (will look like this):
node photo-uploader.js "C:\Users\YourName\Pictures\MyEvent" event-name password123 http://localhost:3000

# Result: Script watches the folder and uploads new photos automatically!
```

**Mac/Linux Terminal:**
```bash
# Navigate to your photos folder
cd ~/Pictures/MyEvent

# Paste the command:
node photo-uploader.js ~/Pictures/MyEvent event-name password123 http://localhost:3000

# The script will watch and auto-upload!
```

### Supported Photo Formats:
- JPG / JPEG
- PNG
- GIF
- WebP
- HEIC
- AVIF

---

## 🗂️ File Structure

Your events are stored in:
```
mycabina-gallery/
└── events/
    ├── wedding-ana-ion/
    │   ├── meta.json (event info)
    │   ├── pass.json (passwords)
    │   ├── photo1.jpg
    │   ├── photo2.jpg
    │   └── ...
    ├── birthday-party/
    │   └── ...
    └── ...
```

- **meta.json**: Contains event name, date, location
- **pass.json**: Contains upload and gallery passwords
- **Photos**: All uploaded photos stored in the event folder

---

## 🔐 Password Management

### Upload Password
- Used by guests uploading photos
- They enter this when accessing `/upload` page
- Share this password with guests who want to contribute photos

### Gallery Password
- Used by guests viewing the photo gallery
- Optional (leave empty to allow public viewing)
- Share this password with guests who want to see the photos

### Example:
```
Event: Wedding Ana & Ion
Upload Password: "nunta2026" (for uploading)
Gallery Password: "ana-ion-24" (for viewing)

Guest URL for uploading:
http://localhost:3000/wedding-ana-ion/upload
(Enter password: nunta2026)

Guest URL for viewing:
http://localhost:3000/wedding-ana-ion
(Enter password: ana-ion-24)
```

---

## 📱 Mobile Considerations

### Guest Upload from Phone:
1. Guest opens upload link in phone browser
2. Taps camera icon or browse button
3. Selects photos from phone gallery
4. Taps "Upload" button
5. Photos appear in the gallery

### Best Practices:
- Keep upload password simple (easy to remember)
- Use short event names (easier to share as URLs)
- Test with a friend first before the event
- Make sure your laptop stays on during auto-uploads

---

## ⚙️ Advanced Usage

### Command Line Upload Script:

The `photo-uploader.js` script is standalone and can be used separately:

```bash
# Basic usage:
node photo-uploader.js <folder> <event-name> <password> <server-url>

# Full example:
node photo-uploader.js ~/Pictures/Wedding my-event nunta2026 http://localhost:3000

# Windows with spaces in path:
node photo-uploader.js "C:\Users\User\Pictures\My Event Folder" my-event password http://localhost:3000
```

Features:
- Watches folder for new images
- Automatically uploads as they arrive
- Shows upload progress and status
- Retries on failure
- Supports batch uploads

---

## 🛠️ Troubleshooting

### "Event not found" error
- Make sure the event exists in Admin panel
- Check that the event name matches exactly
- Event names are case-sensitive

### Upload fails with "Invalid password"
- Double-check the upload password
- Passwords are case-sensitive
- Regenerate the event if needed

### Script says "No photos found"
- Make sure photos are in the correct folder
- Supported formats: JPG, PNG, GIF, WebP, HEIC, AVIF
- Some formats may not be recognized (try converting to JPG)

### Server won't start
- Make sure port 3000 is not in use
- Try: `node server.js` (if that fails, try `npx node server.js`)
- Check that all dependencies are installed: `npm install`

### "Node not found" on Mac/Linux
- Install Node.js from nodejs.org
- Or use: `brew install node` (if you have Homebrew)

---

## 📋 API Endpoints Reference

For developers or advanced users:

### Admin Endpoints:
- `GET /admin` - Admin dashboard
- `GET /api/admin/events` - List all events
- `POST /api/admin/create-event` - Create new event
- `POST /api/admin/delete-event` - Delete event

### Event Endpoints:
- `GET /:event` - View event gallery (if authenticated)
- `GET /:event/upload` - Upload page
- `POST /:event/upload` - Upload photos endpoint
- `POST /:event/login` - Authenticate to gallery

### Example Request:
```javascript
// Create event via API
fetch('http://localhost:3000/api/admin/create-event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Event',
    uploadPassword: 'mypassword123',
    galleryPassword: 'viewing123',
    date: '2026-06-14',
    location: 'Bucharest, Romania'
  })
})
```

---

## 🎯 Typical Workflow

### Day Before Event:
1. Create event in Admin panel
2. Get the upload password
3. Share upload link with guests (SMS/WhatsApp)
4. Test upload with a test photo

### Day of Event:
1. On your laptop, open Terminal/Command Prompt
2. Run the auto-upload command from Admin panel
3. Keep laptop running throughout event
4. New photos automatically upload as you take them

### After Event:
1. Stop the upload script (Ctrl+C)
2. Share gallery link with guests (if using gallery password, share that too)
3. Guests can view all uploaded photos
4. Download all photos as ZIP from gallery

---

## 💡 Pro Tips

1. **Organize Photos**: Name your event folder by date (e.g., `2026-06-14 Wedding`)
2. **Regular Backups**: Backup the `mycabina-gallery` folder regularly
3. **Multiple Laptops**: You can run auto-upload from multiple devices simultaneously
4. **Test First**: Always test the system with a small event first
5. **Keep Server Running**: Don't close the terminal/command prompt while uploading
6. **Network**: Make sure your laptop has stable internet connection
7. **Battery**: Keep your laptop plugged in during long events

---

## 📞 Support

If you need help:
- Check the Help tab in Admin panel
- Review this guide again
- Message on WhatsApp: +373 60 996 464

---

## 🎉 You're All Set!

Your MyCabina Admin system is ready to use. Start by creating your first event and sharing it with guests. Enjoy your special event!

**Happy event hosting! 📸🎊**
