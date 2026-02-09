# DUPR Integration

## Overview

DUPR (Dynamic Universal Pickleball Rating) integration enables automatic match submission for rating updates. All DUPR API calls go through Cloud Functions (server-side only).

## Architecture

```
Browser → httpsCallable('dupr_submitMatches') → Cloud Function → DUPR API
```

- **Server-side only** - Never call DUPR API from the browser
- **Organizer-controlled** - Only organizers can trigger submissions
- **Compliance model** - Anti-self-reporting, organizer verification required

---

## Key Files

| File | Purpose |
|------|---------|
| `functions/src/dupr.ts` | Cloud Functions for DUPR API (SERVER ONLY) |
| `services/firebase/duprScoring.ts` | Client service (calls Cloud Functions) |
| `services/dupr/index.ts` | DUPR config, token management |
| `components/profile/DuprConnect.tsx` | SSO login component |
| `components/shared/DuprControlPanel.tsx` | Organizer submission UI |

---

## API Environments

| Environment | Base URL |
|-------------|----------|
| UAT | `https://uat.mydupr.com/api` |
| Production | `https://prod.mydupr.com/api` |

---

## Match Eligibility Rules

A match can be submitted to DUPR if:

- Status is `completed`
- Has `officialResult` (organizer-finalized)
- All players have linked DUPR IDs
- At least one team scored 6+ points
- No tied games (scoreA !== scoreB for all games)
- Not already submitted (`duprSubmitted !== true`)

---

## Submission Flow

1. Match finalized by organizer → `officialResult` created
2. Organizer clicks "Submit to DUPR" in control panel
3. Cloud Function builds payload with deterministic identifier
4. DUPR API called server-side
5. Match marked `duprSubmitted: true` on success

---

## Payload Format

```typescript
{
  identifier: `${eventType}_${eventId}_${matchId}`,  // DETERMINISTIC!
  event: "Event Name",
  format: "DOUBLES" | "SINGLES",
  matchDate: "2025-01-07",
  matchSource: "PARTNER",
  teamA: { player1: "duprId", player2: "duprId", game1: 11, game2: 9 },
  teamB: { player1: "duprId", player2: "duprId", game1: 5, game2: 11 },
}
```

---

## Critical Rules

1. **Identifier must be deterministic** - Same match = same identifier for retries
2. **teamA and teamB must have same game fields** (game1, game2, etc.)
3. **No tied games** - scoreA !== scoreB for all games
4. **Import correctly**: `import { httpsCallable } from '@firebase/functions'` (NOT `firebase/functions`)
5. **Handle "already exists" as success** - DUPR rejects duplicates with this error
6. **Doubles validation**: Determine by PLAYER count, not DUPR ID count

---

## Compliance Summary

| Rule | Implementation |
|------|----------------|
| Player scores are proposals only | `scoreState: 'proposed'` |
| Only organisers finalise | `finalisedByUserId` must be organiser |
| Only official results to DUPR | Check `officialResult` exists before submission |
| Server-side execution | Cloud Functions only, not client-side |

---

## Score Lifecycle

```
none → proposed → signed → official → submittedToDupr
                ↘ disputed ↗
```

**Only `official` results affect standings/brackets and can be submitted to DUPR.**

---

## Debugging Checklist

1. **Check Cloud Function logs**: `firebase functions:log --only dupr_submitMatches`
2. **Use test function**: Click "Test" button on a single match in DUPR panel
3. **Verify credentials**: `firebase functions:config:get` shows `dupr.client_key` and `dupr.client_secret`
4. **Check for duplicates**: "Already exists" means match was previously submitted

---

## Webhook Integration

Real-time rating updates via DUPR webhooks. Complements the daily `dupr_syncRatings` cron job.

### Webhook Architecture

```
DUPR Server → POST /api/dupr/webhook → Firebase Hosting → duprWebhook Cloud Function
                                                              ↓
                                                     duprWebhookEvents/{id}
                                                              ↓
                                                     users/{uid} profile update
```

### Webhook Functions

| Function | Type | Purpose |
|----------|------|---------|
| `duprWebhook` | HTTP (`onRequest`) | Receives webhook events from DUPR |
| `dupr_subscribeToRatings` | Callable | Subscribe specific users to notifications |
| `dupr_subscribeAllUsers` | Callable | Bulk subscribe all users with DUPR IDs (admin) |
| `dupr_getSubscriptions` | Callable | List current subscriptions |
| `dupr_onUserDuprLinked` | Firestore trigger | Auto-subscribe when user links DUPR |

### Subscription API Format

**CRITICAL**: The DUPR subscribe API expects the body as a raw array, NOT wrapped in an object:

```typescript
// CORRECT - just the array
body: JSON.stringify(["GGEGNM"])

// WRONG - don't wrap in object
body: JSON.stringify({ duprIds: ["GGEGNM"] })
```

Subscribe one user at a time (no batch support).

### Webhook Event Format

```typescript
{
  "clientId": "1111",
  "event": "RATING",
  "message": {
    "duprId": "ABC123",
    "name": "Player Name",
    "rating": {
      "singles": "4.0",
      "doubles": "4.5",
      "singlesReliability": "4.0",
      "doublesReliability": "4.0",
      "matchId": 12345
    }
  }
}
```

### Key Implementation Details

1. **Dedupe**: SHA-256 hash of payload fields prevents duplicate processing
2. **Always return 200**: Never let processing errors cause DUPR retries
3. **duprLastSyncAt must be number**: Use `Date.now()` not Firestore Timestamp (for rate limiting compatibility)
4. **Auto-subscribe**: `dupr_onUserDuprLinked` trigger subscribes users when they link DUPR account
5. **Webhook URL**: `/api/dupr/webhook` (Firebase Hosting rewrite BEFORE catch-all)

### Firestore Collections

- `duprWebhookEvents/{dedupeKey}` - Raw events for auditing
- `duprPlayers/{duprId}` - Rating snapshots by DUPR ID
- `users/{uid}` - Updated with `duprLastSyncSource: 'webhook'`

### User Fields Updated by Webhook

```typescript
{
  duprDoublesRating: number;
  duprSinglesRating: number;
  duprDoublesReliability: number;
  duprSinglesReliability: number;
  duprLastSyncAt: number;        // Must be milliseconds, not Timestamp
  duprLastSyncSource: 'webhook'; // Track update source
  duprSubscribed: boolean;       // Set by auto-subscribe trigger
  duprSubscribedAt: number;
}
```
