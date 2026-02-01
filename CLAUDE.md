# Pickleball Director

> **Version**: 07.24
> **Type**: Tournament, League & Club Management Platform
> **Live URL**: https://pickleballdirector.co.nz
> **Firebase URL**: https://pickleball-app-dev.web.app

## Project Overview

Pickleball Director is a comprehensive web application for managing competitive pickleball events. It enables organizers to create and run tournaments, leagues, and club activities while providing players with registration, scoring, and ranking features.

### Target Users
- **Organizers**: Create and manage tournaments, leagues, meetups
- **Clubs**: Manage courts, members, bookings, and club events
- **Players**: Register for events, track ratings, view standings

### Core Features
- Multi-format tournament creation with divisions and brackets
- League management (4 formats: ladder, round robin, swiss, box league)
- Club management with court booking system
- Meetup/social play organization
- DUPR rating integration for skill-based matchmaking
- Stripe Connect payment processing
- Real-time scoring and verification
- Drag-and-drop bracket and seeding management

---

## Tech Stack

### Frontend
- **React** 19.2.0 - UI framework
- **TypeScript** 5.8 - Type safety
- **Vite** 6.2.0 - Build tool and dev server
- **React Router** 6.20.0 - Client-side routing (hash-based)

### Styling
- **Tailwind CSS** - Utility-first CSS (CDN-based)
- **Dark Theme**: `gray-950` background, `lime-500` accent
- **Font**: Inter (Google Fonts)

### State Management
- **React Context API** - Global state (AuthContext)
- **Custom Hooks** - Feature-specific state
- No Redux/Zustand - pure React patterns

### Backend (Firebase)
- **Firestore** - NoSQL database
- **Firebase Auth** - Email/password authentication
- **Firebase Functions** - Server-side logic
- **Firebase Storage** - File uploads

### External Integrations
- **Stripe Connect** - Payment processing (@stripe/stripe-js)
- **DUPR API** - Player ratings lookup and sync
- **SMSGlobal** - SMS notifications (court assignments, match results)
- **Google Gemini** - AI features
- **Leaflet** - Maps for venue locations

### Additional Libraries
- **@dnd-kit** - Drag and drop (core, sortable)
- **PapaParse** - CSV parsing (CDN)

---

## Project Structure

```
pickleball-app/
├── components/           # React UI components (feature-based)
│   ├── admin/            # Admin dashboard, user management
│   ├── auth/             # Login, signup, password reset
│   ├── checkout/         # Payment flows, wallet, receipts
│   ├── clubs/            # Club management, courts, bookings
│   ├── dupr/             # DUPR integration components
│   ├── home/             # Home page components
│   ├── icons/            # SVG icon components
│   ├── layouts/          # AppLayout, page layouts
│   ├── leagues/          # League creation, standings, matches
│   ├── meetups/          # Meetup discovery, RSVPs, scoring
│   ├── payments/         # Payment and Stripe components
│   ├── profile/          # User profile, settings
│   ├── registration/     # Event registration wizard
│   ├── results/          # Event results display
│   ├── scoring/          # Live scoring components
│   ├── shared/           # Reusable UI components
│   ├── sms/              # SMS credits, notifications
│   ├── social/           # Social features
│   └── tournament/       # Tournament creation, management
│       ├── planner/      # Capacity planning wizard
│       ├── scheduleBuilder/  # Match scheduling
│       └── hooks/        # Tournament-specific hooks
│
├── contexts/             # React Context providers
│   └── AuthContext.tsx   # Authentication state
│
├── hooks/                # Custom React hooks
│   ├── payments/         # usePayment, usePricing, useWallet
│   ├── useCheckout.ts
│   └── usePartnerInvites.ts
│
├── pages/                # Page-level components
│   └── [Feature]Page.tsx
│
├── router/               # React Router configuration
│   └── index.tsx         # Route definitions
│
├── services/             # Business logic & API layer
│   ├── dupr/             # DUPR integration
│   ├── firebase/         # Firestore CRUD operations
│   │   ├── accounting/   # Reports, receipts
│   │   ├── payments/     # Stripe, wallets, transactions
│   │   ├── tournaments.ts
│   │   ├── leagues.ts
│   │   ├── teams.ts
│   │   ├── matches.ts
│   │   ├── clubs.ts
│   │   └── users.ts
│   ├── formats/          # Competition format generators
│   │   ├── poolPlayMedals.ts
│   │   ├── elimination.ts
│   │   ├── roundRobin.ts
│   │   ├── swiss.ts
│   │   ├── ladder.ts
│   │   └── kingOfCourt.ts
│   └── game/             # Scoring logic
│       └── scoreValidation.ts
│
├── types/                # TypeScript definitions
│   ├── formats/          # Format-specific types
│   ├── game/             # Game, match, score types
│   └── index.ts          # Re-exports
│
├── utils/                # Shared utility functions
│   └── timeFormat.ts     # Time formatting (12-hour display standard)
│
├── config/               # Feature flags, app config
├── constants/            # App constants
├── functions/            # Firebase Cloud Functions (server-side)
├── tests/                # Unit tests
│
├── App.tsx               # Root component
├── index.tsx             # React entry point
├── types.ts              # Main type definitions
├── vite.config.ts        # Vite configuration
└── index.html            # HTML entry with CDN imports
```

---

## Commands

```bash
# Development
npm run dev          # Start dev server on port 3000

# Build
npm run build        # Production build to dist/

# Type Checking
npm run typecheck    # Run tsc --noEmit

# Preview
npm run preview      # Preview production build

# Local Testing (Emulators)
cd functions && npm run emulators    # Start Firebase emulators
cd functions && npm run seed         # Seed emulator with test data
```

---

## Deployment Safety Rules (CRITICAL)

**Claude MUST follow these rules before ANY deployment:**

### Why This Matters - READ THIS FIRST

There are TWO Firebase projects:
- `pickleball-app-test` = Test site (for testing, safe to break)
- `pickleball-app-dev` = **PRODUCTION** site (real users, real money)

**PROBLEM WE SOLVED:** Vite loads `.env.production` for ALL builds, which previously contained production config. This caused test deployments to accidentally connect to production Firebase, corrupting real user data.

**SOLUTION:** We flipped the defaults:
- `.env.production` now contains TEST config (safe default)
- `.env.productionsite` contains PRODUCTION config (only used explicitly)
- Deploy scripts verify the correct project ID is in the bundle BEFORE deploying

**NEVER run manual `npm run build && firebase deploy` commands.** Always use the deploy scripts.

### Pre-Deployment Checklist
1. **NEVER deploy without explicit user approval** - Always ask "Should I deploy now?" and wait for confirmation
2. **ALWAYS use deploy scripts** - `bash deploy-test.sh` or `bash deploy-prod.sh`
3. **NEVER run manual firebase deploy commands** - The scripts handle env switching and verification
4. **ALWAYS run functions build** - `cd functions && npm run build` must succeed
5. **NEVER deploy if there are TypeScript errors**
6. **NEVER deploy untested code** - User must confirm testing is complete

### Deployment Commands - TEST vs PRODUCTION

**DEFAULT = TEST SITE.** Production requires explicit action.

| File | Contains | Purpose |
|------|----------|---------|
| `.env.production` | `pickleball-app-test` | Default for all builds (safe) |
| `.env.productionsite` | `pickleball-app-dev` | Production config (used only by deploy-prod.sh) |

#### Deploy to TEST (default, safe)
```bash
bash deploy-test.sh
```

#### Deploy to PRODUCTION (requires typing "production" to confirm)
```bash
bash deploy-prod.sh
```

#### Functions Deployment
```bash
cd functions && firebase use test && npm run deploy   # Test
cd functions && firebase use prod && npm run deploy   # Production
```

**IMPORTANT: Always use the deploy scripts.** They verify the correct project ID is in the build before deploying.

#### Firebase Project Aliases (in .firebaserc)
| Alias | Project ID | Purpose |
|-------|-----------|---------|
| `test` / `default` | `pickleball-app-test` | Test environment |
| `prod` | `pickleball-app-dev` | Production (live site) |

### Rollback Plan
If something breaks after deployment:
1. Check Firebase Functions logs: `cd functions && npm run logs`
2. Previous function versions can be restored in Firebase Console
3. Hosting can be rolled back in Firebase Console → Hosting → Release History

### Environment Checklist
- [ ] `.env` has `VITE_USE_EMULATORS` removed or set to `false`
- [ ] `functions/.runtimeconfig.json` is NOT committed (gitignored)
- [ ] All sensitive keys are in Firebase Functions config, not in code
- [ ] Verify correct project before deploy: `firebase use` shows expected alias

---

## Code Conventions

### File Naming
- **Components**: `PascalCase.tsx` (e.g., `CreateTournament.tsx`, `Header.tsx`)
- **Services**: `camelCase.ts` (e.g., `duprService.ts`, `courtAllocator.ts`)
- **Hooks**: `useCamelCase.ts` (e.g., `useCheckout.ts`, `usePartnerInvites.ts`)
- **Types**: `camelCase.ts` or `PascalCase.ts` in `/types`

### Component Patterns
- Functional components only (no class components)
- Props interfaces defined at top of file
- Hooks for state: `useState`, `useEffect`, `useContext`, `useCallback`
- Custom hooks for reusable logic

### Import Organization
```typescript
// 1. React imports
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { useNavigate } from 'react-router-dom';

// 3. Internal services/types
import { getTournaments } from '../services/firebase/tournaments';
import { Tournament } from '../types';

// 4. Local components
import { Header } from './Header';
```

### Export Patterns
- Barrel exports via `index.ts` in feature directories
- Named exports preferred over default exports
- Example: `export { CheckoutModal, PaymentForm } from './checkout';`

### TypeScript Conventions
- Interfaces for object shapes
- Union types for enums: `type UserRole = 'player' | 'organizer' | 'app_admin'`
- Strict mode enabled
- Path alias: `@/*` resolves to project root

### Time Format Standard
- **Storage**: 24-hour format (e.g., `"08:00"`, `"14:30"`)
- **Display**: 12-hour format with AM/PM (e.g., `"8:00 AM"`, `"2:30 PM"`)
- **Utility**: Use `utils/timeFormat.ts` for all time formatting
- **Components**: Use `ScrollTimePicker` for time input fields

```typescript
// Import time utilities
import { formatTime, formatTimeRange, formatTimestamp } from '../utils/timeFormat';

// Format "14:30" -> "2:30 PM"
formatTime('14:30')

// Format time range
formatTimeRange('08:00', '17:00')  // "8:00 AM - 5:00 PM"

// Format timestamp (milliseconds)
formatTimestamp(1703750400000)  // "8:00 AM"
```

### ScrollTimePicker Component
**ALWAYS use `ScrollTimePicker` for time input fields.** Never use `<input type="time">`.

```typescript
import { ScrollTimePicker } from '../shared/ScrollTimePicker';

// Usage
<ScrollTimePicker
  value={startTime}        // "HH:MM" 24-hour format (e.g., "18:00")
  onChange={setStartTime}  // Receives "HH:MM" 24-hour format
  label="Start Time"
/>
```

**Features:**
- Plus/minus buttons for 15-minute increments
- Displays time in 12-hour format (e.g., "6:00 PM")
- Stores/returns 24-hour format for consistency
- Dark theme styling (gray-800, lime-500 accent)
- Mobile-friendly touch targets

### Price Input Pattern
**Use plus/minus button controls for price inputs** instead of `<input type="number">`.

```tsx
// Price picker with $0.50 increments
<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => {
      const current = parseFloat(price) || 1;
      const newAmount = Math.max(1, current - 0.5);
      setPrice(newAmount.toFixed(2));
    }}
    className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
  >
    −
  </button>
  <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
    <span className="text-lime-400 text-xl font-bold font-mono">
      ${parseFloat(price).toFixed(2)}
    </span>
  </div>
  <button
    type="button"
    onClick={() => {
      const current = parseFloat(price) || 1;
      const newAmount = Math.min(100, current + 0.5);
      setPrice(newAmount.toFixed(2));
    }}
    className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
  >
    +
  </button>
</div>
```

**Guidelines:**
- Use $0.50 increments (configurable based on context)
- Minimum $1.00, Maximum $100.00 (adjust as needed)
- Display with 2 decimal places (e.g., "$15.00")
- Use lime-400 for the displayed amount
- Dark theme styling consistent with ScrollTimePicker

### Commit Message Format
```
VXX.XX Feature Name - Description

- Bullet point details
- Additional changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### JSDoc Conventions
Components include header comments:
```typescript
/**
 * ComponentName - Brief description
 *
 * Key features:
 * - Feature 1
 * - Feature 2
 *
 * @version 06.03
 * @file components/feature/ComponentName.tsx
 */
```

---

## Key Files Reference

### Entry Points
- `index.html` - HTML entry with CDN imports (Tailwind, Firebase, React)
- `index.tsx` - React entry, renders App with AuthProvider
- `App.tsx` - Root component, sets up Router

### Routing
- `router/index.tsx` - All route definitions
- Hash-based routing for Firebase/AI Studio compatibility

### Authentication
- `contexts/AuthContext.tsx` - Auth state, user profile, login/logout
- `services/firebase/users.ts` - User CRUD operations

### Type Definitions
- `types.ts` - Main domain types (Tournament, League, Club, etc.)
- `types/game/` - GameSettings, Match, GameScore
- `types/formats/` - CompetitionFormat, format-specific settings

### Core Services
- `services/firebase/tournaments.ts` - Tournament CRUD
- `services/firebase/leagues.ts` - League CRUD
- `services/firebase/matches.ts` - Match operations
- `services/firebase/teams.ts` - Team management

### Shared Components
- `components/shared/FormatSelector.tsx` - Format selection UI
- `components/shared/GameSettingsForm.tsx` - Game rules configuration
- `components/shared/ScoreEntryModal.tsx` - Universal score entry

---

## Domain Model

### User System
- **UserProfile**: Player data, DUPR rating, location, skill level
- **UserRole**: `'player'` | `'organizer'` | `'app_admin'`
- DUPR integration for verified ratings

### Competition Formats (10 total)
| Format | Description |
|--------|-------------|
| `pool_play_medals` | Pool stage → single elimination bracket with medals |
| `round_robin` | Everyone plays everyone |
| `singles_elimination` | Single-elimination bracket |
| `doubles_elimination` | Double-elimination bracket |
| `swiss` | Swiss system pairing by record |
| `ladder` | Ranking ladder with challenges |
| `king_of_court` | Winners stay, challengers rotate |
| `rotating_doubles_box` | Small groups, rotating partners |
| `fixed_doubles_box` | Small groups, fixed teams |
| `team_league_interclub` | Club vs club team matches |

### Tournament Structure
- **Tournament**: Main event container
- **Division**: Skill/gender/age groupings
- **Team**: Players grouped for competition
- **Match**: Individual games with scores and scheduling
- **StandingsEntry**: Rankings within a division

### League Formats (4 primary)
- **Ladder**: Challenge-based ranking with rank ranges
- **Round Robin**: Everyone plays everyone, optional pools
- **Swiss**: Paired by similar records each round
- **Box League**: Multiple boxes with promotion/relegation

### League Entities
- **League**: Container with format, settings, schedule
- **LeagueMember**: Player with stats, ranking, partner info
- **LeagueMatch**: Match with verification status
- **LeagueChallenge**: Ladder challenges between players

### Club System
- **Club**: Organization with courts, members, settings
- **ClubMember**: Member with role (owner, admin, member)
- **ClubCourt**: Court definition with surface, hourly rate
- **CourtBooking**: Reservation for specific court/time

### Meetups
- **Meetup**: Casual or competitive social event
- **MeetupRSVP**: Player attendance with payment status
- **MeetupCompetitionType**: casual, round_robin, elimination, etc.

### Scoring System
- **GameScore**: Individual game result (scoreA, scoreB)
- **GameSettings**: Points per game (11/15/21), win by (1/2), best of (1/3/5)
- **ScoreVerificationSettings**: Confirmation/dispute workflow
- **MatchVerificationData**: Dispute tracking and resolution

### Unified Match Format (CRITICAL)

**The `Match` interface in `types/game/match.ts` is THE standard for ALL matches across tournaments, leagues, and meetups.**

```typescript
// Canonical Match structure - USE THIS for all new code
interface Match {
  id: string;
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  format: CompetitionFormat;

  // Participants - ALWAYS use sideA/sideB
  sideA: MatchParticipant;  // { id, name, playerIds, duprRating? }
  sideB: MatchParticipant;

  // Scores - ALWAYS use scores array
  scores: GameScore[];      // { gameNumber, scoreA, scoreB }[]

  // Winner - ALWAYS use winnerId
  winnerId?: string;

  // Status, scheduling, etc.
  status: MatchStatus;
  roundNumber?: number;
  court?: string;
  // ... other fields
}
```

**DO NOT USE legacy fields** (these exist only for backwards compatibility):
- `teamAId`/`teamBId` → Use `sideA.id`/`sideB.id`
- `team1Id`/`team2Id` → Use `sideA.id`/`sideB.id`
- `scoreTeamAGames`/`scoreTeamBGames` → Use `scores[]`
- `winnerTeamId` → Use `winnerId`

**Helper functions** (from `types/game/match.ts`):
- `isParticipant(match, userId)` - Check if user is in match
- `getUserSide(match, userId)` - Get which side user is on
- `isMatchCompleted(match)` - Check if match is done
- `hasWinner(match)` - Check if match has a winner

---

## Services Architecture

### Firebase Services (`services/firebase/`)
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

### Format Generators (`services/formats/`)
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

### Game Services (`services/game/`)
- `scoreValidation.ts` - Validate scores against game settings
- Helpers: `isMatchComplete()`, `formatMatchScore()`, `calculateMatchWinner()`

### Payment Services (`services/firebase/payments/`)
- `stripe.ts` - Stripe API integration
- `wallet.ts` - User wallet/balance system
- `transactions.ts` - Transaction history
- `annualPass.ts` - Annual pass management

---

## Refund System Architecture

### Overview

Refunds use Stripe Direct Charges with the `stripeAccount` header. This ensures refunds are processed from the connected account (organizer), not the platform.

### Key Files

| File | Purpose |
|------|---------|
| `functions/src/stripe.ts` | `stripe_createRefund` function + `handleChargeRefunded` webhook |
| `components/clubs/TransactionDetailDrawer.tsx` | UI for issuing refunds |
| `components/clubs/FinanceTab.tsx` | Finance tab showing transactions + refunds |
| `services/firebase/payments/finance.ts` | Queries transactions by `organizerUserId` |

### Critical Field: organizerUserId

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

### Refund Transaction Creation Points

There are TWO places where refund transactions are created:

1. **`stripe_createRefund`** (line ~2378) - App-initiated refunds
   ```typescript
   organizerUserId: tx.organizerUserId || '',
   ```

2. **`handleChargeRefunded`** (line ~1704) - External refunds from Stripe Dashboard
   ```typescript
   organizerUserId: original.organizerUserId || '',
   ```

**BOTH locations must include `organizerUserId` or refunds will be invisible to organizers.**

### Refund Amount Calculation

For Direct Charges, the refund amount calculation uses:
```typescript
const refundAmount = tx.amount - (tx.platformFeeAmount || 0);
```

This refunds the NET amount (what organizer received), not the GROSS amount (what customer paid). The platform fee is NOT refunded automatically - Stripe handles application_fee refunds separately.

### Transaction Status Flow

```
Payment: pending → completed
Refund (app): processing → completed (via webhook)
Refund (external): created as completed directly
```

### Firestore Indexes Required

The Finance tab requires composite indexes on the `transactions` collection:
- `organizerUserId` + `referenceType` + `createdAt`
- `organizerUserId` + `type` + `referenceType` + `createdAt`
- `organizerUserId` + `type` + `status` + `createdAt`

### Firestore Rules

Organizers can read their own transactions:
```javascript
resource.data.organizerUserId != null &&
resource.data.organizerUserId == request.auth.uid
```

### Debugging Refund Issues

1. **Refund not appearing in Finance tab?**
   - Check Firestore: Does the refund transaction have `organizerUserId`?
   - Check indexes: Are all required composite indexes enabled?

2. **Refund amount wrong?**
   - Verify using `tx.amount - tx.platformFeeAmount` (not just `tx.amount`)
   - Direct Charges refund from connected account, not platform

3. **No success notification?**
   - Check `TransactionDetailDrawer.tsx` has alert after `createRefund` call

---

## Environment Variables

Create a `.env` file with:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_key

# Google Gemini AI
VITE_GEMINI_API_KEY=your_gemini_key
```

---

## Recent Development

### Current Version: 07.24

### Recent Major Features (V07.00+)
- **DUPR Integration** (V07.23-07.24) - Match submission, SSO login, rating sync
- **SMS Credits System** (V07.22) - Bundle purchases, credit management
- **SMSGlobal Migration** (V07.19) - Migrated from Twilio to SMSGlobal
- **League Communications** (V07.17) - In-app messaging for leagues
- **Organizer Agreements** - Terms acceptance for organizers
- **Registration Blocking** - DUPR ID requirement enforcement

### Previous Major Features (V06.00+)
- **Phone Verification** - OTP-based phone verification for SMS notifications
- **Unified Game & Format System** - Standardized 10 competition formats
- **Tournament Planner** - Capacity planning wizard with age/skill requirements
- **Pool Play → Medals** - Two-stage tournament format
- **Dynamic Court Allocation** - Real-time queue with 8-min rest, load balancing

### Version Naming
- Format: `VXX.XX` (e.g., V07.24)
- Major: Breaking changes or large features
- Minor: Feature additions and improvements

---

## Firestore Collections

```
users/              # User profiles
clubs/              # Club data
  └── members/      # Club members (subcollection)
tournaments/        # Tournament definitions
  └── divisions/    # Tournament divisions (subcollection)
leagues/            # League data
  └── members/      # League members (subcollection)
  └── matches/      # League matches (subcollection)
meetups/            # Meetup events
registrations/      # Event registrations
matches/            # Match data
teams/              # Team groupings
scores/             # Live scores
courtBookings/      # Court reservations
phone_verification_codes/  # OTP codes for phone verification
sms_messages/       # SMS messages queue (SMSGlobal)
sms_credits/        # SMS credit balances and transactions
```

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

### Score Verification
1. Player submits score
2. Opponent confirms or disputes
3. Organizer resolves disputes
4. Standings update after verification

### Drag and Drop
- Uses @dnd-kit for accessible drag-drop
- Tournament bracket reordering
- Player seeding management
- Box league player movement

---

## Dynamic Court Allocation System

### Overview

The court allocation system dynamically assigns matches to courts during live tournament play. It ensures fair play, prevents conflicts, and optimizes court usage.

**Key File:** `components/tournament/hooks/useCourtManagement.ts`

### Core Requirements

#### 1. Player Rest Time (8-Minute Minimum)
- Players MUST have at least 8 minutes rest between matches
- System tracks `completedAt` timestamp on each match
- Queue excludes matches where any player hasn't rested enough
- Rest time is configurable (default: 8 minutes)

#### 2. No Double-Booking
- A team/player can only be on ONE court at a time
- System tracks busy teams by:
  - Team ID (`sideA.id`, `sideB.id`)
  - Team Name (case-insensitive, for pool play)
  - Player IDs (`sideA.playerIds`, `sideB.playerIds`)
- Matches with busy teams are excluded from queue

#### 3. Fair Distribution (Load Balancing)
- Teams with fewer completed matches get priority
- Prevents scenario where some teams play 5 matches while others have played 2
- Queue sorts by: play count (ascending) → round number → match number

#### 4. Pool Balance
- Pools that are behind in progress get priority
- Prevents one pool from finishing while another hasn't started
- Calculated as: `(completed matches / total matches)` per pool
- Lower completion rate = higher priority

#### 5. Flexible Round Order
- Rounds don't have to complete in strict order
- If Round 1 matches are blocked (rest time, busy teams), Round 2 matches can play
- Priority still given to earlier rounds when possible

#### 6. Dynamic Recalculation
- Queue recalculates FRESH when:
  - A match completes (court becomes free)
  - A match is assigned to a court
  - Manual refresh is triggered
- NOT a static `useMemo` - must respond to real-time events

### Queue Scoring Algorithm

Each eligible match gets a score (lower = higher priority):

```typescript
score = 0;

// Factor 1: Teams with fewer games played get priority
score += (teamAPlayCount + teamBPlayCount) * 10;

// Factor 2: Pools behind schedule get priority
score += poolCompletionRate * 50;

// Factor 3: Players needing rest get penalty
if (anyPlayerNeedsRest) score += 500;

// Factor 4: Earlier rounds preferred
score += roundNumber * 5;
```

### Match Eligibility Rules

A match is **eligible** for court assignment if:

1. Status is NOT `completed` or `in_progress`
2. No court currently assigned (`court` is null/empty)
3. Neither team is currently on another court
4. Neither team name is on another court (pool play check)
5. No player ID is on another court
6. All players have had 8+ minutes rest since last match
7. Match is NOT a self-match (team vs itself - data corruption check)

### Data Requirements

For the system to work correctly, matches MUST have:

```typescript
interface Match {
  // Required for queue
  id: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  court?: string;           // null when waiting

  // Required for team tracking
  sideA: {
    id: string;             // Team ID
    name: string;           // Team name (for pool play)
    playerIds: string[];    // Individual player IDs
  };
  sideB: { /* same */ };

  // Required for rest time
  completedAt?: number;     // Timestamp when match finished

  // Required for fair distribution
  roundNumber?: number;
  poolGroup?: string;       // e.g., "Pool A"

  // Required for standings
  winnerId?: string;
  scores: GameScore[];      // { scoreA, scoreB }[]
}
```

### Winner Determination (Multi-Game Matches)

For best-of-3 or best-of-5 matches:

```typescript
// Count GAMES WON, not points
let gamesWonA = 0, gamesWonB = 0;
match.scores.forEach(game => {
  if (game.scoreA > game.scoreB) gamesWonA++;
  else if (game.scoreB > game.scoreA) gamesWonB++;
});
const winnerId = gamesWonA > gamesWonB ? sideA.id : sideB.id;
```

**DO NOT** use first game score only - this causes incorrect standings.

### Score Storage (Dual Format)

When completing a match, store BOTH formats for compatibility:

```typescript
// Modern format (USE THIS)
scores: [
  { gameNumber: 1, scoreA: 11, scoreB: 9 },
  { gameNumber: 2, scoreA: 5, scoreB: 11 },
  { gameNumber: 3, scoreA: 11, scoreB: 8 }
]

// Legacy format (keep for backwards compat)
scoreTeamAGames: [11, 5, 11]
scoreTeamBGames: [9, 11, 8]
```

### Auto-Assignment Flow

When `autoAssignFreeCourts()` is called:

1. Get fresh list of eligible matches (recalculate, don't cache)
2. Get list of free courts (no active match)
3. For each free court:
   - Find highest-priority eligible match
   - Check no conflict with already-assigned matches in this batch
   - Assign match to court, set status to `scheduled`
   - Mark team/players as assigned (prevent double-booking in batch)
4. Optionally send notifications to players

### Testing the System

Use Test Mode (`TestModePanel.tsx`) to:
- Seed division with 4/8/16 test teams
- Generate round-robin matches
- Simulate match completions with random scores
- Delete corrupted self-matches (data cleanup)
- Clear all test data

### Known Issues & Protections

1. **Self-Matches**: Matches where `sideA.id === sideB.id` or names match
   - Blocked from queue with console error
   - Use "Delete Corrupted" button to clean up

2. **Legacy Data**: Old matches may lack `scores[]` array
   - Display falls back to `scoreTeamAGames`/`scoreTeamBGames`
   - New completions write both formats

3. **Missing Player IDs**: Some matches may have empty `playerIds`
   - System falls back to team ID matching
   - Team IDs added to busyPlayers set as backup

---

## DUPR Integration

### Overview

DUPR (Dynamic Universal Pickleball Rating) integration enables automatic match submission for rating updates. All DUPR API calls go through Cloud Functions (server-side only).

### Architecture

```
Browser → httpsCallable('dupr_submitMatches') → Cloud Function → DUPR API
```

- **Server-side only** - Never call DUPR API from the browser
- **Organizer-controlled** - Only organizers can trigger submissions
- **Compliance model** - Anti-self-reporting, organizer verification required

### Key Files

| File | Purpose |
|------|---------|
| `functions/src/dupr.ts` | Cloud Functions for DUPR API (SERVER ONLY) |
| `services/firebase/duprScoring.ts` | Client service (calls Cloud Functions) |
| `services/dupr/index.ts` | DUPR config, token management |
| `components/profile/DuprConnect.tsx` | SSO login component |
| `components/shared/DuprControlPanel.tsx` | Organizer submission UI |

### API Environments

| Environment | Base URL |
|-------------|----------|
| UAT | `https://uat.mydupr.com/api` |
| Production | `https://prod.mydupr.com/api` |

### Match Eligibility Rules

A match can be submitted to DUPR if:
- Status is `completed`
- Has `officialResult` (organizer-finalized)
- All players have linked DUPR IDs
- At least one team scored 6+ points
- No tied games (scoreA !== scoreB for all games)
- Not already submitted (`duprSubmitted !== true`)

### Submission Flow

1. Match finalized by organizer → `officialResult` created
2. Organizer clicks "Submit to DUPR" in control panel
3. Cloud Function builds payload with deterministic identifier
4. DUPR API called server-side
5. Match marked `duprSubmitted: true` on success

### Payload Format

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

### Critical Rules

1. **Identifier must be deterministic** - Same match = same identifier for retries
2. **teamA and teamB must have same game fields** (game1, game2, etc.)
3. **No tied games** - scoreA !== scoreB for all games
4. **Import correctly**: `import { httpsCallable } from '@firebase/functions'` (NOT `firebase/functions`)
5. **Handle "already exists" as success** - DUPR rejects duplicates with this error
6. **Doubles validation**: Determine by PLAYER count, not DUPR ID count

### Compliance Summary

| Rule | Implementation |
|------|----------------|
| Player scores are proposals only | `scoreState: 'proposed'` |
| Only organisers finalise | `finalisedByUserId` must be organiser |
| Only official results to DUPR | Check `officialResult` exists before submission |
| Server-side execution | Cloud Functions only, not client-side |

### Score Lifecycle

```
none → proposed → signed → official → submittedToDupr
                ↘ disputed ↗
```

**Only `official` results affect standings/brackets and can be submitted to DUPR.**

### Debugging Checklist

1. **Check Cloud Function logs**: `firebase functions:log --only dupr_submitMatches`
2. **Use test function**: Click "Test" button on a single match in DUPR panel
3. **Verify credentials**: `firebase functions:config:get` shows `dupr.client_key` and `dupr.client_secret`
4. **Check for duplicates**: "Already exists" means match was previously submitted

### Webhook Integration (V07.25)

Real-time rating updates via DUPR webhooks. Complements the daily `dupr_syncRatings` cron job.

#### Architecture

```
DUPR Server → POST /api/dupr/webhook → Firebase Hosting → duprWebhook Cloud Function
                                                              ↓
                                                     duprWebhookEvents/{id}
                                                              ↓
                                                     users/{uid} profile update
```

#### Webhook Functions

| Function | Type | Purpose |
|----------|------|---------|
| `duprWebhook` | HTTP (`onRequest`) | Receives webhook events from DUPR |
| `dupr_subscribeToRatings` | Callable | Subscribe specific users to notifications |
| `dupr_subscribeAllUsers` | Callable | Bulk subscribe all users with DUPR IDs (admin) |
| `dupr_getSubscriptions` | Callable | List current subscriptions |
| `dupr_onUserDuprLinked` | Firestore trigger | Auto-subscribe when user links DUPR |

#### Subscription API Format

**CRITICAL**: The DUPR subscribe API expects the body as a raw array, NOT wrapped in an object:

```typescript
// CORRECT - just the array
body: JSON.stringify(["GGEGNM"])

// WRONG - don't wrap in object
body: JSON.stringify({ duprIds: ["GGEGNM"] })
```

Subscribe one user at a time (no batch support).

#### Webhook Event Format

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

#### Key Implementation Details

1. **Dedupe**: SHA-256 hash of payload fields prevents duplicate processing
2. **Always return 200**: Never let processing errors cause DUPR retries
3. **duprLastSyncAt must be number**: Use `Date.now()` not Firestore Timestamp (for rate limiting compatibility)
4. **Auto-subscribe**: `dupr_onUserDuprLinked` trigger subscribes users when they link DUPR account
5. **Webhook URL**: `/api/dupr/webhook` (Firebase Hosting rewrite BEFORE catch-all)

#### Firestore Collections

- `duprWebhookEvents/{dedupeKey}` - Raw events for auditing
- `duprPlayers/{duprId}` - Rating snapshots by DUPR ID
- `users/{uid}` - Updated with `duprLastSyncSource: 'webhook'`

#### User Fields Updated by Webhook

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

---

## Phone Verification System

### Overview

SMS-based phone number verification using OTP codes. Players can verify their phone numbers to receive SMS notifications for court assignments, match results, and other alerts.

### How It Works

1. **Signup Flow**: Phone field shown during signup (optional, no blocking)
2. **Verification Modal**: After signup with phone, prompts for verification (skippable)
3. **Profile Page**: Can add/verify phone later from Profile
4. **SMS Notifications**: Requires verified phone to enable SMS preferences

### Key Components

| File | Purpose |
|------|---------|
| `functions/src/phoneVerification.ts` | Cloud Functions for OTP send/verify |
| `services/firebase/phoneVerification.ts` | Frontend service wrapper |
| `components/auth/PhoneVerificationModal.tsx` | Two-step verification modal |
| `components/shared/PhoneInput.tsx` | Country code selector with auto-formatting |

### Cloud Functions

**`phone_sendVerificationCode`**
- Generates 6-digit OTP code
- Stores hashed code in `phone_verification_codes` collection
- Sends SMS via SMSGlobal (writes to `sms_messages` collection)
- Rate limits: 3 codes/phone/hour, 10 codes/user/day
- Code expires in 10 minutes

**`phone_verifyCode`**
- Validates OTP against stored hash
- Max 3 attempts per code
- On success: Sets `phoneVerified: true` on user profile
- Returns remaining attempts on failure

### PhoneInput Component

Reusable component with country code selector:
- **NZ** (+64) - Default
- **AU** (+61)
- **US** (+1)
- **UK** (+44)

Auto-formats numbers as user types, outputs E.164 format.

```typescript
<PhoneInput
  value={phone}
  onChange={(e164Value) => setPhone(e164Value)}
  defaultCountry="NZ"
/>
```

### Firestore Indexes Required

The `phone_verification_codes` collection requires 3 composite indexes:

1. `phone` (Asc) + `createdAt` (Asc) - Rate limiting per phone
2. `userId` (Asc) + `createdAt` (Asc) - Daily rate limiting per user
3. `phone` (Asc) + `userId` (Asc) + `verified` (Asc) + `expiresAt` (Desc) - Verify query

### User Profile Fields

```typescript
interface UserProfile {
  phone?: string;           // E.164 format (+64211234567)
  phoneVerified?: boolean;  // Verification status
  phoneVerifiedAt?: number; // Timestamp when verified
}
```

### Security

- OTP codes hashed with SHA-256 before storage
- 10-minute expiry on codes
- Max 3 verification attempts per code
- Rate limiting prevents brute force
- Firestore rules: `phone_verification_codes` only accessible via Cloud Functions
