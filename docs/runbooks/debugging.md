# Debugging Guide

## Cloud Functions Logs

```bash
# All functions
cd functions && npm run logs

# Specific function
firebase functions:log --only stripe_createRefund

# Follow logs in real-time
firebase functions:log --only stripe_createRefund --follow
```

---

## Stripe Issues

### Payment not appearing

1. Check Stripe Dashboard for the charge
2. Verify webhook received: Firebase Console → Functions → `stripeWebhook` logs
3. Check transaction was created in Firestore

### Refund issues

See [Refund debugging](../payments/refunds.md#debugging-refund-issues) for detailed troubleshooting.

### Webhook failures

1. Check Stripe Dashboard → Developers → Webhooks
2. Look for failed deliveries and error messages
3. Verify webhook secret in Firebase Functions config:
   ```bash
   firebase functions:config:get stripe.webhook_secret
   ```

---

## DUPR Issues

### Match not submitting

1. Check eligibility:
   - Match status is `completed`
   - Has `officialResult`
   - All players have DUPR IDs
   - Not already submitted (`duprSubmitted !== true`)

2. Check Cloud Function logs:
   ```bash
   firebase functions:log --only dupr_submitMatches
   ```

3. Verify credentials:
   ```bash
   firebase functions:config:get dupr
   ```

### "Already exists" error

This is actually success - the match was previously submitted. The system treats this as success.

---

## Phone Verification Issues

### Code not received

1. Check `sms_messages` collection for the queued message
2. Check SMSGlobal dashboard for delivery status
3. Verify phone number format (should be E.164: `+64211234567`)

### Rate limit hit

- 3 codes per phone per hour
- 10 codes per user per day

Wait or use a different phone number for testing.

### Verification failing

1. Check attempts remaining (max 3 per code)
2. Verify code hasn't expired (10 minute expiry)
3. Check `phone_verification_codes` collection for the record

---

## Firestore Index Issues

### Query failing with index error

Firebase will log the exact index needed. Copy the URL from the error message and create the index in Firebase Console.

Common required indexes:
- `transactions`: `organizerUserId` + `referenceType` + `createdAt`
- `phone_verification_codes`: `phone` + `createdAt`

---

## Authentication Issues

### User can't access organizer features

1. Check user's `role` field in Firestore
2. Should be `'organizer'` or `'app_admin'`

### Session expired

Firebase Auth sessions expire. User needs to re-authenticate.

---

## Build Issues

### TypeScript errors

```bash
npm run typecheck
```

Fix all errors before deploying.

### Missing dependencies

```bash
npm install
cd functions && npm install
```

### Vite build fails

Check for:
- Circular imports
- Missing environment variables
- Invalid JSX

---

## Emulator Issues

### Emulators won't start

```bash
cd functions
npm run emulators
```

Check for:
- Port conflicts (4000, 5001, 8080, 9099)
- Java not installed (required for Firestore emulator)

### Seed data not loading

```bash
cd functions
npm run seed
```

Check seed script for errors.

---

## Performance Issues

### Slow queries

1. Add appropriate indexes
2. Limit query results with `.limit()`
3. Use pagination for large datasets

### Memory issues in Functions

Increase memory allocation in function definition:
```typescript
export const myFunction = functions
  .runWith({ memory: '512MB' })
  .https.onCall(...);
```
