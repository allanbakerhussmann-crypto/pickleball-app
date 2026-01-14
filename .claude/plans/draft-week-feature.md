# Box League Draft Week Feature

## Overview
After finalizing a week, provide a "Draft" interface where organizers can manually adjust box assignments before activating the next week. This handles absences, substitutes, and manual overrides.

## Current Pain Points
- Confusing flow: matches finalized in Organizer tab, but week finalization elsewhere
- No clear "Finalize Week" button visible
- Week completion count not updating when matches are finalized
- No way to manually adjust box assignments before next week starts
- Absence handling is disconnected from week activation

## Proposed Flow

```
Week N Matches Completed
         ↓
Week N Auto-Finalizes (or organizer clicks Finalize)
         ↓
"Draft Week N+1" Screen Appears
         ↓
Organizer Reviews/Adjusts Assignments
         ↓
Confirm & Activate Week N+1
         ↓
Matches Generated
```

## Draft Week UI Design

```
┌─────────────────────────────────────────────────────────┐
│  📋 Draft Week 2 Assignments                            │
├─────────────────────────┬───────────────────────────────┤
│  BOX ASSIGNMENTS        │  SUBSTITUTES                  │
│  (from Week 1 standings)│                               │
│                         │  [+ Add Substitute]           │
│  ┌─ Box 1 ───────────┐  │  ┌─────────────────────┐      │
│  │ 1. Allan Baker  ↕ │  │  │ • John Smith (4.2) │      │
│  │ 2. Test2 Two    ↕ │  │  │ • Jane Doe (3.8)   │      │
│  │ 3. Test3 Three  ↕ │  │  └─────────────────────┘      │
│  │ 4. [ABSENT]     ↕ │←─drag sub here                  │
│  │ 5. Test5 Five   ↕ │  │                               │
│  └───────────────────┘  │  ABSENT THIS WEEK             │
│                         │  ┌─────────────────────┐      │
│  ┌─ Box 2 ───────────┐  │  │ • Test4 Four       │      │
│  │ 6. Test6 Six    ↕ │  │  └─────────────────────┘      │
│  │ 7. Test7 Seven  ↕ │  │                               │
│  │ 8. Test8 Eight  ↕ │  │                               │
│  │ 9. Test Nine    ↕ │  │                               │
│  │ 10. Test Ten    ↕ │  │                               │
│  └───────────────────┘  │                               │
│                         │  [Reset to Auto] [Confirm]    │
└─────────────────────────┴───────────────────────────────┘
```

## Features

### Left Panel - Box Assignments
- Shows computed box assignments from previous week's standings
- Promotion/relegation already applied
- Drag-drop to reorder players within/between boxes
- Visual indicator for promoted (↑) and relegated (↓) players
- Click player to mark as absent → moves to Absent section

### Right Panel - Substitutes
- **Add Substitute Button**: Search players in app
  - For DUPR leagues: Only show DUPR-linked players
  - Show player's DUPR rating next to name
  - Can add multiple subs to pool
- **Substitute Pool**: List of available subs for this week
- **Absent This Week**: Players marked absent
  - Drag from boxes to here to mark absent
  - Drag sub from pool to vacant spot

### Substitute Replacement Logic
- Sub takes the **exact position** of the absent player
- Sub inherits the box and slot (e.g., Box 1, Position 4)
- Organizer can then drag-drop to adjust if needed

### Buttons
- **Reset to Auto**: Revert to computed assignments (undo all manual changes)
- **Confirm & Activate Week**: Finalizes assignments, generates matches

## Integration Points

### Existing Components
- `BoxLeagueAbsencePanel.tsx` - Already exists in Organizer tab
- `RotatingBoxPlayerManager.tsx` - Has drag-drop for players
- `boxLeagueWeek.ts` - Week state machine (draft → active → closing → finalized)

### New Components Needed
- `DraftWeekPanel.tsx` - Main draft interface
- `SubstitutePool.tsx` - Right panel with add/manage subs
- `PlayerSearchModal.tsx` - Search and add substitute players

### State Changes
- Week state: `finalized` (Week N) → `draft` (Week N+1)
- New field: `draftAssignments` - holds manual adjustments before activation
- New field: `substitutes` - array of {originalPlayerId, substitutePlayerId, weekNumber}

## DUPR League Considerations
- Add Substitute only shows DUPR-linked players
- Display DUPR rating next to player names
- Validate substitute has valid DUPR ID before allowing

## Data Model

```typescript
interface WeekDraft {
  weekNumber: number;
  computedAssignments: BoxAssignment[];  // Auto-calculated
  manualAssignments?: BoxAssignment[];   // After organizer edits
  absences: {
    playerId: string;
    substituteId?: string;
    reason?: string;
  }[];
  substitutes: {
    id: string;
    name: string;
    duprId?: string;
    duprRating?: number;
  }[];
  status: 'draft' | 'confirmed';
}
```

## Implementation Steps

1. **Fix immediate bugs first**
   - Week completion count not updating
   - Add visible "Finalize Week" button

2. **Add Draft state to week lifecycle**
   - Week N finalized → Week N+1 auto-created in 'draft' state
   - Show Draft UI when week is in draft state

3. **Build DraftWeekPanel component**
   - Left: Box assignments with drag-drop (reuse existing DnD)
   - Right: Substitute pool with Add button

4. **Build PlayerSearchModal**
   - Search players by name
   - Filter by DUPR-linked for DUPR leagues
   - Show rating, allow selection

5. **Implement Confirm & Activate**
   - Save final assignments to week document
   - Generate matches using those assignments
   - Transition week to 'active' state

6. **Integrate with Absentee tab**
   - Link existing absence tracking
   - Show absences in Draft panel

## Priority
- **Phase 1**: Fix bugs (week count, finalize button)
- **Phase 2**: Add draft state and basic UI
- **Phase 3**: Add substitute search/add
- **Phase 4**: Full drag-drop with absence integration

---
*Created: 2026-01-13*
*Status: Planned for future implementation*
