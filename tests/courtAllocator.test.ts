/**
 * Court Allocator Tests
 * 
 * Tests for the court allocation and match scheduling logic.
 * 
 * FILE LOCATION: tests/courtAllocator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  getScheduledQueue,
  autoAssignFirstWave,
  autoAssignOnCourtFree,
  getNextMatchForCourt,
  QueueMatch,
} from '../services/courtAllocator';
import type { Match, Court, Division } from '../types';

// ============================================
// Test Fixtures
// ============================================

const createMatch = (overrides: Partial<Match> = {}): Match => ({
  id: `match-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: 'tournament-1',
  divisionId: 'division-1',
  teamAId: 'team-a',
  teamBId: 'team-b',
  status: 'not_started',
  roundNumber: 1,
  stage: 'pool',
  ...overrides,
});

const createCourt = (overrides: Partial<Court> = {}): Court => ({
  id: `court-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: 'tournament-1',
  name: 'Court 1',
  active: true,
  order: 1,
  ...overrides,
});

const createDivision = (overrides: Partial<Division> = {}): Division => ({
  id: `division-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: 'tournament-1',
  name: 'Division A',
  eventType: 'doubles',
  genderCategory: 'mixed',
  ...overrides,
});

// ============================================
// getScheduledQueue Tests
// ============================================

describe('getScheduledQueue', () => {
  it('returns empty queue when no matches', () => {
    const result = getScheduledQueue([], [], []);
    expect(result.queue).toEqual([]);
    expect(result.waitTimes).toEqual({});
  });

  it('filters out completed matches', () => {
    const matches: Match[] = [
      createMatch({ id: 'match-1', status: 'completed' }),
      createMatch({ id: 'match-2', status: 'not_started' }),
      createMatch({ id: 'match-3', status: 'in_progress' }),
    ];
    const divisions = [createDivision({ id: 'division-1' })];

    const result = getScheduledQueue(matches, [], divisions);

    expect(result.queue.length).toBe(1);
    expect(result.queue[0].id).toBe('match-2');
  });

  it('includes waiting and not_started matches', () => {
    const matches: Match[] = [
      createMatch({ id: 'match-1', status: 'waiting' }),
      createMatch({ id: 'match-2', status: 'not_started' }),
    ];
    const divisions = [createDivision({ id: 'division-1' })];

    const result = getScheduledQueue(matches, [], divisions);

    expect(result.queue.length).toBe(2);
  });

  it('prioritizes earlier rounds over later rounds', () => {
    const matches: Match[] = [
      createMatch({ id: 'match-r2', status: 'not_started', roundNumber: 2 }),
      createMatch({ id: 'match-r1', status: 'not_started', roundNumber: 1 }),
      createMatch({ id: 'match-r3', status: 'not_started', roundNumber: 3 }),
    ];
    const divisions = [createDivision({ id: 'division-1' })];

    const result = getScheduledQueue(matches, [], divisions);

    expect(result.queue[0].id).toBe('match-r1');
    expect(result.queue[1].id).toBe('match-r2');
    expect(result.queue[2].id).toBe('match-r3');
  });

  it('balances between divisions at same round', () => {
    const divisions = [
      createDivision({ id: 'div-a' }),
      createDivision({ id: 'div-b' }),
    ];
    const matches: Match[] = [
      createMatch({ id: 'match-a1', divisionId: 'div-a', roundNumber: 1, status: 'not_started' }),
      createMatch({ id: 'match-b1', divisionId: 'div-b', roundNumber: 1, status: 'not_started' }),
    ];

    const result = getScheduledQueue(matches, [], divisions);

    // Both should be in queue, div-a first (index 0 in divisions array)
    expect(result.queue.length).toBe(2);
    expect(result.queue[0].divisionId).toBe('div-a');
    expect(result.queue[1].divisionId).toBe('div-b');
  });

  it('calculates wait times based on queue position', () => {
    const matches: Match[] = [
      createMatch({ id: 'match-1', status: 'not_started', roundNumber: 1 }),
      createMatch({ id: 'match-2', status: 'not_started', roundNumber: 2 }),
      createMatch({ id: 'match-3', status: 'not_started', roundNumber: 3 }),
    ];
    const divisions = [createDivision({ id: 'division-1' })];

    const result = getScheduledQueue(matches, [], divisions);

    expect(result.waitTimes['match-1']).toBe(0);
    expect(result.waitTimes['match-2']).toBe(1);
    expect(result.waitTimes['match-3']).toBe(2);
  });
});

// ============================================
// autoAssignFirstWave Tests
// ============================================

describe('autoAssignFirstWave', () => {
  it('returns empty array when no courts available', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started' },
    ];

    const result = autoAssignFirstWave(queue, []);

    expect(result).toEqual([]);
  });

  it('returns empty array when no matches in queue', () => {
    const courts = [createCourt({ name: 'Court 1' })];

    const result = autoAssignFirstWave([], courts);

    expect(result).toEqual([]);
  });

  it('assigns matches to free courts', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started' },
      { id: 'match-2', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'c', teamBId: 'd', status: 'not_started' },
    ];
    const courts = [
      createCourt({ name: 'Court 1', active: true }),
      createCourt({ name: 'Court 2', active: true }),
    ];

    const result = autoAssignFirstWave(queue, courts);

    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ matchId: 'match-1', courtName: 'Court 1' });
    expect(result[1]).toEqual({ matchId: 'match-2', courtName: 'Court 2' });
  });

  it('skips inactive courts', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started' },
    ];
    const courts = [
      createCourt({ name: 'Court 1', active: false }),
      createCourt({ name: 'Court 2', active: true }),
    ];

    const result = autoAssignFirstWave(queue, courts);

    expect(result.length).toBe(1);
    expect(result[0].courtName).toBe('Court 2');
  });

  it('skips courts that already have a match', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started' },
    ];
    const courts = [
      createCourt({ name: 'Court 1', active: true, currentMatchId: 'existing-match' }),
      createCourt({ name: 'Court 2', active: true }),
    ];

    const result = autoAssignFirstWave(queue, courts);

    expect(result.length).toBe(1);
    expect(result[0].courtName).toBe('Court 2');
  });

  it('assigns only as many matches as available courts', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started' },
      { id: 'match-2', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'c', teamBId: 'd', status: 'not_started' },
      { id: 'match-3', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'e', teamBId: 'f', status: 'not_started' },
    ];
    const courts = [createCourt({ name: 'Court 1', active: true })];

    const result = autoAssignFirstWave(queue, courts);

    expect(result.length).toBe(1);
    expect(result[0].matchId).toBe('match-1');
  });
});

// ============================================
// autoAssignOnCourtFree Tests
// ============================================

describe('autoAssignOnCourtFree', () => {
  it('returns null when queue is empty', () => {
    const court = createCourt({ name: 'Court 1' });

    const result = autoAssignOnCourtFree([], court);

    expect(result).toBeNull();
  });

  it('assigns first match in queue to the freed court', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started' },
      { id: 'match-2', divisionId: 'div-1', roundNumber: 2, stage: 'pool', teamAId: 'c', teamBId: 'd', status: 'not_started' },
    ];
    const court = createCourt({ name: 'Court 3' });

    const result = autoAssignOnCourtFree(queue, court);

    expect(result).toEqual({ matchId: 'match-1', courtName: 'Court 3' });
  });
});

// ============================================
// getNextMatchForCourt Tests
// ============================================

describe('getNextMatchForCourt', () => {
  it('returns null when queue is empty', () => {
    const result = getNextMatchForCourt([], []);

    expect(result).toBeNull();
  });

  it('returns first match not already on a court', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started', court: 'Court 1' },
      { id: 'match-2', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'c', teamBId: 'd', status: 'not_started' },
    ];

    const result = getNextMatchForCourt(queue, ['Court 1']);

    expect(result?.id).toBe('match-2');
  });

  it('skips matches on active courts', () => {
    const queue: QueueMatch[] = [
      { id: 'match-1', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'a', teamBId: 'b', status: 'not_started', court: 'Court 1' },
      { id: 'match-2', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'c', teamBId: 'd', status: 'not_started', court: 'Court 2' },
      { id: 'match-3', divisionId: 'div-1', roundNumber: 1, stage: 'pool', teamAId: 'e', teamBId: 'f', status: 'not_started' },
    ];

    const result = getNextMatchForCourt(queue, ['Court 1', 'Court 2']);

    expect(result?.id).toBe('match-3');
  });
});
