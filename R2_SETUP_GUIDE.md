# 🌐 Cloudflare R2 Setup Guide

Cloudflare R2 provides **unlimited storage** with **no egress fees** - perfect for your photo gallery!

## Why Cloudflare R2?

| Feature | R2 | AWS S3 | Google Cloud |
|---------|-----|--------|--------------|
| **Cost/GB** | $0.015 | $0.023 | $0.020 |
| **Egress** | ✅ FREE | ❌ $0.09/GB | $0.12/GB |
| **Bandwidth savings** | 70-80% | — | — |
| **Setup time** | 10 min | 30 min | 25 min |

**For a 1000 photo event (100GB):**
- R2: **$1.50** (storage only)
- S3: **$9.70** (storage + egress)
- Savings: **$8.20**

---

## Step 1: Create Cloudflare R2 Account

### 1.1 Create Cloudflare Account
1. Go to [cloudflare.com](https://www.cloudflare.com)
2. Click **"Sign up"** (or log in if you have account)
3. Use email and password

### 1.2 Upgrade to R2 (if needed)
1. Go to **R2** section in dashboard
2. Click **"Start free trial"** or **"Enable R2"**
3. No credit card needed for free tier

---

## Step 2: Create R2 Bucket

### 2.1 Create New Bucket
1. In Cloudflare dashboard → **R2**
2. Click **"Create bucket"**
3. **Bucket name**: `mycabina-photos` (or any name)
4. **Region**: `WNAM` (Western North America - default is fine)
5. **Object Lock**: Leave OFF
6. Click **"Create bucket"**

### 2.2 Get Bucket Details
Keep these values handy:
- **Bucket name**: `mycabina-photos` (or your chosen name)
- **Account ID**: You'll find this next

---

## Step 3: Create API Token

### 3.1 Get Your Account ID
1. In R2 dashboard, click **"Settings"** (bottom left)
2. Look for **"Account ID"** - copy it
   - Format: `1234567890abcdef1234567890abcdef`

### 3.2 Create Access Key
1. Click **"API Tokens"** in R2 Settings
2. Click **"Create API token"**
3. **Token name**: `mycabina`
4. **Permission**: Select **"Object Read & Write"**
5. **TTL**: Leave default or set to "Never"
6. Click **"Create API Token"**

### 3.3 Copy Your Credentials
You'll see:
- ✅ **Access Key ID** - Copy this
- ✅ **Secret Access Key** - Copy this (shown once only!)

**SAVE THESE SECURELY!** You won't see them again.

Example:
```
Access Key ID:     c1d2e3f4g5h6i7j8k9l0
Secret Access Key: z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4
```

---

## Step 4: Configure Environment Variables on Render

### 4.1 Add to Render Deployment

Go to your **Render dashboard** → Your MyCabina app → **Settings** → **Environment**

Add these variables:
```
R2_ACCOUNT_ID = 1234567890abcdef1234567890abcdef
R2_BUCKET_NAME = mycabina-photos
R2_ACCESS_KEY_ID = c1d2e3f4g5h6i7j8k9l0
R2_SECRET_ACCESS_KEY = z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4
```

**⚠️ IMPORTANT**: These are sensitive! Never commit them to git.

### 4.2 Deploy
After adding env vars, click **"Manual deploy"** or push to trigger auto-deploy.

Watch for this in logs:
```
✅ Cloudflare R2 connected
```

---

## Step 5: Test Upload

### 5.1 Via Admin Dashboard
1. Go to `https://yourapp.onrender.com/admin`
2. Create new event: **"Test Event"**
3. Upload a photo via upload.html

### 5.2 Via Photo Uploader
```bash
node photo-uploader.js ~/Pictures/test test-event password123 https://yourapp.onrender.com
```

### 5.3 Verify in R2
1. Cloudflare R2 dashboard
2. Click your bucket
3. Should see: `events/test-event/1234567890-5678.jpg`

✅ Photo is now stored in R2!

---

## Step 6: Migration (If You Have Existing Photos)

### 6.1 Photos on Render (Local Storage)

If you already uploaded photos locally on Render:

**Option A: Manual Upload (Recommended)**
1. Download existing photos from app
2. Use photo-uploader to re-upload

**Option B: Automated Migration**
Contact support if you need bulk migration help.

### 6.2 Keep Local Fallback
Your app is configured to:
- ✅ Upload NEW photos to R2
- ✅ Serve photos from R2 (if configured)
- ✅ Fall back to local disk if R2 not configured

---

## Step 7: Custom Domain (Optional)

### 7.1 Access Photos via Custom URL

Default R2 URL for a photo:
```
https://c1d2e3f4g5h6i7j8k9l0.r2.cloudflarestorage.com/events/wedding/photo.jpg
```

To use custom domain:
1. In R2 bucket **Settings** → **CORS**
2. Add your domain

---

## Troubleshooting

### Photos not uploading?
1. Check Render logs: `✅ Cloudflare R2 connected`
2. Verify env vars set correctly on Render
3. Check R2 bucket exists and is not locked

### Photos not showing?
1. Check R2 bucket has photos (R2 dashboard)
2. Verify they're in `events/{event-name}/` folder
3. Try refreshing browser cache

### Access denied error?
1. Verify **Access Key ID** is correct
2. Verify **Secret Access Key** matches
3. Check **API Token** has "Object Read & Write" permission

### Need to reset credentials?
1. Go to R2 → API Tokens
2. Delete old token
3. Create new token with fresh credentials
4. Update Render env vars

---

## Pricing & Free Tier

**Cloudflare R2 Pricing:**
- 💰 **Storage**: $0.015/GB/month
- 📤 **Upload (Class A)**: $4.50/million requests
- 📥 **Download (Class B)**: FREE! 🎉
- **Free tier**: $1/month credit

**Cost Example (1000 events × 100 photos = 100GB):**
- Monthly: 100GB × $0.015 = **$1.50**
- Bandwidth: **FREE** (no egress)
- Annual: **$18** (vs $116 on AWS S3!)

---

## What's Next?

✅ Photos stored persistently on R2
✅ No egress charges
✅ Unlimited bandwidth
✅ Disaster-proof backup

**Next features to add:**
- [ ] Automatic photo deletion after 30 days
- [ ] Photo compression/optimization
- [ ] CDN cache layer (Cloudflare Cache)
- [ ] Backup to second bucket

---

## Support

**R2 Issues?** → [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
**MyCabina Issues?** → Check [ADMIN_SETUP_GUIDE.md](./ADMIN_SETUP_GUIDE.md)

