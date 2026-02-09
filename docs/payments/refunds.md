# Refund System Architecture

## Overview

Refunds use Stripe Direct Charges with the `stripeAccount` header. This ensures refunds are processed from the connected account (organizer), not the platform.

## Key Files

| File | Purpose |
|------|---------|
| `functions/src/stripe.ts` | `stripe_createRefund` function + `handleChargeRefunded` webhook |
| `components/clubs/TransactionDetailDrawer.tsx` | UI for issuing refunds |
| `components/clubs/FinanceTab.tsx` | Finance tab showing transactions + refunds |
| `services/firebase/payments/finance.ts` | Queries transactions by `organizerUserId` |

---

## Critical Field: organizerUserId

**The `organizerUserId` field is REQUIRED on all refund transactions for them to appear in individual organizer Finance tabs.**

The Finance tab queries transactions using:

```typescript
query(collection(db, 'transactions'),
  where('organizerUserId', '==', currentUser.uid),
  where('referenceType', '==', 'meetup'),
  orderBy('createdAt', 'desc')
)
```

If `organizerUserId` is missing, the refund won't appear in the organizer's Finance tab (only in club/admin views).

---

## Refund Transaction Creation Points

There are TWO places where refund transactions are created:

### 1. `stripe_createRefund` (App-initiated refunds)

```typescript
organizerUserId: tx.organizerUserId || '',
```

### 2. `handleChargeRefunded` (External refunds from Stripe Dashboard)

```typescript
organizerUserId: original.organizerUserId || '',
```

**BOTH locations must include `organizerUserId` or refunds will be invisible to organizers.**

---

## Refund Amount Calculation

For Direct Charges, the refund amount calculation uses:

```typescript
const refundAmount = tx.amount - (tx.platformFeeAmount || 0);
```

This refunds the **NET amount** (what organizer received), not the GROSS amount (what customer paid). The platform fee is NOT refunded automatically - Stripe handles application_fee refunds separately.

---

## Transaction Status Flow

```
Payment: pending → completed
Refund (app): processing → completed (via webhook)
Refund (external): created as completed directly
```

---

## Firestore Indexes Required

The Finance tab requires composite indexes on the `transactions` collection:

| Fields |
|--------|
| `organizerUserId` + `referenceType` + `createdAt` |
| `organizerUserId` + `type` + `referenceType` + `createdAt` |
| `organizerUserId` + `type` + `status` + `createdAt` |

---

## Firestore Rules

Organizers can read their own transactions:

```javascript
resource.data.organizerUserId != null &&
resource.data.organizerUserId == request.auth.uid
```

---

## Debugging Refund Issues

### Refund not appearing in Finance tab?

1. Check Firestore: Does the refund transaction have `organizerUserId`?
2. Check indexes: Are all required composite indexes enabled?

### Refund amount wrong?

1. Verify using `tx.amount - tx.platformFeeAmount` (not just `tx.amount`)
2. Direct Charges refund from connected account, not platform

### No success notification?

Check `TransactionDetailDrawer.tsx` has alert after `createRefund` call
