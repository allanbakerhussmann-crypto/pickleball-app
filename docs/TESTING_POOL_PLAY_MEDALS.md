# Pool Play → Medals Testing Manual

**Version:** V06.21
**URL:** https://pickleball-app-dev.web.app
**Purpose:** End-to-end testing of tournament Pool Play → Medals format using Test Mode

---

## Overview

This manual guides you through testing the complete Pool Play → Medals tournament flow:

1. **Pool Stage** - Round robin within pools
2. **Medal Bracket** - Single elimination with bronze match
3. **Optional Plate Bracket** - For 3rd place finishers from pools

---

## Prerequisites

- You must be logged in as an **organizer** or **app_admin**
- Create a tournament with format **"Pool Play → Medals"**
- Add a division with at least 4 teams

---

## Part 1: Tournament Setup

### Step 1: Create Tournament

1. Go to **Tournaments** → **Create Tournament**
2. Fill in basic info:
   - Name: "Test Pool Medals Tournament"
   - Date: Today or future date
   - Location: Any
3. Set format to **"Pool Play → Medals"**
4. Create the tournament

### Step 2: Create Division

1. In tournament manager, go to **Divisions** tab
2. Click **Add Division**
3. Settings:
   - Name: "Test Division"
   - Type: Doubles or Singles
   - Pool Size: **4** (recommended for testing)
   - Advancement: **Top 2** from each pool
4. Save division

### Step 3: Add Teams (Use Test Mode)

1. In tournament manager, find the **Test Mode** panel (bottom of page or in settings)
2. Click **"Seed 8 Test Teams"** (or 4/16 depending on desired pool count)
   - 8 teams = 2 pools of 4
   - 16 teams = 4 pools of 4
3. Verify teams appear in Teams tab

---

## Part 2: Pool Stage Testing

### Step 4: Generate Pool Schedule

1. Go to **Schedule** or **Matches** tab
2. Click **"Generate Schedule"**
3. Verify:
   - ✅ Matches created for each pool
   - ✅ Each team plays every other team in their pool
   - ✅ Pool A: 6 matches (4 teams × 3 opponents ÷ 2)
   - ✅ Pool B: 6 matches
   - ✅ Total: 12 matches for 8 teams

### Step 5: Test Pool Match Scoring (Manual)

1. Click on any pool match
2. Enter scores (e.g., 11-5)
3. Submit score
4. Verify:
   - ✅ Match status changes to "completed"
   - ✅ Standings update

### Step 6: Simulate Pool Completion (Test Mode)

1. In Test Mode panel, click **"Complete All Pool Matches"**
2. This randomly scores all remaining pool matches
3. Verify:
   - ✅ All pool matches show "completed"
   - ✅ Standings show wins/losses for each team
   - ✅ Pool progress shows 100%

### Step 7: Verify Pool Standings

1. Check standings for each pool
2. Verify tiebreaker order:
   1. Wins
   2. Head-to-head
   3. Point differential
   4. Points scored

---

## Part 3: Medal Bracket Generation

### Step 8: Generate Medal Bracket

1. After all pool matches complete, find **"Generate Medal Bracket"** button
2. Click it
3. **Expected behavior:**
   - ✅ Bracket matches created
   - ✅ Top 2 from each pool advance
   - ✅ For 8 teams: 4 qualifiers → 2 semis + 1 final + 1 bronze = 4 matches

### Step 9: Verify Bracket Structure

Check Firestore or match list:

| Match | Round | Teams |
|-------|-------|-------|
| Semi 1 | 1 | Pool A #1 vs Pool B #2 |
| Semi 2 | 1 | Pool B #1 vs Pool A #2 |
| Final | 2 | Semi 1 winner vs Semi 2 winner |
| Bronze | 2 | Semi 1 loser vs Semi 2 loser |

### Step 10: Test Bracket Match Scoring

1. Score Semi 1 (e.g., 11-7)
2. Verify:
   - ✅ Winner advances to Final
   - ✅ Loser moves to Bronze match
3. Score Semi 2
4. Score Bronze match
5. Score Final

---

## Part 4: Error Handling Tests

### Test A: Race Condition Prevention

1. Open tournament in **two browser tabs**
2. In both tabs, click "Generate Medal Bracket" simultaneously
3. **Expected:**
   - ✅ First click succeeds
   - ✅ Second click shows error: "Bracket generation already in progress"

### Test B: Duplicate Bracket Prevention

1. After bracket is generated, try clicking "Generate Medal Bracket" again
2. **Expected:**
   - ✅ Error: "Bracket already exists for division. Delete existing bracket first to regenerate."

### Test C: Incomplete Pools Prevention

1. Create a new division
2. Generate pool schedule
3. Score only SOME pool matches (not all)
4. Try to generate medal bracket
5. **Expected:**
   - ✅ Button should be disabled or show warning
   - ✅ Error message: "X pool match(es) not complete"

---

## Part 5: Canonical ID Verification

### Check Match IDs in Firestore

1. Open Firebase Console → Firestore
2. Navigate to: `tournaments/{tournamentId}/matches`
3. Verify bracket match IDs follow pattern:

**Pool Matches:**
```
{divisionId}__pool__pool-a__{teamId1}_{teamId2}
```

**Main Bracket Matches:**
```
{divisionId}__bracket__main__1   (Semi 1)
{divisionId}__bracket__main__2   (Semi 2)
{divisionId}__bracket__main__3   (Final)
{divisionId}__bracket__main__bronze
```

**Plate Bracket (if enabled):**
```
{divisionId}__bracket__plate__1
{divisionId}__bracket__plate__2
```

### Verify nextMatchId Linking

1. Check Semi 1 match document
2. Verify `nextMatchId` points to Final match (canonical ID, not temp)
3. Check Semi 2 match document
4. Verify `nextMatchId` also points to Final match

---

## Part 6: Plate Bracket Testing (Optional)

### Enable Plate Bracket

In division settings, enable:
- `plateEnabled: true`
- `plateFormat: 'single_elim'`
- `plateThirdPlace: false` (or true for 3rd place match)

### Test Plate Generation

1. Complete all pool matches
2. Generate medal bracket
3. Verify:
   - ✅ Main bracket created (top 2 from each pool)
   - ✅ Plate bracket created (3rd place from each pool)
   - ✅ Plate matches use `bracketType: 'plate'`
   - ✅ Plate matches use `stage: 'bracket'` (not 'plate')

---

## Part 7: Test Mode Functions

### Available Test Mode Actions

| Button | Action |
|--------|--------|
| **Seed 4/8/16 Teams** | Creates test teams with random names |
| **Complete All Pool Matches** | Randomly scores all pool matches |
| **Complete Pool A/B** | Scores matches for specific pool |
| **Delete Corrupted Matches** | Removes self-matches (same team vs itself) |
| **Clear Test Data** | Removes test flag from matches, resets to scheduled |

### Clean Up After Testing

1. Delete the test tournament, OR
2. Use **"Clear Test Data"** to reset matches to scheduled state

---

## Part 8: Expected Console Logs

Open browser DevTools (F12) → Console to see:

```
[generatePoolPlaySchedule] Teams input: 8 [...]
[generatePoolPlaySchedule] Participants: 8
[generatePoolPlaySchedule] Using auto-seeding via generatePoolStage
[generatePoolPlaySchedule] Pool result: 2 pools, 12 matches
[generatePoolPlaySchedule] Successfully generated 12 matches (version 1)

[generateFinalsFromPoolStandings] Successfully generated bracket: 4 main + 0 plate matches
```

### Error Logs to Watch For

```
// Race condition
[generateFinalsFromPoolStandings] Stale lock detected (XXXms old), taking over

// Lock release on failure
[generateFinalsFromPoolStandings] Lock released after failure

// Unknown nextMatchId (shouldn't happen)
[mapNextMatchIdToCanonical] Unknown temp ID: temp_XXX
```

---

## Checklist Summary

### Pool Stage
- [ ] Tournament created with Pool Play → Medals format
- [ ] Division created with 4-team pools
- [ ] Test teams seeded via Test Mode
- [ ] Pool schedule generated
- [ ] All pool matches completed (manually or via Test Mode)
- [ ] Standings calculated correctly

### Medal Bracket
- [ ] Medal bracket generated after pools complete
- [ ] Correct teams advanced (top 2 from each pool)
- [ ] Bracket matches have canonical IDs
- [ ] nextMatchId links are canonical (not temp)
- [ ] Winner advancement works
- [ ] Bronze match populated with losers

### Error Handling
- [ ] Race condition prevented (double-click)
- [ ] Duplicate bracket prevented
- [ ] Incomplete pool warning shown

### Data Integrity
- [ ] Main bracket: `stage: 'bracket'`, `bracketType: 'main'`
- [ ] Plate bracket: `stage: 'bracket'`, `bracketType: 'plate'`
- [ ] Match IDs are deterministic and canonical

---

## Reporting Issues

If you encounter issues:

1. **Screenshot** the error message
2. **Copy** the console logs (F12 → Console)
3. **Note** the tournament ID and division ID
4. Check Firestore for the actual match documents

Report issues to the development team with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Console logs
- Screenshots
