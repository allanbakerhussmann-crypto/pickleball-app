# Deployment Runbook

> **WARNING**: Read the [Deployment Safety Rules](../../CLAUDE.md#deployment-safety-rules-critical) in CLAUDE.md before ANY deployment.

## Quick Reference

| Action | Command |
|--------|---------|
| Deploy to TEST | `bash deploy-test.sh` |
| Deploy to PRODUCTION | `bash deploy-prod.sh` |
| Deploy Functions (test) | `cd functions && firebase use test && npm run deploy` |
| Deploy Functions (prod) | `cd functions && firebase use prod && npm run deploy` |

---

## Pre-Deployment Checklist

- [ ] Code reviewed and tested locally
- [ ] `npm run typecheck` passes with no errors
- [ ] `cd functions && npm run build` succeeds
- [ ] `.env` has `VITE_USE_EMULATORS` removed or set to `false`
- [ ] User has explicitly approved deployment
- [ ] Correct Firebase project confirmed (`firebase use`)

---

## Deploy to TEST

```bash
bash deploy-test.sh
```

This script:
1. Builds with `.env.production` (contains TEST config by default)
2. Verifies `pickleball-app-test` project ID in bundle
3. Deploys to test hosting

---

## Deploy to PRODUCTION

```bash
bash deploy-prod.sh
```

This script:
1. Prompts you to type "production" to confirm
2. Temporarily copies `.env.productionsite` to `.env.production`
3. Builds with production config
4. Verifies `pickleball-app-dev` project ID in bundle
5. Deploys to production hosting
6. Restores original `.env.production`

---

## Deploy Cloud Functions

### Test Environment

```bash
cd functions
firebase use test
npm run build
npm run deploy
```

### Production Environment

```bash
cd functions
firebase use prod
npm run build
npm run deploy
```

---

## Rollback Procedures

### Hosting Rollback

1. Go to Firebase Console → Hosting → Release History
2. Find the previous working version
3. Click "Rollback" on that version

### Functions Rollback

1. Go to Firebase Console → Functions
2. Click on the function that needs rollback
3. View version history
4. Redeploy previous version

### Check Logs

```bash
cd functions && npm run logs
# or
firebase functions:log --only functionName
```

---

## Environment Files

| File | Contains | Used By |
|------|----------|---------|
| `.env` | Local dev config | `npm run dev` |
| `.env.production` | TEST config (safe default) | All builds by default |
| `.env.productionsite` | PRODUCTION config | Only `deploy-prod.sh` |

---

## Firebase Project Aliases

Defined in `.firebaserc`:

| Alias | Project ID | Purpose |
|-------|-----------|---------|
| `test` / `default` | `pickleball-app-test` | Test environment |
| `prod` | `pickleball-app-dev` | Production (live site) |

Check current project:
```bash
firebase use
```

Switch project:
```bash
firebase use test
firebase use prod
```

---

## Common Issues

### "Wrong project ID in bundle"

The deploy script detected the wrong Firebase project in the built bundle. This prevents deploying test code to production or vice versa.

**Solution**: Use the deploy scripts, not manual `firebase deploy`.

### Functions build fails

```bash
cd functions
npm install
npm run build
```

Check for TypeScript errors and fix them.

### Emulator config leaking to production

Ensure `.env` does NOT have `VITE_USE_EMULATORS=true` when building for deployment.
