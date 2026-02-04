# Test Environment Setup Checklist

Use this checklist to complete the test environment setup. Check off each item as you complete it.

---

## Phase 1: Firebase Console Setup

### 1.1 Enable Services in `pickleball-app-test`

Go to [Firebase Console](https://console.firebase.google.com) → Select `pickleball-app-test`

- [ ] **Authentication**
  - Go to: Build → Authentication → Get started
  - Click "Sign-in method" tab
  - Enable "Email/Password"
  - Click Save

- [ ] **Firestore Database**
  - Go to: Build → Firestore Database → Create database
  - Select "Start in test mode" (we'll deploy real rules later)
  - Choose region: `australia-southeast1` (same as prod)
  - Click Enable

- [ ] **Storage**
  - Go to: Build → Storage → Get started
  - Accept default rules for now
  - Choose region: `australia-southeast1`

- [ ] **Upgrade to Blaze Plan**
  - Click the gear icon → Usage and billing → Details & settings
  - Click "Modify plan" → Select "Blaze (pay as you go)"
  - Add billing info (required for Cloud Functions)

### 1.2 Register Web App & Get Config

- [ ] **Register the web app**
  - Go to: Project Settings (gear icon) → General
  - Scroll down to "Your apps"
  - Click the web icon `</>`
  - App nickname: `Pickleball Director Test`
  - Check "Also set up Firebase Hosting"
  - Click "Register app"

- [ ] **Copy the config values** and paste them below:

```
apiKey: ________________________________
authDomain: pickleball-app-test.firebaseapp.com
projectId: pickleball-app-test
storageBucket: pickleball-app-test.firebasestorage.app
messagingSenderId: ________________________________
appId: ________________________________
measurementId: ________________________________
```

---

## Phase 2: Update `.env.test` File

- [ ] Open `.env.test` in your editor
- [ ] Replace the placeholder values with the config from above:

```env
VITE_FIREBASE_API_KEY=<paste apiKey here>
VITE_FIREBASE_AUTH_DOMAIN=pickleball-app-test.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=pickleball-app-test
VITE_FIREBASE_STORAGE_BUCKET=pickleball-app-test.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<paste messagingSenderId here>
VITE_FIREBASE_APP_ID=<paste appId here>
VITE_FIREBASE_MEASUREMENT_ID=<paste measurementId here>
```

---

## Phase 3: Stripe Test Setup

### 3.1 Get Stripe Test Keys

- [ ] Go to [Stripe Dashboard](https://dashboard.stripe.com)
- [ ] Toggle to **Test mode** (switch in top right)
- [ ] Go to: Developers → API keys
- [ ] Copy the **Publishable key** (`pk_test_...`):

```
pk_test_________________________________
```

- [ ] Copy the **Secret key** (`sk_test_...`) - you'll need this for functions config:

```
sk_test_________________________________
```

- [ ] Paste the publishable key into `.env.test`:
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 3.2 Create Stripe Test Webhooks

Still in Stripe Dashboard (Test mode):

- [ ] **Create Account Webhook**
  - Go to: Developers → Webhooks → Add endpoint
  - Endpoint URL: `https://us-central1-pickleball-app-test.cloudfunctions.net/stripe_webhook`
  - Select events:
    - `checkout.session.completed`
    - `charge.refunded`
    - `invoice.paid`
    - `invoice.payment_failed`
  - Click "Add endpoint"
  - Click "Reveal" on signing secret and copy:

```
whsec___________________________________ (webhook_secret)
```

- [ ] **Create Connect Webhook**
  - Go to: Developers → Webhooks → Add endpoint
  - Endpoint URL: `https://us-central1-pickleball-app-test.cloudfunctions.net/stripe_v2_webhook`
  - Select events:
    - `account.updated`
  - Click "Add endpoint"
  - Click "Reveal" on signing secret and copy:

```
whsec___________________________________ (v2_webhook_secret)
```

---

## Phase 4: Deploy to Test Project

Open terminal in project root.

### 4.1 Switch to Test Project

```bash
firebase use test
```

- [ ] Verify it says: `Now using alias test (pickleball-app-test)`

### 4.2 Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

- [ ] Wait for deployment to complete (may take a few minutes for indexes)

### 4.3 Deploy Storage Rules

```bash
firebase deploy --only storage
```

- [ ] Verify success

### 4.4 Build and Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

- [ ] Wait for all functions to deploy (this takes 2-5 minutes)
- [ ] Note any errors - common issue is missing secrets (we'll set those next)

---

## Phase 5: Configure Functions Secrets

Still in terminal, make sure you're using the test project:

```bash
firebase use test
```

### 5.1 Stripe Secrets

Run each command and paste the values you collected earlier:

```bash
firebase functions:config:set stripe.secret_key="sk_test_YOUR_KEY_HERE"
```
- [ ] Done

```bash
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"
```
- [ ] Done

```bash
firebase functions:config:set stripe.v2_webhook_secret="whsec_YOUR_V2_WEBHOOK_SECRET"
```
- [ ] Done

### 5.2 SMSGlobal Secrets (copy from prod)

First, get the values from prod:
```bash
firebase use prod
firebase functions:config:get
```

Copy the smsglobal values, then switch back to test:
```bash
firebase use test
firebase functions:config:set smsglobal.apikey="YOUR_API_KEY"
firebase functions:config:set smsglobal.apisecret="YOUR_API_SECRET"
firebase functions:config:set smsglobal.origin="Pickleball"
```
- [ ] Done

### 5.3 App URL

```bash
firebase functions:config:set app.url="https://pickleball-app-test.web.app"
```
- [ ] Done

### 5.4 Email/SES Config (copy from prod)

Get values from prod config and set for test:
```bash
firebase functions:config:set ses.region="ap-southeast-2"
firebase functions:config:set ses.access_key_id="YOUR_ACCESS_KEY"
firebase functions:config:set ses.secret_access_key="YOUR_SECRET_KEY"
firebase functions:config:set ses.from_email="YOUR_FROM_EMAIL"
```
- [ ] Done

### 5.5 DUPR UAT Secret

```bash
firebase functions:secrets:set DUPR_CLIENT_SECRET
```
- [ ] Enter your DUPR UAT client secret when prompted

### 5.6 Redeploy Functions (to pick up new config)

```bash
cd functions
firebase deploy --only functions
```
- [ ] Wait for deployment to complete

---

## Phase 6: Deploy Frontend

From project root:

```bash
npm run deploy:test
```

This will:
1. Build with `.env.test` config
2. Switch to test project
3. Deploy to Firebase Hosting

- [ ] Verify deployment succeeds

---

## Phase 7: Verification

### 7.1 Test the Site

- [ ] Open https://pickleball-app-test.web.app
- [ ] **Verify yellow "TEST ENVIRONMENT" banner appears at top**
- [ ] Create a new test account (use a test email you control)
- [ ] Verify you can log in

### 7.2 Test Stripe Payment

- [ ] Create a test meetup or event that requires payment
- [ ] Go through checkout flow
- [ ] Use Stripe test card: `4242 4242 4242 4242`
  - Expiry: Any future date (e.g., 12/34)
  - CVC: Any 3 digits (e.g., 123)
- [ ] Verify payment completes
- [ ] Check Stripe Dashboard (Test mode) → Payments to see the test payment

### 7.3 Verify Data Isolation

- [ ] Go to Firebase Console → `pickleball-app-test` → Firestore
- [ ] Verify your test user appears in `users` collection
- [ ] Go to Firebase Console → `pickleball-app-dev` → Firestore
- [ ] Verify your test user does NOT appear there (data is isolated!)

### 7.4 Test SMS (Optional)

- [ ] Trigger an SMS notification in test
- [ ] Verify the message has `[TEST]` prefix

---

## Quick Reference

### Switching Between Environments

```bash
# Switch to test
firebase use test

# Switch to production
firebase use prod

# Check current project
firebase use
```

### Local Development

```bash
# Run locally against TEST Firebase
npm run dev:test

# Run locally against PRODUCTION Firebase (careful!)
npm run dev
```

### Deploying

```bash
# Deploy frontend to test
npm run deploy:test

# Deploy frontend to production
npm run deploy:prod

# Deploy functions to test
firebase use test && cd functions && npm run deploy

# Deploy functions to production
firebase use prod && cd functions && npm run deploy
```

---

## Troubleshooting

### "Permission denied" errors in Firestore
- Make sure you deployed rules: `firebase deploy --only firestore:rules`

### Functions failing with "config not found"
- Verify secrets are set: `firebase functions:config:get`
- Redeploy functions after setting config

### Stripe webhooks not working
- Check Stripe Dashboard → Webhooks → click endpoint → check "Webhook attempts"
- Verify URL is correct: `https://us-central1-pickleball-app-test.cloudfunctions.net/stripe_webhook`
- Check Firebase Functions logs: `firebase functions:log`

### Yellow banner not showing
- Verify `.env.test` has `VITE_FIREBASE_PROJECT_ID=pickleball-app-test`
- Rebuild: `npm run build:test`

---

## Done!

Once all checkboxes are complete, you have a fully functional test environment that:
- ✅ Is completely isolated from production
- ✅ Uses Stripe test payments (no real money)
- ✅ Shows clear "TEST ENVIRONMENT" indicator
- ✅ Adds `[TEST]` prefix to SMS/emails
- ✅ Has backend guardrails against cross-wiring
