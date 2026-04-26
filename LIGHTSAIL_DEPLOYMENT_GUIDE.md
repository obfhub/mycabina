# 🚀 AWS Lightsail Deployment Guide - MyCabina

This guide will help you deploy your MyCabina app on AWS Lightsail for **$5-10/month**.

---

## 📋 Prerequisites

You need:
1. **AWS Account** (create at [aws.amazon.com](https://aws.amazon.com))
2. **GitHub account** with your project pushed
3. **Cloudflare R2 credentials** (already set up?)

---

## Step 1: Create Lightsail Instance

### 1.1 Go to AWS Lightsail
1. Log in to [AWS Console](https://console.aws.amazon.com)
2. Search for **"Lightsail"** in the search bar
3. Click **Lightsail**

### 1.2 Create a New Instance
1. Click **"Create instance"**
2. **Location**: Choose closest region to you (e.g., `us-east-1`)
3. **Platform**: Select **Linux**
4. **Blueprint**: Select **Node.js**
5. **Instance plan**: Choose **$5/month** (512MB RAM, 1 core, 20GB SSD)
   - This is plenty for your app
6. **Instance name**: `mycabina-server`
7. Click **"Create instance"**

⏳ **Wait 2-3 minutes** for the instance to start.

---

## Step 2: Connect to Your Instance

### 2.1 Open Terminal
Once instance is running:
1. In Lightsail dashboard, click your instance
2. Click **"Connect using SSH"** button (orange terminal icon)
3. A terminal window opens in your browser

### 2.2 Update System
```bash
sudo apt update
sudo apt upgrade -y
```

---

## Step 3: Install Your App

### 3.1 Clone Your GitHub Repository
```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/mycabina.git
cd mycabina
```

**Replace** `YOUR_USERNAME` with your GitHub username.

### 3.2 Install Node Dependencies
```bash
npm install
```

### 3.3 Set Up Environment Variables

Create a `.env` file with your Cloudflare R2 credentials:

```bash
sudo nano .env
```

Paste this (replace with YOUR values):
```
PORT=3000
R2_ACCOUNT_ID=your_account_id
R2_BUCKET_NAME=mycabina-photos
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

**Get these values from Cloudflare R2 setup** (see R2_SETUP_GUIDE.md)

---

## Step 4: Set Up PM2 (Keep App Running)

PM2 ensures your app restarts automatically if it crashes.

### 4.1 Install PM2
```bash
sudo npm install -g pm2
```

### 4.2 Start Your App with PM2
```bash
pm2 start server.js --name "mycabina"
```

### 4.3 Set PM2 to Auto-Start on Reboot
```bash
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

### 4.4 Check if App is Running
```bash
pm2 status
```

You should see:
```
┌─────────────────┬─────────────────────────────────┐
│ name            │ status                          │
├─────────────────┼─────────────────────────────────┤
│ mycabina        │ online                          │
└─────────────────┴─────────────────────────────────┘
```

---

## Step 5: Set Up Firewall

### 5.1 Allow Port 3000
1. In Lightsail dashboard, click your instance
2. Scroll down to **"Networking"**
3. Under **"Firewall"**, click **"Add rule"**
4. **Protocol**: HTTP
5. **Port**: 3000
6. Click **"Create"**

---

## Step 6: Get Your Public IP

1. In Lightsail dashboard, click your instance
2. Look for **"Public IP"** (e.g., `54.123.456.789`)
3. Test your app: Visit `http://54.123.456.789:3000` in browser

✅ **Your app should be live!**

---

## Step 7: Connect Custom Domain (Optional)

### 7.1 Point Domain to Lightsail IP

If you have a domain (e.g., `mycabina.ro`):

**Option A: Using Cloudflare DNS** (Recommended)
1. Go to Cloudflare dashboard
2. Add DNS record:
   - **Type**: A
   - **Name**: @ (for example.com) or www
   - **Content**: Your Lightsail public IP
   - **TTL**: Auto
3. Click **"Save"**
4. Wait 5-10 minutes for DNS to propagate
5. Visit `http://mycabina.ro` (may need to wait)

**Option B: Using AWS Route 53**
1. In AWS console, go to **Route 53**
2. Create hosted zone for your domain
3. Add A record pointing to Lightsail IP
4. Update your domain registrar nameservers

---

## Step 8: Add SSL Certificate (HTTPS)

### 8.1 Using Certbot (Free SSL)
```bash
sudo apt install certbot python3-certbot-nginx -y
```

Wait, we're using Express, not Nginx. Let's use a simpler approach:

### 8.2 Update Your server.js for HTTPS

Edit your `server.js` to support HTTPS with Let's Encrypt. Or use **Cloudflare Proxy**:

1. In Cloudflare dashboard → Your domain
2. Under **SSL/TLS**, set to **"Flexible"** or **"Full"**
3. Cloudflare will provide HTTPS automatically

---

## Step 9: Monitor Your App

### 9.1 View Logs
```bash
pm2 logs mycabina
```

### 9.2 Restart App
```bash
pm2 restart mycabina
```

### 9.3 Stop App
```bash
pm2 stop mycabina
```

---

## Step 10: Update Your App (Future Deployments)

When you make changes to your code:

```bash
cd /home/ubuntu/mycabina
git pull
npm install
pm2 restart mycabina
```

---

## 💰 Cost Breakdown

| Service | Cost |
|---------|------|
| **Lightsail ($5/month plan)** | $5/month |
| **R2 Storage** | ~$0.02-0.50/month |
| **Data Transfer** | Free (100GB included) |
| **Domain** | ~$10-15/year |
| **Total** | **~$5-10/month** ✅ |

---

## 🆘 Troubleshooting

### App not running?
```bash
pm2 status
pm2 logs mycabina
```

### Can't connect to IP?
- Check Lightsail firewall allows port 3000
- Check Lightsail instance is **running** (green dot)
- Wait 30 seconds and try again

### App crashes?
- Check `.env` file for R2 credentials
- Check logs: `pm2 logs mycabina`
- Restart: `pm2 restart mycabina`

### Domain not working?
- Wait 5-10 minutes for DNS propagation
- Check DNS record points to correct IP
- Verify Lightsail security group allows traffic

---

## 📞 Need Help?

- **AWS Lightsail Docs**: https://lightsail.aws.amazon.com/ls/docs/
- **PM2 Docs**: https://pm2.keymetrics.io/
- **Node.js on AWS**: https://docs.aws.amazon.com/nodejs/

---

**You're done! Your MyCabina app is now live on AWS Lightsail! 🎉**
