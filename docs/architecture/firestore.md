# Firestore Collections

## Collection Structure

```
users/                        # User profiles
clubs/                        # Club data
  └── members/                # Club members (subcollection)
tournaments/                  # Tournament definitions
  └── divisions/              # Tournament divisions (subcollection)
leagues/                      # League data
  └── members/                # League members (subcollection)
  └── matches/                # League matches (subcollection)
meetups/                      # Meetup events
registrations/                # Event registrations
matches/                      # Match data
teams/                        # Team groupings
scores/                       # Live scores
courtBookings/                # Court reservations
transactions/                 # Payment transactions
phone_verification_codes/     # OTP codes for phone verification
sms_messages/                 # SMS messages queue (SMSGlobal)
sms_credits/                  # SMS credit balances and transactions
duprWebhookEvents/            # DUPR webhook events for auditing
duprPlayers/                  # DUPR rating snapshots by DUPR ID
```

## Key Collection Details

### users/
- User profiles with DUPR ratings, contact info, preferences
- Fields: `displayName`, `email`, `phone`, `phoneVerified`, `duprId`, `duprDoublesRating`, etc.

### transactions/
- Payment and refund records
- **Critical field**: `organizerUserId` - Required for organizer Finance tab visibility
- See [Refunds documentation](../payments/refunds.md) for required indexes

### phone_verification_codes/
Requires composite indexes:
1. `phone` (Asc) + `createdAt` (Asc) - Rate limiting per phone
2. `userId` (Asc) + `createdAt` (Asc) - Daily rate limiting per user
3. `phone` (Asc) + `userId` (Asc) + `verified` (Asc) + `expiresAt` (Desc) - Verify query

## Index Requirements

### transactions collection
```
organizerUserId + referenceType + createdAt
organizerUserId + type + referenceType + createdAt
organizerUserId + type + status + createdAt
```

### phone_verification_codes collection
```
phone + createdAt
userId + createdAt
phone + userId + verified + expiresAt (DESC)
```

## Security Rules Summary

Key rules in `firestore.rules`:

```javascript
// Users can read their own profile
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
}

// Organizers can read their own transactions
match /transactions/{txId} {
  allow read: if resource.data.organizerUserId == request.auth.uid;
}

// Phone verification codes only accessible via Cloud Functions
match /phone_verification_codes/{docId} {
  allow read, write: if false;
}
```
