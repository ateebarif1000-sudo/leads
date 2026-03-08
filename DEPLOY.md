# Deploy commands

## On your Mac (push to GitHub)

```bash
cd /Users/unjilaarif/Documents/leads_linked
git add -A
git commit -m "Your commit message"
git push origin main
```

## On the VPS (pull and restart)

```bash
cd /var/www/leads-linked
git pull
pm2 restart leads-linked
pm2 save
```

Replace `"Your commit message"` with a short description of your changes.
