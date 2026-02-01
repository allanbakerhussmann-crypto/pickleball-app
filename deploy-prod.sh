#!/bin/bash
# Deploy to PRODUCTION environment (pickleball-app-dev)
# REQUIRES EXPLICIT ACTION - swaps in production config temporarily

set -e

echo "========================================="
echo "  ⚠️  DEPLOYING TO PRODUCTION ⚠️"
echo "  Project: pickleball-app-dev"
echo "========================================="
echo ""
read -p "Type 'production' to confirm: " confirm

if [ "$confirm" != "production" ]; then
    echo "Aborted."
    exit 1
fi

# Swap in production config
echo "[1/5] Swapping to production config..."
cp .env.production .env.production.test.bak
cp .env.productionsite .env.production

# Clean and build
echo "[2/5] Building..."
rm -rf dist
npm run build

# Verify
echo "[3/5] Verifying build..."
if grep -q "pickleball-app-dev" dist/assets/*.js; then
    echo "  ✓ Verified: pickleball-app-dev (production)"
else
    echo "  ✗ ERROR: Wrong project ID in build!"
    mv .env.production.test.bak .env.production
    exit 1
fi

# Deploy
echo "[4/5] Deploying..."
firebase deploy --only hosting --project pickleball-app-dev

# Restore test as default
echo "[5/5] Restoring test as default..."
mv .env.production.test.bak .env.production

echo ""
echo "========================================="
echo "  DONE: https://pickleball-app-dev.web.app"
echo "  (Default restored to test)"
echo "========================================="
