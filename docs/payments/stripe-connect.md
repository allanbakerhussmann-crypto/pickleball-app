# Stripe Connect Integration

## Overview

Pickleball Director uses Stripe Connect with **Direct Charges** for payment processing. This means:

- Payments go directly to the connected account (organizer)
- Platform takes an application fee from each transaction
- Refunds are processed from the connected account

## Architecture

```
Customer → Checkout → Stripe (via connected account) → Organizer
                              ↓
                         Platform Fee → Platform Account
```

## Key Concepts

### Connected Accounts

Each organizer has a Stripe Connected Account. The account ID is stored in their user profile.

### Direct Charges

Charges are created on the connected account with an application fee:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... other config
  payment_intent_data: {
    application_fee_amount: platformFeeAmount,
  },
}, {
  stripeAccount: connectedAccountId,  // CRITICAL - routes to organizer
});
```

### Application Fees

The platform fee is deducted from the payment automatically. Organizers receive `amount - platformFee`.

## Webhook Handling

Webhooks are received for the platform account. For connected account events, use the `stripeAccount` header when making API calls:

```typescript
const refund = await stripe.refunds.create({
  charge: chargeId,
  amount: refundAmount,
}, {
  stripeAccount: connectedAccountId,  // Required for Direct Charges
});
```

## Key Files

| File | Purpose |
|------|---------|
| `functions/src/stripe.ts` | All Stripe Cloud Functions |
| `services/stripe/checkout.ts` | Client-side checkout initiation |
| `components/checkout/` | Checkout UI components |

## Security Considerations

1. **Never expose secret keys** - All Stripe API calls via Cloud Functions
2. **Verify webhook signatures** - Always validate incoming webhooks
3. **Connected account isolation** - Always pass `stripeAccount` for connected operations

## Testing

Use Stripe test mode with test connected accounts:
- Platform: `sk_test_...` (in Firebase Functions config)
- Connected: Create test accounts in Stripe Dashboard

## Common Issues

### Payment going to wrong account

Check that `stripeAccount` is passed to all Stripe API calls for connected account operations.

### Refund failing

1. Verify the charge was made on the connected account
2. Ensure sufficient balance on connected account
3. Check the `stripeAccount` header is included
