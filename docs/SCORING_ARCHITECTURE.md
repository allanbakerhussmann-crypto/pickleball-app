# Scoring Architecture

> **Version**: V07.53
> **Last Updated**: 2025-01-18
> **File**: docs/SCORING_ARCHITECTURE.md

## Core Principle (NON-NEGOTIABLE)

**Firestore is the single source of truth for scoring.**

- The UI must ONLY reflect what's in the match document
- NEVER infer scoring state from local UI or legacy assumptions
- ALL state changes MUST go through transactions (proposeScore, signScore, finaliseResult)

---

## Architecture Overview

```
+-------------------------------------------------------------+
|                   EventScoreEntryModal                       |
|  (thin wrapper - passes eventType, renders shared pieces)   |
+-------------------------------------------------------------+
|  +-----------+  +---------------+  +------------------+     |
|  |ScoreHeader|  |ScoreStatusBnr |  |  ScoreActions    |     |
|  +-----------+  +---------------+  +------------------+     |
+-------------------------------------------------------------+
|              useEventScoringState(match, user, ...)          |
|        (all permission checks, state derivation)            |
+-------------------------------------------------------------+
|                   ScorableMatch (adapter)                    |
|   toScorableMatch(tournamentMatch | leagueMatch | meetup)   |
+-------------------------------------------------------------+
|                   confirmScore() wrapper                     |
|        (routes to signScore() or legacy flow)               |
+-------------------------------------------------------------+
```

---

## Score State Machine

```
none -> proposed -> signed -> official -> submittedToDupr
               \-> disputed -/
```

| State | Meaning |
|-------|---------|
| `none` | No score entered yet |
| `proposed` | Player submitted a score, awaiting opponent |
| `signed` | Opponent acknowledged, awaiting organizer |
| `disputed` | Player disputed the score |
| `official` | Organizer finalized - affects standings/brackets |
| `submittedToDupr` | Sent to DUPR API - scores are immutable |

---

## Match Document Fields

| Field | Purpose |
|-------|---------|
| `scoreProposal` | Draft score proposed by a player |
| `scoreProposal.scores` | Array of GameScore objects |
| `scoreProposal.winnerId` | Proposed winner |
| `scoreProposal.enteredByUserId` | Who proposed |
| `scoreProposal.enteredAt` | Timestamp |
| `scoreState` | Current state in the machine |
| `scores` | Current visible scores (may be proposal or official) |
| `officialResult` | Final, organizer-approved result |
| `officialResult.scores` | Final scores array |
| `officialResult.winnerId` | Official winner |
| `officialResult.finalisedByUserId` | Who finalized |
| `scoreLocked` | Prevents further edits once official |
| `duprSubmitted` | True if submitted to DUPR |
| `participantIds` | Denormalized array for efficient queries (V07.53) |

---

## Service Functions (ALWAYS USE THESE)

### Primary Entry Point: `confirmScore()` (Guardrail)

Location: `services/firebase/confirmScore.ts`

**UI MUST use this for all confirmation actions.** It fetches fresh match state from Firestore and routes correctly.

```typescript
// CORRECT - no match passed, function fetches fresh state from DB
await confirmScore(eventType, eventId, matchId, userId);
```

**CRITICAL**: Do NOT pass match from UI. The function fetches fresh state to ensure correct routing.

**BANNED in UI code:**
- Direct calls to `confirmMatchScore()` (legacy)
- Direct calls to `signScore()` without the wrapper
- Passing stale match objects to decide routing

### Core Service Functions

Location: `services/firebase/duprScoring.ts`

| Function | Purpose | Sets scoreState |
|----------|---------|-----------------|
| `proposeScore()` | Player submits score | `'proposed'` |
| `signScore()` | Opponent acknowledges | `'signed'` |
| `disputeScore()` | Player disputes | `'disputed'` |
| `finaliseResult()` | Organizer finalizes | `'official'` |

---

## DUPR Anti-Self-Reporting Rule

**When organizer is ALSO a player in the match:**

| Action | Allowed? |
|--------|----------|
| Propose their own score | BLOCKED |
| Sign if opponent proposed | Yes |
| Finalize after opponent proposes | Yes |

This prevents organizers from gaming the DUPR rating system.

---

## Adapter Pattern: ScorableMatch

Location: `types/game/scorableMatch.ts`

**ALWAYS convert to ScorableMatch before passing to EventScoreEntryModal:**

```typescript
import { toScorableMatch } from '../../types/game/scorableMatch';

// From tournament
const scorable = toScorableMatch(tournamentMatch, 'tournament', tournamentId);

// From league (legacy format with memberAId/memberBId)
const scorable = toScorableMatch(leagueMatch, 'league', leagueId);

// From meetup
const scorable = toScorableMatch(meetupMatch, 'meetup', meetupId);
```

This normalizes all match formats to a common interface.

---

## Component to Use

**ALWAYS use `EventScoreEntryModal` for score entry:**

```typescript
import { EventScoreEntryModal } from '../shared/EventScoreEntryModal';
import { toScorableMatch } from '../../types/game/scorableMatch';

const scorableMatch = toScorableMatch(match, eventType, eventId);

<EventScoreEntryModal
  eventType={eventType}
  eventId={eventId}
  eventName={eventName}
  match={scorableMatch}
  bestOf={gameSettings.bestOf}
  pointsPerGame={gameSettings.pointsPerGame}
  winBy={gameSettings.winBy}
  isOrganizer={isOrganizer}
  isDuprEvent={isDuprEvent}
  onClose={() => setShowModal(false)}
  onSuccess={() => refreshData()}
/>
```

**DO NOT:**
- Create a new score entry component (use shared pieces instead)
- Copy LeagueScoreEntryModal (creates forks)
- Use the legacy `ScoreEntryModal` for new features
- Call Firestore directly for score updates
- Bypass the `confirmScore()` wrapper
- Use `Match | LeagueMatch` union types (use adapter instead)

---

## Adding a New Event Type/Format

When adding a new competition format (e.g., "playoffs"):

1. **Use existing `eventType` values** where possible (`tournament`, `league`, `meetup`)
2. **If new eventType needed**, update:
   - `types/game/match.ts` - Add to `eventType` union
   - `types/game/scorableMatch.ts` - Add adapter case
   - `services/firebase/duprScoring.ts` - Add path handling in `getMatchDocPath()`
   - `services/firebase/confirmScore.ts` - Verify routing works
3. **Store matches as subcollections**: `/{eventType}s/{eventId}/matches/{matchId}`
4. **Include required fields on match**:
   - `sideA`, `sideB` with `id`, `name`, `playerIds`
   - `gameSettings` with `bestOf`, `pointsPerGame`, `winBy`
   - `eventType`, `eventId`
   - `participantIds` (denormalized for queries)
5. **Test the full flow**:
   - Propose -> Sign -> Finalize -> DUPR submission (if applicable)

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `types/game/scorableMatch.ts` | Adapter interface + `toScorableMatch()` |
| `services/firebase/confirmScore.ts` | Canonical confirmation wrapper |
| `hooks/useEventScoringState.ts` | All permission/state logic |
| `components/shared/scoring/*.tsx` | Shared UI components |
| `components/shared/EventScoreEntryModal.tsx` | Unified modal |
| `services/firebase/duprScoring.ts` | Core scoring service functions |

---

## Common Mistakes to Avoid

| DON'T | DO |
|-------|-----|
| Copy existing score modals | Extract shared logic into hooks/components |
| Use `Match \| LeagueMatch` union types | Use `ScorableMatch` adapter |
| Call `signScore()` directly from UI | Use `confirmScore()` wrapper (no match param) |
| Pass match object to `confirmScore()` | Let it fetch fresh state from Firestore |
| Read scores from local state after submit | Let Firestore listener update the UI |
| Check `match.status === 'completed'` for score state | Use `match.scoreState` to determine UI state |
| Call `updateDoc()` directly for score changes | Use service functions (proposeScore, signScore, finaliseResult) |
| Allow organizer-as-player to propose in DUPR | Check `isOrganizerParticipant` and block proposal |
| Edit scores after DUPR submission | Check `isSubmittedToDupr` and disable edit mode |
| Create matches without display names | Store player/team names when creating match |
| Query all proposed matches and filter client-side | Use `participantIds` array + `array-contains` query |

---

## Firestore Query for Pending Score Acknowledgements

Use `collectionGroup` with `participantIds` for efficient queries:

```typescript
import { collectionGroup, where, query } from '@firebase/firestore';

const matchesRef = collectionGroup(db, 'matches');
const q = query(
  matchesRef,
  where('scoreState', '==', 'proposed'),
  where('participantIds', 'array-contains', userId)
);
```

**Benefits:**
- Fast Firestore query (indexed)
- Tight security rules (participant-only reads work)
- No "read all matches then filter locally"

---

## Security Rules (Collection Group)

```
match /{path=**}/matches/{matchId} {
  allow read: if isAuthenticated() && (
    // User is a participant in this match
    request.auth.uid in resource.data.participantIds ||
    // Fallback: check sideA/sideB playerIds directly
    request.auth.uid in resource.data.sideA.playerIds ||
    request.auth.uid in resource.data.sideB.playerIds ||
    // App admin can see all matches
    isAppAdmin()
  );
}
```
