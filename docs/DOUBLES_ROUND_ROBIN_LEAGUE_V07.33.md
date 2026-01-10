# Doubles Round-Robin League - Complete Plan (Updated V07.33)

## What We're Building

A doubles round-robin league system that works exactly like the existing singles leagues, with proper partner management, DUPR integration, and robust backend safeguards.

---

## Part 1: How Players Join a Doubles League

### Method A: Invite a Specific Partner

1. Player A opens the league registration wizard
2. Player A selects "Invite a specific partner"
3. Player A searches for Player B by name or email
4. If the league requires DUPR, Player B must have DUPR linked (otherwise greyed out with "No DUPR" badge)
5. Player A selects Player B and completes registration
6. Result: Player A's team is created with status "Pending Partner"
7. Player B logs in and sees the invitation on the Invites page
8. Player B can Accept or Decline
9. If accepted: Both players are linked, team becomes "Active", matches can be generated
10. If declined: Player A's team stays as "Pending Partner", can invite someone else

### Method B: Create an Open Team (Looking for Partner)

1. Player A opens the league registration wizard
2. Player A selects "I don't have a partner yet"
3. Player A completes registration
4. Result: Player A's team is created with status "Pending Partner" and flagged as "Looking for Partner"
5. Player A's open team appears in the list for other players to see

### Method C: ~~Request to Join an Open Team~~ → Direct Join (CHANGED V07.27)

**Original:** Join requests required approval from the open team owner.

**Updated (V07.27):** Direct join - no approval needed for better UX.

1. Player B opens the league registration wizard
2. Player B sees a list of open teams (players looking for partners)
3. Player B selects Player A's open team and clicks "Join Team"
4. Result: **Immediately joined** - no request/approval flow
5. Both players are linked, team becomes "Active"
6. First come, first served - if two people try to join simultaneously, only one succeeds

### Capacity Counting (ADDED V07.27)

- `active` members count toward league capacity
- `pending_partner` members **ALSO count** toward capacity (they occupy a slot while waiting)
- This prevents over-registration when many people are "looking for partner"

---

## Part 2: Eligibility Rules

### DUPR Link Requirement

- If the league requires DUPR, players cannot register unless they have DUPR linked
- The "Join" button is replaced with a "Link DUPR" button that opens the DUPR login
- Partners without DUPR appear in search results but are greyed out

### Age Rules

- Adults can play down: A 55-year-old can enter an "Under 50" division
- Youth protection: Adults (18+) cannot enter youth divisions (Under 18, Under 16, etc.)

### DUPR Rating Rules (Opposite of Age)

- Lower rated can play up: A 3.5 player can enter a "4.0+" division
- Higher rated cannot sandbag: A 4.5 player cannot enter a "3.0-3.5" division

---

## Part 3: How Matches Work

### Match Generation

- Matches are only generated for teams with status "Active"
- Teams with status "Pending Partner" are excluded (they don't have both players yet)
- Doubles teams must have exactly 2 players - if somehow a team is "Active" without a partner, it's excluded as a safety measure

### Weekly Structure (UPDATED V07.29)

- Matches are organized by week (Week 1, Week 2, Week 3, etc.)
- Each match has a `weekNumber` field
- In a round-robin, every team plays every other team once across the weeks

**Week States (NEW):**

| State | What It Means |
|-------|---------------|
| `closed` | Week hasn't started. Players can see matches but CANNOT enter scores. |
| `open` | Scoring enabled. Players can submit and confirm scores. |
| `locked` | Week finished. Standings calculated. No more changes allowed. |

- Week 1 automatically starts in `open` state
- All other weeks start `closed` until organizer opens them
- Organizer controls when to open/lock weeks

### Score Entry (MAJOR UPDATE V07.33 - DUPR Compliance)

**Original:** Either player enters score → opposing team confirms → done.

**Updated - Three-Stage Flow:**

```
Stage 1: PROPOSE
  - Either player from either team enters the score
  - Status: "proposed"
  - Stored in: match.scoreProposal

Stage 2: SIGN (REQUIRED - NEW)
  - Opposing team must acknowledge the score
  - They click "Sign to Acknowledge" or "Dispute"
  - Status: "signed" or "disputed"
  - CRITICAL: Organizer CANNOT finalize until opponent signs

Stage 3: FINALIZE
  - Only organizer can make the score official
  - Creates match.officialResult
  - Sets match.scoreLocked = true
  - Match status becomes "completed"
```

**Why This Matters:**
- DUPR requires opponent verification to prevent fake scores
- Players cannot self-report wins
- Server-side submission only (not from browser)

### Score Picker UI (ADDED V07.33)

- Touch-friendly vertical score picker
- Appears when tapping score input box
- Shows numbers 0-15 in scrollable list
- Centered over the input field
- One tap to select and confirm

---

## Part 4: Standings (UPDATED V07.33)

### Overall Standings

- Shows cumulative results across all weeks
- Stored at `standings/overall`

### Weekly Standings

- Shows results for just that week
- Stored at `standings/week-1`, `standings/week-2`, etc.

### What's Tracked

| Column | Description |
|--------|-------------|
| P | Matches Played |
| W | Wins |
| L | Losses |
| Win% | Win Percentage |
| PF | Points For (optional, toggle) |
| PA | Points Against (optional, toggle) |
| GD | Game Differential |
| Pts | League Points (3 per win) |
| **DIFF** | Point Differential (PF - PA) - **CHANGED from "Form"** |

**Removed Columns (V07.33):**
- ~~Streak~~ - Removed (not a tiebreaker)
- ~~Form~~ - Replaced with DIFF

### Tiebreaker Order

1. League Points (most important)
2. Number of Wins
3. **Point Differential (DIFF)** - tiebreaker
4. Points For

### Staleness Detection

- Standings store the timestamp of the latest match used in calculation
- If a score is edited after standings were computed, UI shows "standings are stale"
- Recompute button refreshes standings

---

## Part 5: DUPR Integration (UPDATED V07.33)

### Submission Format

- Singles matches submitted as "SINGLES" with 2 player DUPR IDs
- Doubles matches submitted as "DOUBLES" with 4 player DUPR IDs
- System automatically detects based on how many players are on each side

### DUPR Eligibility Rules

A match can be submitted to DUPR only if ALL are true:
- Match status is `completed` with `officialResult`
- All 4 players have linked DUPR accounts
- At least one team scored 6+ points in a game
- No tied games (every game has a clear winner)
- Match hasn't already been submitted

### DUPR Status Tracking (UPDATED)

Each match tracks in `match.dupr`:
```
{
  eligible: boolean       // Meets all requirements
  submitted: boolean      // Has been sent to DUPR
  submittedAt: timestamp  // When submitted
  submissionId: string    // ID from DUPR
  batchId: string         // If bulk submitted
  error: string           // Any error message
}
```

### Submission Flow

1. Match is finalized by organizer
2. Organizer opens DUPR Control Panel
3. System shows eligible matches
4. Organizer clicks "Submit to DUPR"
5. **Server (Cloud Function)** sends to DUPR API - NOT the browser
6. Match marked as submitted
7. Deterministic ID prevents duplicate submissions

### Webhook Handling

- DUPR can send webhooks when ratings change
- Webhooks update player ratings in our system
- Webhooks NEVER overwrite match scores (our system is the source of truth)

---

## Part 6: Organizer Features

### Dashboard Tabs

All these work the same for doubles as singles:
- **Standings** - Overall and weekly standings with partner names, DIFF column
- **Matches** - All matches showing both team members, score status
- **Players** - Member list with partner info
- **Schedule** - Matches organized by week with lock/unlock controls
- **DUPR** - Submission panel, shows eligibility and status
- **Info** - League settings
- **Comms** - Send messages to all members

### Week Management (NEW V07.29)

Organizer can:
- **Open a week** - Enable scoring for that week's matches
- **Lock a week** - Finalize standings, prevent further changes
- **See week state** - Visual indicator (closed/open/locked)

### Score Review Modal (UPDATED V07.33)

When reviewing a match for finalization:
- Shows both teams with player names
- Shows score proposal (if exists)
- Shows who entered and when
- Shows signed/disputed status
- **WARNING BANNER** if opponent hasn't signed yet
- **BLOCKED** from finalizing until opponent signs
- Can edit scores before finalizing
- Can toggle DUPR eligibility

---

## Part 7: Organizer Who Is Also a Player (NEW SECTION)

### The Scenario

The person running the league wants to play in it too.

### What's Allowed

- Organizer CAN register as a player
- Organizer CAN have a partner and play matches
- Organizer CAN propose scores for their own matches
- Their opponent must still sign/acknowledge

### The Safeguards

**Score Proposals:**
- Organizer-player proposes score like any player
- Opponent must sign (no shortcuts)

**Finalization - CONFLICT OF INTEREST:**
- Organizer should NOT finalize matches they played in
- System allows it but it's ethically wrong
- **Best Practice:** Appoint a co-organizer for these matches

### Recommended Setup

If organizer wants to play:
1. Add a co-organizer who is NOT playing
2. Co-organizer handles matches involving the playing organizer
3. Co-organizer resolves disputes involving the playing organizer
4. Playing organizer handles everything else

### Audit Trail

System tracks:
- Who proposed the score
- Who signed/disputed
- Who finalized
- Timestamps for everything

---

## Part 8: Backend Safety Rails

### 1. Atomic Transactions

When accepting an invite or joining a team, everything happens in one transaction:
- Update inviter's member with partner info
- Mark invite as accepted
- Cancel any other pending invites from the same person
- Withdraw any solo teams the joining player had

### 2. Partner Lock (Race Condition Prevention)

- A `partnerLockedAt` timestamp is set when a partner is attached
- If two people try to join at the same time, only one succeeds
- The other gets an error "This team already has a partner"

### 3. Team Key (Duplicate Prevention)

- Each team gets a `teamKey` = sorted player IDs joined (e.g., "abc123_xyz789")
- Same two players cannot register twice for the same league
- Prevents duplicate teams in standings

### 4. Expiry for Pending States

- Invites expire after 7 days
- Cleanup function marks old items as "expired"
- Prevents ghost pending teams cluttering the system

### 5. Idempotent Schedule Generation

- Each schedule generation has a unique ID
- If generator runs twice, it won't create duplicate matches
- Completed matches are never overwritten

### 6. Server-Owned Standings

- Only server code can write to standings documents
- Clients can request recompute but cannot write directly
- Prevents corrupted standings from client bugs

### 7. Doubles Match Validation

- Score entry validates that both sides have exactly 2 players
- All 4 players must be active members of the league
- Prevents "impossible" matches that would break DUPR submission

### 8. Score Locking (NEW V07.33)

- Once organizer finalizes, `scoreLocked = true`
- Players cannot modify locked scores
- Only organizer can unlock (if needed)

### 9. DUPR Compliance Enforcement (NEW V07.33)

- System blocks finalization if opponent hasn't signed
- Alert shown: "Opponent must acknowledge the score first"
- Prevents organizers from bypassing the verification flow

---

## Part 9: Security Rules

### Who Can Do What

| Action | Who Can Do It |
|--------|---------------|
| Create league | Any authenticated user |
| Edit league settings | Organizer only |
| Join league | Any user (during registration) |
| Propose score | Any match participant |
| Sign/Acknowledge score | **Opponent only** (not your own team) |
| Dispute score | **Opponent only** |
| Finalize score | Organizer only |
| Open/Lock weeks | Organizer only |
| Submit to DUPR | Server only (Cloud Function) |
| View standings | Anyone |

---

## Part 10: Database Structure

```
leagues/{leagueId}/
├── name, type, format, status
├── organizerId
├── weekStates: { 1: "open", 2: "closed", 3: "locked" }  // NEW
├── settings: { ... }
│
├── members/{memberId}
│   ├── userId, displayName
│   ├── partnerUserId, partnerDisplayName
│   ├── teamName: "Alice / Bob"
│   ├── status: pending_partner | active | withdrawn
│   ├── isLookingForPartner: boolean
│   ├── teamKey: "userId1_userId2"
│   └── stats: { wins, losses, pointsFor, pointsAgainst, ... }
│
├── matches/{matchId}
│   ├── weekNumber: 1, 2, 3...
│   ├── memberAId, memberBId
│   ├── sideA: { id, name, playerIds: [p1, p2] }
│   ├── sideB: { id, name, playerIds: [p3, p4] }
│   ├── status: scheduled | pending_confirmation | completed | disputed
│   │
│   ├── scoreProposal: {           // NEW STRUCTURE
│   │   scores: [{ scoreA, scoreB }],
│   │   winnerId,
│   │   enteredByUserId,
│   │   enteredAt,
│   │   status: proposed | signed | disputed,
│   │   signedByUserId,
│   │   signedAt,
│   │   disputedByUserId,
│   │   disputeReason
│   │ }
│   │
│   ├── officialResult: {          // NEW STRUCTURE
│   │   scores: [{ scoreA, scoreB }],
│   │   winnerId,
│   │   finalisedByUserId,
│   │   finalisedAt
│   │ }
│   │
│   ├── dupr: {                    // UPDATED STRUCTURE
│   │   eligible,
│   │   submitted,
│   │   submittedAt,
│   │   submissionId
│   │ }
│   │
│   └── scoreLocked: boolean       // NEW
│
└── standings/
    ├── overall
    └── week-1, week-2...

leaguePartnerInvites/{inviteId}    # Partner invitations (7-day expiry)
```

---

## Part 11: What We Tested & Fixed

### Original Tests (Still Valid)

1. ✅ Singles league still works exactly as before
2. ✅ Doubles invite flow: invite → accept → team active
3. ✅ Doubles invite flow: invite → decline → can invite again
4. ✅ Only "Active" teams get matches generated
5. ✅ DUPR validation blocks partners without DUPR link
6. ✅ Age validation blocks adults from youth divisions
7. ✅ Rating validation blocks higher rated from lower divisions
8. ✅ Race condition: two accepts at same time → only one succeeds
9. ✅ Duplicate prevention: same two players can't register twice
10. ✅ Standings staleness detection works
11. ✅ DUPR submission sends correct format (DOUBLES with 4 players)
12. ✅ Organizer tabs all work for doubles leagues
13. ✅ Expired invites don't show in UI

### New Tests (V07.27+)

14. ✅ Open team direct join (no approval needed)
15. ✅ Pending partner members count toward capacity
16. ✅ First-come-first-served for open teams

### New Tests (V07.29+)

17. ✅ Week states: closed → open → locked
18. ✅ Players cannot score in closed weeks
19. ✅ Organizer can open/lock weeks
20. ✅ Standings rebuild when week locked

### New Tests (V07.33)

21. ✅ Score picker appears on tap
22. ✅ Score picker centered over input
23. ✅ Opponent must sign before finalization
24. ✅ Warning banner when awaiting opponent acknowledgement
25. ✅ Finalize button disabled until signed
26. ✅ DIFF column shows point differential
27. ✅ Removed Streak/Form columns

---

## Summary of Changes from Original Plan

| Area | Original | Updated (V07.33) |
|------|----------|------------------|
| Open team join | Request + approval | Direct join (no approval) |
| Capacity counting | Active only | Active + Pending Partner |
| Week management | Implicit | Explicit states (closed/open/locked) |
| Score flow | Propose → Confirm | Propose → **Sign** → Finalize |
| Finalization | Anytime | **Blocked until opponent signs** |
| Standings columns | Streak, Form | DIFF (point differential) |
| Score entry UI | Number input | Vertical scroll picker |
| Organizer as player | Not addressed | Documented with safeguards |
| DUPR submission | Browser-based | Server-only (Cloud Function) |

---

## Summary

This system provides:
- **Two ways to find a partner:** Invite specific person OR create open team for direct join
- **DUPR-compliant scoring:** Propose → Sign → Finalize (no self-reporting)
- **Same experience as singles:** Match generation, scoring, standings all work identically
- **Week control:** Organizer decides when scoring opens and closes
- **Full DUPR integration:** Server-side submission with deterministic IDs
- **Robust safeguards:** Race conditions, duplicates, expiry, and validation all handled
- **Clear eligibility rules:** Age and rating restrictions properly enforced
- **Organizer flexibility:** Can play in own league with co-organizer handling their matches
