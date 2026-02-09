# Dynamic Court Allocation System

## Overview

The court allocation system dynamically assigns matches to courts during live tournament play. It ensures fair play, prevents conflicts, and optimizes court usage.

**Key File:** `components/tournament/hooks/useCourtManagement.ts`

---

## Core Requirements

### 1. Player Rest Time (8-Minute Minimum)

- Players MUST have at least 8 minutes rest between matches
- System tracks `completedAt` timestamp on each match
- Queue excludes matches where any player hasn't rested enough
- Rest time is configurable (default: 8 minutes)

### 2. No Double-Booking

- A team/player can only be on ONE court at a time
- System tracks busy teams by:
  - Team ID (`sideA.id`, `sideB.id`)
  - Team Name (case-insensitive, for pool play)
  - Player IDs (`sideA.playerIds`, `sideB.playerIds`)
- Matches with busy teams are excluded from queue

### 3. Fair Distribution (Load Balancing)

- Teams with fewer completed matches get priority
- Prevents scenario where some teams play 5 matches while others have played 2
- Queue sorts by: play count (ascending) → round number → match number

### 4. Pool Balance

- Pools that are behind in progress get priority
- Prevents one pool from finishing while another hasn't started
- Calculated as: `(completed matches / total matches)` per pool
- Lower completion rate = higher priority

### 5. Flexible Round Order

- Rounds don't have to complete in strict order
- If Round 1 matches are blocked (rest time, busy teams), Round 2 matches can play
- Priority still given to earlier rounds when possible

### 6. Dynamic Recalculation

- Queue recalculates FRESH when:
  - A match completes (court becomes free)
  - A match is assigned to a court
  - Manual refresh is triggered
- NOT a static `useMemo` - must respond to real-time events

---

## Queue Scoring Algorithm

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

---

## Match Eligibility Rules

A match is **eligible** for court assignment if:

1. Status is NOT `completed` or `in_progress`
2. No court currently assigned (`court` is null/empty)
3. Neither team is currently on another court
4. Neither team name is on another court (pool play check)
5. No player ID is on another court
6. All players have had 8+ minutes rest since last match
7. Match is NOT a self-match (team vs itself - data corruption check)

---

## Data Requirements

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

---

## Winner Determination (Multi-Game Matches)

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

---

## Score Storage (Dual Format)

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

---

## Auto-Assignment Flow

When `autoAssignFreeCourts()` is called:

1. Get fresh list of eligible matches (recalculate, don't cache)
2. Get list of free courts (no active match)
3. For each free court:
   - Find highest-priority eligible match
   - Check no conflict with already-assigned matches in this batch
   - Assign match to court, set status to `scheduled`
   - Mark team/players as assigned (prevent double-booking in batch)
4. Optionally send notifications to players

---

## Testing the System

Use Test Mode (`TestModePanel.tsx`) to:
- Seed division with 4/8/16 test teams
- Generate round-robin matches
- Simulate match completions with random scores
- Delete corrupted self-matches (data cleanup)
- Clear all test data

---

## Known Issues & Protections

### Self-Matches

Matches where `sideA.id === sideB.id` or names match:
- Blocked from queue with console error
- Use "Delete Corrupted" button to clean up

### Legacy Data

Old matches may lack `scores[]` array:
- Display falls back to `scoreTeamAGames`/`scoreTeamBGames`
- New completions write both formats

### Missing Player IDs

Some matches may have empty `playerIds`:
- System falls back to team ID matching
- Team IDs added to busyPlayers set as backup
