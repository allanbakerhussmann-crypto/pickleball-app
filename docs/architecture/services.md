# Services Architecture

## Firebase Services (`services/firebase/`)

| Service | Purpose |
|---------|---------|
| `tournaments.ts` | Tournament CRUD, queries |
| `leagues.ts` | League CRUD, member management |
| `teams.ts` | Team creation, updates |
| `matches.ts` | Match operations, scheduling |
| `users.ts` | User profiles, roles |
| `clubs.ts` | Club management |
| `liveScores.ts` | Real-time score updates |
| `scoreVerification.ts` | Score confirm/dispute flows |
| `leagueMatchGeneration.ts` | Generate league matches |
| `boxLeague.ts` | Box league operations |
| `courtBookings.ts` | Court reservation system |
| `duprScoring.ts` | DUPR submission via Cloud Functions |
| `duprMatchStatus.ts` | DUPR match status tracking |
| `smsCredits.ts` | SMS credit management |
| `comms.ts` | League communications |
| `registrations.ts` | Event registrations |
| `organizerRequests.ts` | Organizer role requests |
| `phoneVerification.ts` | Phone OTP verification |
| `audit.ts` | Audit logging |
| `breachLogging.ts` | Security breach logs |

## Format Generators (`services/formats/`)

| Generator | Output |
|-----------|--------|
| `poolPlayMedals.ts` | Pool stage + medal bracket |
| `elimination.ts` | Single/double elimination brackets |
| `roundRobin.ts` | Round robin pairings |
| `swiss.ts` | Swiss system rounds |
| `ladder.ts` | Ladder rankings and challenges |
| `kingOfCourt.ts` | King of court matchups |
| `rotatingDoublesBox.ts` | Rotating partner boxes |
| `fixedDoublesBox.ts` | Fixed team boxes |

## Game Services (`services/game/`)

| Service | Purpose |
|---------|---------|
| `scoreValidation.ts` | Validate scores against game settings |

Helper functions:
- `isMatchComplete()` - Check if match is finished
- `formatMatchScore()` - Format score for display
- `calculateMatchWinner()` - Determine winner from scores

## Payment Services (`services/firebase/payments/`)

| Service | Purpose |
|---------|---------|
| `stripe.ts` | Stripe API integration |
| `wallet.ts` | User wallet/balance system |
| `transactions.ts` | Transaction history |
| `annualPass.ts` | Annual pass management |

---

## Key Patterns

### Authentication Flow

1. `AuthProvider` wraps app at root
2. `useAuth()` hook provides current user, profile, login/logout
3. Protected routes check auth status
4. Roles control access: player, organizer, app_admin

### Real-time Updates

- Firebase `onSnapshot` listeners for live data
- Subscription hooks: `subscribeToMatches()`, `subscribeToTeams()`
- Automatic cleanup on component unmount

Example:
```typescript
useEffect(() => {
  const unsubscribe = subscribeToMatches(divisionId, (matches) => {
    setMatches(matches);
  });
  return () => unsubscribe();
}, [divisionId]);
```

### Score Verification Flow

1. Player submits score
2. Opponent confirms or disputes
3. Organizer resolves disputes
4. Standings update after verification

Score states: `none` → `proposed` → `signed` → `official`
                        ↘ `disputed` ↗

### Drag and Drop

Uses @dnd-kit for accessible drag-drop:
- Tournament bracket reordering
- Player seeding management
- Box league player movement

```typescript
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
```
