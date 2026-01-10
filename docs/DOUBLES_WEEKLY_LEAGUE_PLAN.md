# Doubles Weekly League - Complete System Guide

**Version:** V07.33
**Last Updated:** January 2026

---

## Overview

A doubles weekly league is a competition where teams of two players compete against each other over multiple weeks. Each week, teams play their scheduled matches, and standings are calculated based on wins, losses, and point differential.

---

## Part 1: How the League Works

### Setting Up a League

1. **Organizer creates the league** with these settings:
   - League name and description
   - Type: Doubles or Mixed Doubles
   - Format: Round Robin (everyone plays everyone)
   - Number of weeks
   - Game settings (points to win, best of 1/3/5)
   - Maximum number of teams allowed

2. **Registration period opens** - Players sign up

3. **Organizer generates the schedule** - System creates all matches

4. **League goes active** - Play begins

### How Teams Are Formed

Players can join a doubles league in three ways:

**Option A: Invite a Specific Partner**
- Player joins and invites their preferred partner by name
- Partner receives an invitation (expires in 7 days)
- If partner accepts, team is complete and active
- If partner declines or ignores, player stays in "looking for partner" status

**Option B: Join as "Looking for Partner"**
- Player joins without a partner
- Their slot is visible to other solo players
- Any other solo player can join them directly (no approval needed)
- First come, first served

**Option C: Join an Open Team**
- Player sees another solo player looking for a partner
- They click to join that team directly
- Team is immediately complete and active

### Weekly Structure

The league runs over multiple weeks. Here's how weeks work:

| Week State | What It Means |
|------------|---------------|
| **Closed** | Week hasn't started. Players can see their matches but cannot enter scores. |
| **Open** | Scoring is enabled. Players can submit and confirm scores. |
| **Locked** | Week is finished. Standings have been calculated. No more changes allowed. |

**Week 1** automatically starts in "Open" state when the schedule is generated.

**All other weeks** start "Closed" until the organizer opens them.

### Match Generation (Round Robin)

When the organizer generates the schedule:

1. System looks at all active teams
2. Creates matches so every team plays every other team exactly once
3. Spreads matches across the configured number of weeks
4. Each match is assigned a week number

Example with 6 teams over 5 weeks:
- Week 1: Team A vs B, Team C vs D, Team E vs F
- Week 2: Team A vs C, Team B vs E, Team D vs F
- (and so on until everyone has played everyone)

---

## Part 2: Scoring System

### The Three-Stage Score Process

This is **critical for DUPR compliance**. Scores go through three stages:

#### Stage 1: Score Proposal
- Either team can enter the score after playing
- This is just a "proposal" - not official yet
- System records who entered it and when

#### Stage 2: Opponent Acknowledgement
- The opposing team must confirm the score is correct
- They click "Sign to Acknowledge"
- If they disagree, they can "Dispute" with a reason
- **This step is REQUIRED before the organizer can finalise**

#### Stage 3: Organizer Finalisation
- Only the organizer can make the score official
- They review the proposed score and opponent's acknowledgement
- Click "Finalise Official Result"
- This locks the score permanently

### Why This Matters (DUPR Rules)

DUPR (the rating system) has strict anti-cheating rules:

1. **No self-reporting** - You can't just enter your own score and have it count
2. **Opponent verification required** - The other team must agree the score is real
3. **Third-party finalisation** - Someone neutral (the organizer) makes it official
4. **Server-side submission** - Scores go to DUPR from our server, not from the player's browser

This prevents players from:
- Entering fake scores to boost their rating
- Colluding with friends to manufacture wins
- Manipulating their ratings through false results

### Score Entry Flow (Step by Step)

```
Player A enters score: 11-5, 11-7
    ↓
Status: "Proposed" (waiting for opponent)
    ↓
Player B (opponent) reviews the score
    ↓
Option 1: Player B clicks "Sign to Acknowledge"
    → Status: "Signed" (ready for organizer)
    ↓
Option 2: Player B clicks "Dispute"
    → Status: "Disputed" (organizer must resolve)
    ↓
Organizer opens the review modal
    ↓
Organizer clicks "Finalise Official Result"
    ↓
Status: "Completed" (score is locked, standings update)
    ↓
Match becomes eligible for DUPR submission
```

### What Happens When a Score is Disputed

1. The disputing player must give a reason ("Wrong score entered", "We haven't played yet", etc.)
2. Match status changes to "Disputed"
3. Organizer sees the dispute in their dashboard
4. Organizer contacts both teams to verify the correct score
5. Organizer can:
   - Edit the scores to the correct values
   - Finalise with the corrected score
6. Disputed matches can still be submitted to DUPR once resolved

---

## Part 3: Standings Calculation

### What Gets Tracked

For each team, we track:

| Stat | Description |
|------|-------------|
| **Played (P)** | Total matches completed |
| **Wins (W)** | Matches won |
| **Losses (L)** | Matches lost |
| **Points For (PF)** | Total points scored across all games |
| **Points Against (PA)** | Total points conceded across all games |
| **Differential (DIFF)** | PF minus PA (tiebreaker) |
| **League Points (Pts)** | 3 points per win, 0 per loss |

### How Teams Are Ranked

Teams are sorted by (in order):

1. **League Points** (most important)
2. **Number of Wins** (if points are tied)
3. **Point Differential** (if wins are tied)
4. **Points For** (if differential is tied)

### When Standings Update

Standings are calculated:
- When an organizer locks a week
- When an organizer manually triggers a rebuild
- When viewing the standings page (if data has changed)

The system tracks when standings were last calculated and warns if matches have been updated since then (stale standings).

---

## Part 4: DUPR Submission

### What Makes a Match DUPR-Eligible

A match can be submitted to DUPR only if ALL of these are true:

1. Match status is "Completed" (officially finalised)
2. All four players have linked their DUPR accounts
3. At least one team scored 6 or more points in a game
4. No tied games (every game has a clear winner)
5. Match hasn't already been submitted to DUPR

### The DUPR Submission Process

1. Organizer opens the DUPR Control Panel
2. System shows all eligible matches
3. Organizer clicks "Submit to DUPR" (individual or bulk)
4. Our server (not the browser) sends the data to DUPR
5. DUPR processes and updates player ratings
6. Match is marked as submitted (won't submit again)

### What Gets Sent to DUPR

```
Match ID: league_abc123_match456 (unique identifier)
Event: "Tuesday Night Doubles League"
Format: DOUBLES
Date: 2026-01-07

Team A:
  - Player 1 DUPR ID: 12345
  - Player 2 DUPR ID: 67890
  - Game 1 Score: 11
  - Game 2 Score: 9

Team B:
  - Player 1 DUPR ID: 11111
  - Player 2 DUPR ID: 22222
  - Game 1 Score: 5
  - Game 2 Score: 11
```

### Handling Submission Failures

If DUPR rejects a submission:
- Error is logged
- Match stays marked as "not submitted"
- Organizer can retry later
- "Already exists" errors are treated as success (duplicate protection)

---

## Part 5: Organizer Who Is Also a Player

### The Scenario

Sometimes the person running the league also wants to play in it. This creates potential conflicts of interest.

### What's Allowed

- Organizer CAN register as a player in their own league
- Organizer CAN have a partner and play matches
- Organizer CAN enter scores for their own matches
- System treats them like any other player for scoring

### The Safeguards

**For Score Proposals:**
- The organizer-player can propose scores (same as any player)
- Their opponent must still sign/acknowledge the score
- The organizer-player CANNOT finalise their own match scores

**For Finalisation:**
- When the organizer is a participant in the match, they should NOT finalise it
- Best practice: Appoint a co-organizer to handle matches involving the main organizer
- The system doesn't currently block this, but it's ethically required

**For Disputes:**
- If someone disputes a score where the organizer is playing, the organizer has a conflict of interest
- Should be handled by a neutral co-organizer
- If no co-organizer exists, organizer must be transparent and fair

### Recommended Setup

If an organizer wants to play in their league:

1. **Add a co-organizer** who is NOT playing
2. **Co-organizer handles:**
   - Finalising any matches involving the playing organizer
   - Resolving any disputes involving the playing organizer
3. **Playing organizer handles:**
   - All other administrative tasks
   - Finalising matches they're not involved in

### What the System Does

- Tracks who entered scores, who signed, who finalised
- Creates audit trail of all actions
- Prevents the same person from both proposing AND finalising
- Does NOT currently prevent organizer from finalising their own matches (honour system)

---

## Part 6: Week Management

### Opening a Week

When the organizer is ready for a new week to begin:

1. Go to the League Detail page
2. Click on the week tab
3. Click the unlock/open button next to the week
4. Week state changes from "Closed" to "Open"
5. Players can now enter scores for that week's matches

### Locking a Week

When all matches in a week are complete:

1. Go to the League Detail page
2. Click on the week tab
3. Click the lock button next to the week
4. System calculates standings for that week
5. Week state changes from "Open" to "Locked"
6. No more score changes allowed for that week

### Typical Week Flow

```
Monday:    Organizer opens Week 2
Tuesday:   Teams play their matches
Wednesday: Teams enter and confirm scores
Thursday:  Organizer resolves any disputes
Friday:    Organizer locks Week 2, standings calculated
           Organizer opens Week 3
```

---

## Part 7: Backend Data Structure

### League Document

```
leagues/{leagueId}
├── name: "Tuesday Night Doubles"
├── type: "doubles"
├── format: "round_robin"
├── status: "active"
├── organizerId: "user123"
├── weekStates: { 1: "locked", 2: "open", 3: "closed" }
├── settings: { ... game rules, scoring rules ... }
└── members/ (subcollection)
    └── {memberId}
        ├── userId: "player1"
        ├── partnerUserId: "player2"
        ├── displayName: "Alice"
        ├── partnerDisplayName: "Bob"
        ├── teamName: "Alice / Bob"
        ├── status: "active"
        └── stats: { played, wins, losses, pointsFor, ... }
```

### Match Document

```
leagues/{leagueId}/matches/{matchId}
├── memberAId: "member123"
├── memberBId: "member456"
├── weekNumber: 2
├── status: "completed"
├── scoreProposal: {
│   ├── scores: [{ scoreA: 11, scoreB: 5 }, { scoreA: 11, scoreB: 7 }]
│   ├── winnerId: "member123"
│   ├── enteredByUserId: "player1"
│   ├── enteredAt: 1704657600000
│   └── status: "signed"
│       ├── signedByUserId: "player3"
│       └── signedAt: 1704660000000
│   }
├── officialResult: {
│   ├── scores: [{ scoreA: 11, scoreB: 5 }, { scoreA: 11, scoreB: 7 }]
│   ├── winnerId: "member123"
│   ├── finalisedByUserId: "organizer123"
│   └── finalisedAt: 1704663600000
│   }
├── dupr: {
│   ├── eligible: true
│   ├── submitted: true
│   ├── submittedAt: 1704667200000
│   └── submissionId: "dupr_abc123"
│   }
└── scoreLocked: true
```

### Standings Document

```
leagues/{leagueId}/standings/{standingsKey}
├── standingsKey: "week-2" or "overall"
├── weekNumber: 2 (or null for overall)
├── generatedAt: 1704672000000
├── rows: [
│   { memberId, rank: 1, wins: 3, losses: 0, pointsFor: 66, ... },
│   { memberId, rank: 2, wins: 2, losses: 1, pointsFor: 55, ... },
│   ...
│   ]
└── errors: []
```

---

## Part 8: Security Rules Summary

| Action | Who Can Do It |
|--------|---------------|
| Create league | Any authenticated user |
| Edit league settings | Organizer only |
| Join league | Any user (during registration) |
| Propose score | Any match participant |
| Sign/Acknowledge score | Opponent team member only |
| Dispute score | Opponent team member only |
| Finalise score | Organizer only |
| Open/Lock weeks | Organizer only |
| Submit to DUPR | Server only (via Cloud Function) |
| View standings | Anyone |

---

## Part 9: Error Handling

### Common Issues and Solutions

**"Cannot finalize: Opponent must acknowledge"**
- The opposing team hasn't signed the score yet
- Wait for them to sign, or contact them to do so

**"Match not eligible for DUPR"**
- Check all players have DUPR IDs linked
- Ensure no games were tied
- Verify at least one team scored 6+ points

**"Standings are stale"**
- Matches have been updated since standings were calculated
- Click "Rebuild Standings" to recalculate

**"Week is locked"**
- Cannot modify scores for a locked week
- Organizer must unlock the week first (not recommended)

---

## Summary

The doubles weekly league system ensures:

1. **Fair play** through opponent verification of scores
2. **DUPR compliance** through the propose → sign → finalise workflow
3. **Organizer control** over week timing and final results
4. **Transparent rankings** based on clear tiebreaker rules
5. **Audit trail** of who did what and when

When an organizer plays in their own league, they should appoint a neutral co-organizer to handle their matches to maintain integrity.
