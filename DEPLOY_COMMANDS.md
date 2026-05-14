# Deployment Commands

Run these commands on the server to deploy the latest changes:

```bash
cd /var/www/MACVBET
git pull origin main
cd mini-app/apps/backend
npm run build
pkill -f "node dist/index.js"
sleep 2
nohup node dist/index.js > /var/log/backend.log 2>&1 &
cd ../frontend
npm run build
fuser -k 3000/tcp
sleep 2
nohup npm run start > /var/log/frontend.log 2>&1 &
sleep 10
ps aux | grep node | grep -v grep
echo ""
echo "=== Backend log ==="
tail -10 /var/log/backend.log
echo ""
echo "=== Frontend log ==="
tail -10 /var/log/frontend.log
```

## Changes in this deployment:

1. **Fixed TypeScript errors** - `/plinko/my-history` endpoint now properly typed
2. **Player history limit changed to 7** - Shows last 7 bets instead of 10
3. **Balance sync fixed** - Default mode changed from demo to real, so users see their actual bot balance (0 instead of 10k demo balance)
4. **Avatar display simplified** - Shows initials instead of trying to load Telegram avatars (which were 404ing)

## Expected Results:

- ✅ Backend builds without TypeScript errors
- ✅ Player history shows 7 bets maximum
- ✅ Balance shows 0 (real balance from bot) instead of 10k (demo balance)
- ✅ Live history shows initials instead of broken avatar images
- ✅ All bets are saved with multipliers (already fixed in previous deployment)

## Still TODO (for next deployment):

1. **Bot withdrawal cancellation** - Add inline "Отмена" button or /start command to cancel withdrawal flow
2. **Debug 400 error on bet placement** - Need to check backend logs to see why some bets fail
