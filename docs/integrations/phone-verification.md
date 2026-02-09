# Phone Verification System

## Overview

SMS-based phone number verification using OTP codes. Players can verify their phone numbers to receive SMS notifications for court assignments, match results, and other alerts.

---

## How It Works

1. **Signup Flow**: Phone field shown during signup (optional, no blocking)
2. **Verification Modal**: After signup with phone, prompts for verification (skippable)
3. **Profile Page**: Can add/verify phone later from Profile
4. **SMS Notifications**: Requires verified phone to enable SMS preferences

---

## Key Components

| File | Purpose |
|------|---------|
| `functions/src/phoneVerification.ts` | Cloud Functions for OTP send/verify |
| `services/firebase/phoneVerification.ts` | Frontend service wrapper |
| `components/auth/PhoneVerificationModal.tsx` | Two-step verification modal |
| `components/shared/PhoneInput.tsx` | Country code selector with auto-formatting |

---

## Cloud Functions

### `phone_sendVerificationCode`

- Generates 6-digit OTP code
- Stores hashed code in `phone_verification_codes` collection
- Sends SMS via SMSGlobal (writes to `sms_messages` collection)
- Rate limits: 3 codes/phone/hour, 10 codes/user/day
- Code expires in 10 minutes

### `phone_verifyCode`

- Validates OTP against stored hash
- Max 3 attempts per code
- On success: Sets `phoneVerified: true` on user profile
- Returns remaining attempts on failure

---

## PhoneInput Component

Reusable component with country code selector:

| Country | Code |
|---------|------|
| NZ | +64 (Default) |
| AU | +61 |
| US | +1 |
| UK | +44 |

Auto-formats numbers as user types, outputs E.164 format.

```typescript
<PhoneInput
  value={phone}
  onChange={(e164Value) => setPhone(e164Value)}
  defaultCountry="NZ"
/>
```

---

## Firestore Indexes Required

The `phone_verification_codes` collection requires 3 composite indexes:

1. `phone` (Asc) + `createdAt` (Asc) - Rate limiting per phone
2. `userId` (Asc) + `createdAt` (Asc) - Daily rate limiting per user
3. `phone` (Asc) + `userId` (Asc) + `verified` (Asc) + `expiresAt` (Desc) - Verify query

---

## User Profile Fields

```typescript
interface UserProfile {
  phone?: string;           // E.164 format (+64211234567)
  phoneVerified?: boolean;  // Verification status
  phoneVerifiedAt?: number; // Timestamp when verified
}
```

---

## Security

- OTP codes hashed with SHA-256 before storage
- 10-minute expiry on codes
- Max 3 verification attempts per code
- Rate limiting prevents brute force
- Firestore rules: `phone_verification_codes` only accessible via Cloud Functions
