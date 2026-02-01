#!/bin/bash
# Deploy to TEST environment (pickleball-app-test)
# This is now the DEFAULT - just build and deploy

set -e

echo "========================================="
echo "  DEPLOYING TO TEST (pickleball-app-test)"
echo "========================================="

# Clean and build (defaults to test now)
echo "[1/3] Building..."
rm -rf dist
npm run build

# Verify
echo "[2/3] Verifying build..."
if grep -q "pickleball-app-test" dist/assets/*.js; then
    echo "  ✓ Verified: pickleball-app-test"
else
    echo "  ✗ ERROR: Wrong project ID in build!"
    exit 1
fi

# Deploy
echo "[3/3] Deploying..."
firebase deploy --only hosting --project pickleball-app-test

echo ""
echo "========================================="
echo "  DONE: https://pickleball-app-test.web.app"
echo "========================================="
