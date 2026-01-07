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
- **Twilio** - SMS notifications (court assignments, match results)
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
│   ├── icons/            # SVG icon components
│   ├── layouts/          # AppLayout, page layouts
│   ├── leagues/          # League creation, standings, matches
│   ├── meetups/          # Meetup discovery, RSVPs, scoring
│   ├── scoring/          # Live scoring components
│   ├── shared/           # Reusable UI (FormatSelector, GameSettingsForm, etc.)
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
```

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
- **Components**: Use `RollingTimePicker` for time input fields

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

### Current Version: 06.18
- **Phone Verification System** - SMS-based phone verification with OTP codes
- **PhoneInput Component** - Country code selector (NZ, AU, US, UK) with auto-formatting

### Recent Major Features (v06.00+)
- **Phone Verification** - OTP-based phone verification for SMS notifications
- **Unified Game & Format System** - Standardized 10 competition formats
- **Tournament Planner** - Capacity planning wizard with age/skill requirements
- **Schedule Builder** - Automated match scheduling with conflict detection
- **Pool Play → Medals** - Two-stage tournament format
- **Dynamic Court Allocation** - Real-time queue with 8-min rest, load balancing
- **FormatCards UI** - Unified format selection component

### Version Naming
- Format: `VXX.XX` (e.g., V06.03)
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
sms_messages/       # SMS messages queue (Twilio integration)
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

## DUPR Integration (V07.23)

### Overview

DUPR (Dynamic Universal Pickleball Rating) integration enables automatic match submission for rating updates.

**IMPORTANT FOR FUTURE CLAUDE SESSIONS**: This section documents the DUPR submission pattern that MUST be followed for ALL event types (tournaments, leagues, meetups). Read this entire section before implementing any DUPR-related features.

### Official Documentation

| Resource | URL |
|----------|-----|
| RaaS API Docs | https://dupr.gitbook.io/dupr-raas |
| Quick Start | https://dupr.gitbook.io/dupr-raas/quick-start-and-token-generation |
| Swagger UAT | https://uat.mydupr.com/api/swagger-ui/index.html |
| Swagger Prod | https://prod.mydupr.com/api/swagger-ui/index.html |
| Developer FAQ | https://dupr.gitbook.io/dupr-raas/developer-faq |

### API Environments

| Environment | Base URL | Login URL |
|-------------|----------|-----------|
| UAT | `https://uat.mydupr.com/api` | `https://uat.dupr.gg/login-external-app` |
| Production | `https://prod.mydupr.com/api` | `https://dashboard.dupr.com/login-external-app` |

### API Endpoints (v1.0)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/v1.0/token` | Generate bearer token |
| POST | `/match/v1.0/create` | Submit single match |
| POST | `/match/v1.0/batch` | Bulk match submission |
| POST | `/match/v1.0/update` | Update existing match |
| DELETE | `/match/v1.0/delete` | Delete match |
| GET | `/user/v1.0/{duprId}` | Get user by DUPR ID |
| GET | `/user/v1.0/{duprId}/clubs` | Get user's club memberships |
| POST | `/v1.0/webhook` | Register webhook |

### Authentication Flow

```
1. Base64 encode: clientKey:clientSecret
2. POST to /auth/v1.0/token with x-authorization header
3. Receive bearer token (valid 1 hour, cached 55 min)
4. Use bearer token for all subsequent API calls
```

### Key Files

| File | Purpose |
|------|---------|
| `services/dupr/index.ts` | Core DUPR service, API calls, token management |
| `services/dupr/matchSubmission.ts` | Convert app matches to DUPR format |
| `components/shared/DuprSubmitButton.tsx` | UI button for manual submission |
| `components/profile/DuprConnect.tsx` | SSO login iframe component |

---

### UNIVERSAL DUPR SUBMISSION PATTERN

**CRITICAL**: Follow this pattern for ALL event types (tournaments, leagues, meetups). This ensures consistent, error-free DUPR submissions.

#### Step 1: Gather Required Data

```typescript
// 1. Match data (from any event type)
const match = await getMatch(matchId); // Must have status: 'completed'

// 2. Player profiles with DUPR IDs
const players: SubmissionPlayers = {
  userA: await getUserProfile(match.sideA.playerIds[0]),
  userB: await getUserProfile(match.sideB.playerIds[0]),
  partnerA: match.isDoubles ? await getUserProfile(match.sideA.playerIds[1]) : undefined,
  partnerB: match.isDoubles ? await getUserProfile(match.sideB.playerIds[1]) : undefined,
};

// 3. Submission options
const options: SubmissionOptions = {
  eventType: 'tournament' | 'league' | 'meetup',
  eventId: 'firestore-event-id',
  matchId: match.id,
  eventName: 'Wellington Open 2025',
  location: 'Wellington, NZ',
  clubId: undefined, // Optional DUPR club ID
};
```

#### Step 2: Validate Eligibility

```typescript
import { isDuprEligible } from './services/dupr/matchSubmission';

const eligibility = isDuprEligible(match, players);
if (!eligibility.eligible) {
  console.error('Not eligible:', eligibility.reason);
  return;
}
```

#### Step 3: Build Submission Payload

```typescript
import { buildDuprMatchSubmission } from './services/dupr/matchSubmission';

const submission = buildDuprMatchSubmission(match, players, options);
// Returns DuprMatchSubmission with:
// - identifier: "tournament_abc123_match456" (unique per match)
// - matchSource: "PARTNER" (or "CLUB" if clubId provided)
// - matchType: "SINGLES" or "DOUBLES"
// - team1/team2 with DUPR IDs
// - games array with scores
```

#### Step 4: Submit to DUPR

```typescript
import { submitMatchToDupr } from './services/dupr';

const result = await submitMatchToDupr('', submission);
// Returns: { matchId, status, createdAt }
```

#### Step 5: Update Local Match

```typescript
await updateMatch(matchId, {
  duprSubmitted: true,
  duprMatchId: result.matchId,
  duprSubmittedAt: Date.now(),
});
```

---

### Validation Rules (MUST CHECK)

| Rule | Description |
|------|-------------|
| Match completed | `status === 'completed'` |
| Has scores | `scores.length > 0` |
| Minimum score | At least one team scored 6+ points |
| No ties | Every game must have a winner (no tied games) |
| All DUPR linked | All players must have `duprId` via SSO |
| Not already submitted | `duprSubmitted !== true` |
| Unique identifier | Use format: `{eventType}_{eventId}_{matchId}` |

### Match Source Types

| Type | When to Use | clubId Required? |
|------|-------------|------------------|
| `PARTNER` | Default for all submissions | No |
| `CLUB` | When submitting on behalf of a DUPR club | Yes |

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 403 Forbidden | Invalid credentials | Check clientKey/clientSecret |
| Duplicate match | Same identifier submitted twice | Use unique identifier per match |
| Tied game | Game has equal scores | All games must have a winner |
| Missing DUPR ID | Player not linked to DUPR | User must SSO login first |

### Integration Status

| Feature | Status | Notes |
|---------|--------|-------|
| SSO Login | ✅ Working | iframe-based OAuth |
| Profile linking | ✅ Working | Via DuprConnect component |
| Rating display | ✅ Working | Shows doubles/singles with reliability |
| Token generation | ✅ Ready | Endpoint: `/auth/v1.0/token` |
| Match submission | ✅ Ready | Endpoint: `/match/v1.0/create` |
| Manual submit button | ✅ Ready | DuprSubmitButton component |

### Configuration

**File**: `services/dupr/index.ts`

```typescript
const DUPR_CONFIG = {
  environment: 'uat', // Switch to 'production' after approval
  testClubId: '6915688914',
  uat: {
    baseUrl: 'https://uat.mydupr.com/api',
    loginUrl: 'https://uat.dupr.gg/login-external-app',
    clientId: '4970118010',
    clientKey: 'test-ck-...',     // From DUPR
    clientSecret: 'test-cs-...',  // From DUPR
  },
  production: {
    baseUrl: 'https://prod.mydupr.com/api',
    loginUrl: 'https://dashboard.dupr.com/login-external-app',
    clientId: '',     // Will be provided after UAT approval
    clientKey: '',    // Will be provided after UAT approval
    clientSecret: '', // Will be provided after UAT approval
  },
};
```

### Future Enhancements

1. **Auto-submission**: Automatically submit on match completion (league setting)
2. **Bulk submission**: Submit multiple matches via `/match/v1.0/batch`
3. **Rating sync**: Periodic refresh of player ratings from DUPR
4. **Webhook integration**: Subscribe to rating change notifications

---

## DUPR Submission Debugging & Lessons Learned (V07.24)

**CRITICAL FOR FUTURE CLAUDE SESSIONS**: This section documents hard-won lessons from debugging 50+ failed DUPR submissions. READ THIS BEFORE modifying any DUPR submission code.

### Architecture: Server-Side Only

**NEVER call DUPR API from the browser.** All DUPR API calls MUST go through Cloud Functions:

```
Browser → httpsCallable('dupr_submitMatches') → Cloud Function → DUPR API
```

**Key Files:**
| File | Purpose |
|------|---------|
| `functions/src/dupr.ts` | Cloud Functions for DUPR API calls (SERVER ONLY) |
| `services/firebase/duprScoring.ts` | Client service that calls Cloud Functions |
| `components/shared/DuprControlPanel.tsx` | UI for organizers to manage submissions |
| `components/shared/DuprMatchTable.tsx` | Match list with status badges and actions |

### Common Mistakes We Made (Don't Repeat These!)

#### Mistake 1: Wrong Firebase Import Path
```typescript
// ❌ WRONG - causes "Rollup failed to resolve" build error
import { httpsCallable } from 'firebase/functions';

// ✅ CORRECT - use @firebase namespace
import { httpsCallable } from '@firebase/functions';
```

#### Mistake 2: Mismatched Response Type Mapping
The Cloud Function returns different field names than what client code expected:

```typescript
// Cloud Function returns:
{
  success: true,
  eligibleCount: 5,    // Actually means: successful submissions
  ineligibleCount: 2,  // Actually means: failed submissions
  message: "..."
}

// ❌ WRONG - Old client code mapped incorrectly:
return {
  queuedCount: result.data.eligibleCount,  // Misleading name
  failedCount: 0,  // ALWAYS 0 - hiding real failures!
};

// ✅ CORRECT - Proper mapping:
return {
  successCount: result.data.eligibleCount,
  failedCount: result.data.ineligibleCount,
  message: result.data.message,
};
```

#### Mistake 3: Missing Cloud Function
The `dupr_retryFailed` function was being called but didn't exist! Always verify:
1. Function is defined in `functions/src/dupr.ts`
2. Function is exported in `functions/src/index.ts`
3. Functions are deployed: `firebase deploy --only functions`

#### Mistake 4: "Already Exists" Not Handled as Success
DUPR rejects duplicate submissions with "already exists in the database" error. This is actually success:

```typescript
// In submitMatchToDupr():
if (errorMessage.includes('already exists') ||
    errorMessage.includes('Object identifiers must be universally unique')) {
  // Treat as success - match was submitted previously
  return {
    success: true,
    duprMatchId: 'already-submitted',
    warnings: ['Match was already in DUPR database'],
  };
}
```

#### Mistake 5: No Diagnostic Function
When bulk submission fails, you can't tell WHY. We added `dupr_testSubmitOneMatch` for debugging:

```typescript
// Test a single match to see exact DUPR response
const result = await httpsCallable(functions, 'dupr_testSubmitOneMatch')({
  matchId: 'abc123',
  eventType: 'league',
  eventId: 'xyz789',
});
// Returns: { ok, stage, matchMetadata, payloadMetadata, duprResponse }
```

#### Mistake 6: Doubles Validation Based on DUPR ID Count (Not Player Count)

**Original broken logic:**
```typescript
// ❌ WRONG - Determines doubles by how many DUPR IDs we found
const isDoubles = match.gameSettings?.playType !== 'singles' && sideADuprIds.length > 1;

// If 1 partner missing DUPR, isDoubles = false, submitted as SINGLES!
```

**Fixed logic:**
```typescript
// ✅ CORRECT - Determine doubles by PLAYER count BEFORE checking DUPR
const isDoubles = sideAPlayerIds.length > 1 || sideBPlayerIds.length > 1 ||
  (match.gameSettings?.playType && match.gameSettings.playType !== 'singles');

// Then validate ALL players have DUPR IDs
const expectedPerSide = isDoubles ? 2 : 1;
if (sideADuprIds.length < expectedPerSide || sideBDuprIds.length < expectedPerSide) {
  logger.warn(`Missing DUPR IDs for ${isDoubles ? 'doubles' : 'singles'}`, {
    expected: expectedPerSide,
    sideADuprCount: sideADuprIds.length,
    sideBDuprCount: sideBDuprIds.length,
  });
  return null;  // BLOCK submission - don't submit wrong format
}
```

**Rule:** For doubles, ALL 4 players must have DUPR IDs linked. For singles, both players must have DUPR IDs.

### DUPR Payload Format (CRITICAL)

The Cloud Function builds payloads in this exact format:

```typescript
{
  identifier: `${eventType}_${eventId}_${matchId}`,  // DETERMINISTIC!
  event: "Tournament Name",
  format: "DOUBLES" | "SINGLES",
  matchDate: "2025-01-07",  // Date only, no time
  matchSource: "PARTNER",   // or "CLUB" if clubId provided
  teamA: {
    player1: "duprId123",   // String DUPR ID
    player2: "duprId456",   // Optional for doubles
    game1: 11,              // Score for game 1
    game2: 9,               // Score for game 2
    game3: 11,              // Optional
  },
  teamB: {
    player1: "duprId789",
    player2: "duprId012",
    game1: 5,               // MUST have same games as teamA
    game2: 11,
    game3: 8,
  },
  // clubId: 12345,         // ONLY if matchSource === "CLUB"
}
```

**HARD RULES:**
1. `identifier` must be deterministic (same match = same identifier for retries)
2. `teamA` and `teamB` MUST have the same game fields (game1, game2, etc.)
3. No tied games allowed (scoreA !== scoreB for all games)
4. If `matchSource === "PARTNER"`, do NOT include `clubId` (not even null)
5. If `matchSource === "CLUB"`, `clubId` is required as a number

### Debugging Checklist

When DUPR submissions fail:

1. **Check Cloud Function logs**: `firebase functions:log --only dupr_submitMatches`
2. **Use test function**: Click "Test" button on a single match in DUPR panel
3. **Verify credentials**: Ensure `firebase functions:config:get` shows `dupr.client_key` and `dupr.client_secret`
4. **Check payload format**: Look for validation failures in logs
5. **Check for duplicates**: "Already exists" means match was previously submitted

### UI Feedback Best Practices

Show users exactly what happened:

```typescript
// ❌ BAD - Misleading message
showToast('success', `${result.queuedCount} matches queued`);

// ✅ GOOD - Accurate counts
if (result.successCount === 0 && result.failedCount === 0) {
  showToast('success', 'No matches to submit - all already submitted');
} else if (result.failedCount === 0) {
  showToast('success', `Successfully submitted ${result.successCount} matches to DUPR`);
} else if (result.successCount === 0) {
  showToast('error', `Failed to submit ${result.failedCount} matches`);
} else {
  showToast('success', `Submitted ${result.successCount} matches (${result.failedCount} failed)`);
}
```

### Safe Logging Rules

**NEVER log credentials or player IDs in production:**

```typescript
// ❌ NEVER DO THIS
logger.info('Credentials:', { clientKey, clientSecret });
logger.info('Payload:', JSON.stringify(duprPayload));  // Contains DUPR IDs

// ✅ SAFE - Log metadata only
logger.info('[DUPR] Token request:', {
  hasClientKey: !!clientKey,      // Boolean only
  hasClientSecret: !!clientSecret,
});
logger.info('[DUPR] Payload metadata:', {
  identifier: payload.identifier,
  matchSource: payload.matchSource,
  format: payload.format,
  gameCount: 3,
  hasClubId: false,
});
```

---

## DUPR Compliance Rules (V07.23)

**CRITICAL FOR FUTURE CLAUDE SESSIONS**: This section defines the compliance rules that MUST be followed when implementing any scoring, match finalization, or DUPR submission features. Review this section before modifying any related components.

### 1. Core Compliance Principles

Pickleball Director meets DUPR partner requirements by enforcing:
- **Exclusive use of DUPR for ratings** (no alternative rating systems)
- **Organiser-only official score reporting** (no self-reporting)
- **Structured competition contexts** (leagues/tournaments/sessions)
- **Auditability and integrity controls** across the entire score lifecycle

### 2. Roles and Permissions

#### Players MAY:
- View matches and results
- Propose a score after a match (non-binding)
- Acknowledge ("sign") an opponent's proposed score (non-binding)
- Dispute a proposed score

#### Players MAY NOT:
- Finalise an official result
- Mark matches as DUPR submitted
- Trigger DUPR submissions
- Edit results after organiser finalisation

#### Organisers MAY:
- Create and manage events (tournaments/leagues)
- Review proposed scores and disputes
- Finalise official results
- Mark matches as DUPR-eligible (where applicable)
- Submit matches to DUPR (single or bulk)
- Correct official results (with audit trail)

#### Enforcement Layers:
1. **UI gating** - buttons/actions hidden based on role
2. **Service-layer checks** - validation in Firebase services
3. **Firestore security rules** - hard enforcement at database level

### 3. Anti Self-Reporting (REQUIRED)

Pickleball Director enforces a strict non-self-reporting model:

| Rule | Implementation |
|------|----------------|
| Player scores are proposals only | `scoreState: 'proposed'` |
| Only organisers finalise | `finalisedByUserId` must be organiser |
| Only official results to DUPR | Check `officialResult` exists before submission |

**Key Rule**: A match is NOT considered complete for standings/brackets or DUPR until `officialResult` exists.

### 4. Score Lifecycle States

```
none → proposed → signed → official → submittedToDupr
                ↘ disputed ↗
```

| State | Description | Who Can Transition |
|-------|-------------|-------------------|
| `none` | No score activity | - |
| `proposed` | Player submitted a score proposal | Player |
| `signed` | Opponent acknowledged proposal | Opponent |
| `disputed` | Opponent disputed proposal | Opponent |
| `official` | Organiser finalised official result | Organiser only |
| `submittedToDupr` | Accepted by DUPR | System (after organiser triggers) |

**Only `official` results affect standings and bracket progression.**
**Only `official` results can be submitted to DUPR.**

### 5. Team Integrity (teamSnapshot)

To prevent score manipulation, store a `teamSnapshot` for each match:

```typescript
interface TeamSnapshot {
  sideA: {
    id: string;
    playerIds: string[];
    name: string;
  };
  sideB: {
    id: string;
    playerIds: string[];
    name: string;
  };
  capturedAt: number;
}
```

**Enforcement Rules:**
- Only an opposing player can acknowledge ("sign") a proposal
- A player or teammate cannot confirm their own score
- Firestore rules validate signer/proposer sides using the snapshot

### 6. Standings and Brackets Use Official Results Only

All competition logic MUST use organiser-finalised results only:
- Pool standings
- Round-robin standings
- Bracket advancement
- Medal calculations

**Matches without `officialResult` are ignored for these calculations.**

### 7. DUPR Eligibility Requirements

A match is eligible for DUPR submission only if ALL requirements are met:

| Requirement | Check |
|-------------|-------|
| Organiser finalised | `officialResult` exists |
| DUPR eligible flag | `duprEligible === true` (if event mode is Optional) |
| Match complete | `status === 'completed'` |
| Score locked | `scoreLocked === true` |
| No unresolved dispute | Dispute resolved by organiser finalisation |
| Players linked to DUPR | All participants have `duprId` (for DUPR Required events) |
| Minimum score | At least one team scored 6+ points |
| No tied games | Every game has a winner |

### 8. Submission Rules (Organiser-Only, Server-Side)

| Rule | Implementation |
|------|----------------|
| Organiser-triggered only | Check user role before allowing submission |
| Uses `officialResult` only | Never submit proposals |
| Server-side execution | Cloud Functions only, not client-side |
| Client cannot call DUPR API | Block direct API calls from client |
| Client cannot set submitted | Firestore rules block `dupr.submitted = true` from client |

### 9. Bulk Submission and Partial Failure

Batch submissions support partial success:

```typescript
interface BatchSubmissionResult {
  batchId: string;
  totalMatches: number;
  successCount: number;
  failCount: number;
  results: Array<{
    matchId: string;
    success: boolean;
    duprMatchId?: string;
    error?: string;
  }>;
}
```

**Handling:**
- Successful matches marked `dupr.submitted = true`
- Failed matches store `dupr.submissionError`
- Retry requeues only failed matches

### 10. No Automatic Submission Without Organiser Control

| Allowed | Not Allowed |
|---------|-------------|
| Auto-queue eligible matches for organiser review | Auto-submit without organiser action |
| Reminders/escalation timers to prompt organisers | Bypass organiser verification |
| Batch submission UI for organisers | Silent background submission |

### 11. Audit Trail Requirements

Every key action MUST be recorded:

| Action | Fields to Record |
|--------|-----------------|
| Score proposal | `proposedBy`, `proposedAt`, `proposedScores` |
| Acknowledgement | `signedBy`, `signedAt` |
| Dispute | `disputedBy`, `disputedAt`, `disputeReason` |
| Official finalisation | `finalisedByUserId`, `finalisedAt` |
| DUPR submission | `submittedByUserId`, `submittedAt`, `duprMatchId` or `submissionError` |
| Score correction | `correctedBy`, `correctedAt`, `correctionReason`, `previousResult` |

### 12. Player Disclosure (DUPR-Enabled Events)

For DUPR-enabled events, players must be informed:
- Results may be submitted to DUPR and affect ratings
- Only organisers finalise and submit results
- Players may propose/acknowledge/dispute, but cannot finalise
- Participation implies consent to share match results with DUPR

### Key Data Structures

#### Match with DUPR Compliance Fields

```typescript
interface Match {
  id: string;
  status: 'scheduled' | 'in_progress' | 'completed';

  // Score lifecycle
  scoreState: 'none' | 'proposed' | 'signed' | 'disputed' | 'official' | 'submittedToDupr';
  scoreLocked: boolean;

  // Player proposals (non-binding)
  proposedResult?: {
    scores: GameScore[];
    proposedBy: string;
    proposedAt: number;
    signedBy?: string;
    signedAt?: number;
    disputedBy?: string;
    disputedAt?: number;
    disputeReason?: string;
  };

  // Official result (organiser-finalised)
  officialResult?: {
    scores: GameScore[];
    winnerId: string;
    finalisedByUserId: string;
    finalisedAt: number;
    correctionHistory?: Array<{
      previousScores: GameScore[];
      correctedBy: string;
      correctedAt: number;
      reason: string;
    }>;
  };

  // Team snapshot for integrity
  teamSnapshot?: TeamSnapshot;

  // DUPR tracking
  dupr?: {
    eligible: boolean;
    submitted: boolean;
    submissionId?: string;
    submittedAt?: number;
    submittedByUserId?: string;
    submissionError?: string;
    batchId?: string;
  };
}
```

### Compliance Checklist for New Features

When implementing scoring or DUPR-related features, verify:

- [ ] Player-entered scores are treated as proposals only
- [ ] Only organisers can finalise official results
- [ ] Only official results update standings/brackets
- [ ] Only official results can be submitted to DUPR
- [ ] DUPR submission is server-side only
- [ ] All actions are audited with userId and timestamp
- [ ] teamSnapshot is used to validate acknowledgements
- [ ] Disputes are handled before finalisation
- [ ] Bulk submission handles partial failures
- [ ] UI hides actions user cannot perform

### Summary Statement

> Pickleball Director integrates with DUPR using an organiser-verified reporting model. Players may propose and acknowledge scores, but results are never official until a verified organiser finalises them. Only organiser-finalised official results are used for standings/brackets and are eligible for DUPR submission. All submissions are server-side and auditable, with strict role-based access control, anti-self-reporting safeguards (teamSnapshot), dispute handling, and batch submission support.

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
- Sends SMS via Twilio (writes to `sms_messages` collection)
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
