# Step-by-step: Deploy from zero (first time)

Do these in order. Replace `YOUR_DOMAIN.com` and `YOUR_VPS_IP` with your real domain and VPS IP.

---

# PART 1: Put your code on GitHub

## Step 1: Create a GitHub account (if you don’t have one)

1. Go to **https://github.com**
2. Click **Sign up**
3. Enter email, password, username (e.g. `prescoatsales1134-arch`)
4. Verify your email if asked

---

## Step 2: Create a new repository on GitHub

1. Log in to GitHub
2. Click the **+** (top right) → **New repository**
3. **Repository name:** `leads`
4. Leave **Public** selected
5. **Do not** check “Add a README” (you already have one)
6. Click **Create repository**
7. Leave the page open; you’ll see a URL like `https://github.com/prescoatsales1134-arch/leads.git`

---

## Step 3: Create a Personal Access Token (so Git can “log in”)

1. On GitHub, click your **profile picture** (top right) → **Settings**
2. Left sidebar, bottom: **Developer settings**
3. Click **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. **Note:** type `leads-deploy`
6. **Expiration:** choose 90 days or No expiration
7. Under **Scopes**, check **repo** (all sub-items get checked)
8. Scroll down, click **Generate token**
9. **Copy the token** (starts with `ghp_...`) and paste it into a temporary Note or TextEdit — you won’t see it again. You’ll use it as the “password” when pushing.

---

## Step 4: Push your project from your Mac

1. Open **Terminal** (Spotlight: type `Terminal`, press Enter)
2. Go to your project folder:
   ```bash
   cd /Users/unjilaarif/Documents/leads_linked
   ```
3. Check the remote (should point to your repo):
   ```bash
   git remote -v
   ```
   You should see `origin` → `https://github.com/prescoatsales1134-arch/leads.git` (or your repo URL). If not:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/leads.git
   ```
   Replace `YOUR_USERNAME` with your GitHub username.

4. Push to GitHub:
   ```bash
   git push -u origin main
   ```
5. When it asks:
   - **Username:** your GitHub username (e.g. `prescoatsales1134-arch`)
   - **Password:** **paste the token** (the `ghp_...` one), not your GitHub password
6. If it succeeds, refresh your repo page on GitHub — you should see all your files.

**Part 1 done.** Your code is now on GitHub.

---

# PART 2: Deploy on your Hostinger VPS

## Step 5: Point your domain to the VPS

1. Log in to **Hostinger** (hPanel)
2. Open **VPS** and copy your server **IP address** (e.g. `123.45.67.89`)
3. Go to **Domains** (or where your domain DNS is managed)
4. Open **DNS / DNS Zone** for your domain
5. Add an **A record**:
   - **Name:** `@` (for `yourdomain.com`) or `leads` (for `leads.yourdomain.com`)
   - **Value / Points to:** your VPS IP
   - **TTL:** 300 or default
6. Save. Wait 10–30 minutes. You’ll use this domain later (e.g. `https://leads.yourdomain.com`).

---

## Step 6: Connect to the VPS (SSH)

1. Open **Terminal** on your Mac
2. Connect (use your real IP and user; often `root`):
   ```bash
   ssh root@YOUR_VPS_IP
   ```
   Example: `ssh root@123.45.67.89`
3. Type `yes` if it asks about fingerprint
4. Enter the VPS password (Hostinger sent it when you created the VPS)
5. When you see a prompt like `root@vps:~#`, you’re inside the server.

---

## Step 7: Install Node.js on the VPS

Copy and paste these one at a time (press Enter after each):

```bash
apt update && apt upgrade -y
```

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
```

```bash
apt install -y nodejs
```

```bash
node -v
```

You should see something like `v20.x.x`. Then:

```bash
apt install -y nginx
```

```bash
npm install -g pm2
```

---

## Step 8: Clone your project and install dependencies

1. Create folder and go into it:
   ```bash
   mkdir -p /var/www/leads-linked
   cd /var/www/leads-linked
   ```

2. Clone from GitHub (use your repo URL; for public repo no token needed):
   ```bash
   git clone https://github.com/prescoatsales1134-arch/leads.git .
   ```
   (The `.` at the end means “clone into current folder”. Replace with your username if different.)

3. Install Node packages:
   ```bash
   npm install --omit=dev
   ```

---

## Step 9: Create the `.env` file on the server

1. Create the file:
   ```bash
   nano .env
   ```

2. Paste this (then **replace** the placeholders with your real values from your Mac’s `.env`):
   ```env
   PORT=3000
   NODE_ENV=production
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   N8N_GENERATE_LEADS_WEBHOOK=
   N8N_CHATBOT_WEBHOOK=
   N8N_SYNC_HUBSPOT_WEBHOOK=
   N8N_MESSAGE_ASSISTANT_WEBHOOK=
   ```

3. Save and exit: press **Ctrl+O**, Enter, then **Ctrl+X**.

---

## Step 10: Add your site URL in Supabase

1. On your Mac, open **Supabase**: https://supabase.com/dashboard
2. Open your project
3. Go to **Authentication** → **URL Configuration**
4. **Site URL:** set to `https://YOUR_DOMAIN.com` (e.g. `https://leads.yourdomain.com`)
5. **Redirect URLs:** add `https://YOUR_DOMAIN.com/auth/callback`
6. Save

---

## Step 11: Start the app with PM2

On the VPS (still in `/var/www/leads-linked`):

```bash
pm2 start server.js --name leads-linked
```

```bash
pm2 startup
```

It will print a long command. **Copy that entire command**, paste it in the terminal, and run it. Then:

```bash
pm2 save
```

```bash
pm2 status
```

You should see `leads-linked` with status **online**.

---

## Step 12: Configure Nginx (web server and HTTPS)

1. Create config (replace `leads.yourdomain.com` with your real domain):
   ```bash
   nano /etc/nginx/sites-available/leads-linked
   ```

2. Paste this (change the domain in `server_name`):
   ```nginx
   server {
       listen 80;
       server_name leads.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Save: **Ctrl+O**, Enter, **Ctrl+X**

4. Enable the site and reload Nginx:
   ```bash
   ln -sf /etc/nginx/sites-available/leads-linked /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

5. Install SSL (HTTPS) — replace with your domain:
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d leads.yourdomain.com
   ```
   Enter your email, agree to terms. When it finishes, your site will use HTTPS.

---

## Step 13: Open your site

1. In your browser go to: **https://leads.yourdomain.com** (or whatever domain you set)
2. You should see the login page. Click **Sign in with Google** and test.

---

## If something goes wrong

- **502 Bad Gateway:** On the VPS run `pm2 status` and `pm2 logs leads-linked`. Make sure the app is running and `.env` has no typos.
- **Google sign-in doesn’t work:** Double-check Supabase **Redirect URLs** and **Site URL** (must be `https://` and exact domain).
- **Can’t connect with SSH:** In Hostinger VPS panel, check the IP and that SSH is enabled; use the password or key they gave you.

---

## Quick reference: your values

Fill these once and reuse:

| What        | Your value |
|------------|------------|
| GitHub repo URL | |
| Domain (e.g. leads.yourdomain.com) | |
| VPS IP | |
| Supabase Site URL | |
| Supabase Redirect URL | |

You’re done when you can open https://your-domain, see the app, and sign in with Google.
