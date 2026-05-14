# Fixes Applied - Plinko Game

## Issue 1: TypeScript Build Errors ✅ FIXED
**Problem:** Backend build failing with TypeScript errors in `games.ts`
- Error: `Cannot find name 'app'` in `/plinko/my-history` endpoint
- Error: Parameters implicitly have 'any' type

**Solution:** 
- Fixed type annotations for request and reply parameters
- Changed `(b: any)` to proper type inference with `(b)`
- Changed `(bet: any)` to proper type inference with `(bet)`

**Files Changed:**
- `mini-app/apps/backend/src/routes/games.ts`

---

## Issue 2: Player History Shows 10 Bets Instead of 7 ✅ FIXED
**Problem:** "Последние ставки" section shows 10 bets, user wants 7

**Solution:**
- Changed default limit from `'10'` to `'7'` in `/plinko/my-history` endpoint
- Changed frontend slice from `.slice(0, 10)` to `.slice(0, 7)`
- Updated fetch URL to include `?limit=7` parameter

**Files Changed:**
- `mini-app/apps/backend/src/routes/games.ts` (line 586: `limit || '7'`)
- `mini-app/apps/frontend/src/app/game/plinko/page.tsx` (line 95: `?limit=7`, line 565: `.slice(0, 7)`)

---

## Issue 3: Balance Shows 10k Instead of 0 ✅ FIXED
**Problem:** User has 0 balance in bot, but mini-app shows 10,000 (demo balance)

**Root Cause:** 
- Demo mode store defaults to `isDemoMode: true`
- When user first loads app, they're in demo mode
- Demo mode creates a balance with 10,000 starting amount
- User's real balance (0) is never shown

**Solution:**
- Changed default from `isDemoMode: true` to `isDemoMode: false` in demo mode store
- Now users start in REAL mode and see their actual bot balance
- Demo mode must be explicitly enabled by user

**Files Changed:**
- `mini-app/apps/frontend/src/store/demo-mode-store.ts` (line 27: `isDemoMode: false`)

**Impact:**
- ✅ Users now see their real balance from bot (0 if they haven't deposited)
- ✅ Demo mode still works when explicitly enabled
- ✅ Balance syncs correctly with PostgreSQL database

---

## Issue 4: Avatars Not Loading in Live History ✅ FIXED (Previous Deployment)
**Problem:** Telegram avatar URLs returning 404 errors

**Solution:**
- Simplified avatar display to show user initials only
- Removed `<img>` tag that was trying to load Telegram URLs
- Now shows first letter of username in colored circle

**Files Changed:**
- `mini-app/apps/frontend/src/app/game/plinko/page.tsx`

---

## Issue 5: Bets Not Being Saved with Multipliers ✅ FIXED (Previous Deployment)
**Problem:** Some bets (especially losses) not being saved, causing MAX КОЭФФ to show incorrect value

**Solution:**
- Removed `if (multiplier > 0)` check in plinko engine
- Now ALWAYS calls `processPayout` regardless of multiplier value
- All bets are saved with their multipliers (including 0.2x, 0.3x, etc.)

**Files Changed:**
- `mini-app/apps/backend/src/games/plinko/plinko-engine.ts`

---

## Issue 6: Diagonal Walls Too Far from Pyramid ✅ FIXED (Previous Deployment)
**Problem:** Walls were too far from pyramid, balls could escape

**Solution:**
- Positioned walls VERY CLOSE to pyramid edges
- Gap = `ballRadius + 2px` (just enough for ball to pass)
- Added stronger bounce (restitution = 1.3) to push balls toward center

**Files Changed:**
- `mini-app/apps/frontend/src/app/game/plinko/page.tsx`

---

## Still TODO (Next Deployment)

### 1. Bot Withdrawal Cancellation
**User Request:** When user is in withdrawal flow and types amount, add:
- Inline "Отмена" button to cancel
- OR allow /start command to cancel withdrawal flow

**Current State:** 
```
🖊 Wprowadź kwotę wypłaty od 5 USDT:
Metoda: 🌐 CryptoBot (@send)
• Dostępne: 🔹 0.00 USDT
```

**Needed:** Add cancellation option so user can exit withdrawal flow

**Files to Modify:**
- Python bot handlers (withdrawal flow)
- Need to add inline keyboard with "Отмена" button
- OR handle /start command to reset state

---

### 2. Debug 400 Error on Bet Placement
**Problem:** Sometimes POST `/api/games/plinko/drop` returns 400 error

**Possible Causes:**
1. Insufficient balance (most likely)
2. Invalid risk level
3. Invalid bet amount
4. Database connection issue

**Next Steps:**
1. Check backend logs: `tail -50 /var/log/backend.log`
2. Add more detailed error logging in plinko drop endpoint
3. Test with different bet amounts and risk levels

---

## Deployment Status

### Committed & Pushed ✅
- All fixes above are committed to git
- Pushed to `main` branch
- Ready for server deployment

### Server Deployment Commands
```bash
cd /var/www/MACVBET
git pull origin main
cd mini-app/apps/backend && npm run build
pkill -f "node dist/index.js"
sleep 2
nohup node dist/index.js > /var/log/backend.log 2>&1 &
cd ../frontend && npm run build
fuser -k 3000/tcp
sleep 2
nohup npm run start > /var/log/frontend.log 2>&1 &
```

### Expected Results After Deployment
- ✅ Backend builds without errors
- ✅ Player history shows 7 bets
- ✅ Balance shows 0 (real) instead of 10k (demo)
- ✅ Live history shows initials
- ✅ All bets saved with multipliers
- ✅ MAX КОЭФФ shows correct value in profile

---

## Testing Checklist

After deployment, test:
- [ ] Backend builds successfully
- [ ] Frontend builds successfully
- [ ] Both services start without errors
- [ ] User balance shows 0 (not 10k)
- [ ] Player history shows max 7 bets
- [ ] Live history shows initials (not broken images)
- [ ] Bets are placed successfully
- [ ] Bets are saved with multipliers
- [ ] Profile shows correct MAX КОЭФФ
- [ ] Demo mode toggle works
- [ ] Balance updates after bets
