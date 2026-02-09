# Pickleball Director

> **Version**: 07.24
> **Live URL**: https://pickleballdirector.co.nz
> **Firebase URL**: https://pickleball-app-dev.web.app

Tournament, League & Club Management Platform for competitive pickleball. Enables organizers to run events while providing players with registration, scoring, and ratings.

**Full Documentation**: See [/docs](docs/README.md) for detailed architecture, patterns, and integration guides.

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
- **Components**: `PascalCase.tsx` (e.g., `CreateTournament.tsx`)
- **Services**: `camelCase.ts` (e.g., `duprService.ts`)
- **Hooks**: `useCamelCase.ts` (e.g., `useCheckout.ts`)

### Import Order
1. React imports
2. Third-party libraries
3. Internal services/types
4. Local components

### Key Patterns
- Use `ScrollTimePicker` for time inputs (never `<input type="time">`)
- Use plus/minus buttons for price inputs (never `<input type="number">`)
- Named exports preferred over default exports

**Full conventions**: See [docs/patterns/code-conventions.md](docs/patterns/code-conventions.md)

---

## Unified Match Format (CRITICAL)

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

## Payment Invariants

### organizerUserId Field (CRITICAL)

**The `organizerUserId` field is REQUIRED on all payment/refund transactions** for them to appear in organizer Finance tabs.

Both transaction creation points MUST include this field:
- `stripe_createRefund` - App-initiated refunds
- `handleChargeRefunded` - External refunds from Stripe Dashboard

### Refund Amount Calculation

For Direct Charges, use NET amount (not GROSS):
```typescript
const refundAmount = tx.amount - (tx.platformFeeAmount || 0);
```

**Full payment documentation**: See [docs/payments/refunds.md](docs/payments/refunds.md)

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

## Documentation Index

| Topic | Location |
|-------|----------|
| **Architecture** | |
| Tech Stack | [docs/architecture/stack.md](docs/architecture/stack.md) |
| Project Structure | [docs/architecture/project-structure.md](docs/architecture/project-structure.md) |
| Firestore Collections | [docs/architecture/firestore.md](docs/architecture/firestore.md) |
| Services | [docs/architecture/services.md](docs/architecture/services.md) |
| **Patterns** | |
| UI Inputs | [docs/patterns/ui-inputs.md](docs/patterns/ui-inputs.md) |
| Code Conventions | [docs/patterns/code-conventions.md](docs/patterns/code-conventions.md) |
| Domain Model | [docs/patterns/domain-model.md](docs/patterns/domain-model.md) |
| **Payments** | |
| Refunds | [docs/payments/refunds.md](docs/payments/refunds.md) |
| Stripe Connect | [docs/payments/stripe-connect.md](docs/payments/stripe-connect.md) |
| **Tournaments** | |
| Court Allocation | [docs/tournaments/court-allocation.md](docs/tournaments/court-allocation.md) |
| **Integrations** | |
| DUPR | [docs/integrations/dupr.md](docs/integrations/dupr.md) |
| Phone Verification | [docs/integrations/phone-verification.md](docs/integrations/phone-verification.md) |
| **Runbooks** | |
| Deployment | [docs/runbooks/deployment.md](docs/runbooks/deployment.md) |
| Debugging | [docs/runbooks/debugging.md](docs/runbooks/debugging.md) |

---

## Current Version: 07.24

Recent features:
- **DUPR Integration** - Match submission, SSO login, rating sync, webhooks
- **SMS Credits System** - Bundle purchases, credit management
- **Phone Verification** - OTP-based phone verification for SMS notifications
