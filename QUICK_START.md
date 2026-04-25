# 🚀 MyCabina Admin — Quick Start (5 minutes)

## What You Now Have:

✅ **Admin Page** — Manage events easily  
✅ **Guest Upload** — Guests upload from phones  
✅ **Auto-Upload** — Photos upload automatically from your laptop  

---

## ⚡ Quick Start

### 1. Start Your Server
```bash
node server.js
```
Your server runs on `http://localhost:3000`

### 2. Open Admin Dashboard
```
http://localhost:3000/admin
```

### 3. Create Your First Event
- Click **"Events"** tab
- Fill in event name (e.g., "My Wedding")
- Enter an upload password (e.g., "password123")
- Click **"✓ Create Event"**
- Done! ✅

### 4. Get Your Links

**For Guests to Upload Photos:**
1. Click **"📋 Copy Upload Link"**
2. Share with guests
3. Guests paste link + enter password

**Example:** `http://localhost:3000/my-wedding/upload`

**For Viewing Gallery:**
1. Click **"👁️ Copy Gallery Link"**
2. Share with guests (optional gallery password)

---

## 📤 Auto-Upload from Laptop

### Setup (1 minute):
1. Go to Admin → **"Auto-Upload"** tab
2. Select your event
3. Copy the command shown
4. Paste into Command Prompt/Terminal
5. Done! Photos auto-upload as you take them 🎉

Example command:
```bash
node photo-uploader.js "C:\Users\YOU\Pictures\MyEvent" my-wedding password123 http://localhost:3000
```

---

## 📱 For Guests

Guests get a simple upload page:
1. Open the link you shared
2. Tap camera icon or "Browse"
3. Select photos
4. Enter password
5. Tap "Upload"
6. Photos appear in gallery ✅

---

## 🎯 Typical Event Flow

**Before Event:**
- Create event in admin
- Get upload link from admin page
- Send to guests via WhatsApp/SMS

**During Event:**
- Start auto-upload script on your laptop
- Guests upload from phones to the event
- Your laptop uploads photos simultaneously

**After Event:**
- Stop upload script
- Share gallery link with guests
- Guests view all photos!

---

## 🔗 Important URLs

```
Admin Dashboard:    http://localhost:3000/admin
Guest Upload:       http://localhost:3000/{event-name}/upload
View Gallery:       http://localhost:3000/{event-name}
```

---

## 💡 Pro Tips

1. **Event Names:** Use simple names like `wedding-ana-ion`, `birthday-john`
2. **Passwords:** Keep them simple so guests remember them
3. **Keep Server On:** Don't close terminal during uploads
4. **Keep Laptop On:** Especially during auto-uploads
5. **Test First:** Test with one photo before the event

---

## ❓ Common Questions

**Q: Can multiple guests upload at the same time?**
A: Yes! Multiple guests can upload simultaneously.

**Q: Can I use auto-upload and guest uploads together?**
A: Yes! Both work at the same time.

**Q: What photo formats are supported?**
A: JPG, PNG, GIF, WebP, HEIC, AVIF (up to 50MB each)

**Q: Can guests view photos while uploading?**
A: Yes, if you set a gallery password and share the view link.

**Q: Where are photos stored?**
A: In `mycabina-gallery/events/{event-name}/` folder

---

## 📞 Need Help?

- Check **"Help"** tab in admin page
- Read `ADMIN_SETUP_GUIDE.md` for detailed guide
- All details are documented in the admin interface

---

## 🎊 You're Ready!

Your MyCabina admin system is ready to use. Create an event and start uploading!

**Happy event hosting! 📸**
