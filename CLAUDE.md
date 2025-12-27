# Pickleball Director

> **Version**: 06.07
> **Type**: Tournament, League & Club Management Platform

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

### Current Version: 06.07
- **Unified Match Format** - Single Match interface for tournaments, leagues, meetups
- Universal Scoring System across all competition types
- Score validation with configurable game settings
- Multi-game support (best of 1/3/5)

### Recent Major Features (v06.00+)
- **Unified Game & Format System** - Standardized 10 competition formats
- **Tournament Planner** - Capacity planning wizard
- **Schedule Builder** - Automated match scheduling with conflict detection
- **Pool Play → Medals** - Two-stage tournament format
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
