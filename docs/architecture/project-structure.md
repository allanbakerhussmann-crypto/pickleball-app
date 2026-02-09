# Project Structure

## Directory Layout

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

## Key Files Reference

### Entry Points

| File | Purpose |
|------|---------|
| `index.html` | HTML entry with CDN imports (Tailwind, Firebase, React) |
| `index.tsx` | React entry, renders App with AuthProvider |
| `App.tsx` | Root component, sets up Router |

### Routing

| File | Purpose |
|------|---------|
| `router/index.tsx` | All route definitions |

Hash-based routing is used for Firebase/AI Studio compatibility.

### Authentication

| File | Purpose |
|------|---------|
| `contexts/AuthContext.tsx` | Auth state, user profile, login/logout |
| `services/firebase/users.ts` | User CRUD operations |

### Type Definitions

| File | Purpose |
|------|---------|
| `types.ts` | Main domain types (Tournament, League, Club, etc.) |
| `types/game/` | GameSettings, Match, GameScore |
| `types/formats/` | CompetitionFormat, format-specific settings |

### Core Services

| File | Purpose |
|------|---------|
| `services/firebase/tournaments.ts` | Tournament CRUD |
| `services/firebase/leagues.ts` | League CRUD |
| `services/firebase/matches.ts` | Match operations |
| `services/firebase/teams.ts` | Team management |

### Shared Components

| File | Purpose |
|------|---------|
| `components/shared/FormatSelector.tsx` | Format selection UI |
| `components/shared/GameSettingsForm.tsx` | Game rules configuration |
| `components/shared/ScoreEntryModal.tsx` | Universal score entry |
