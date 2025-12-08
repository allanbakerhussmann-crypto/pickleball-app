/**
 * courtAllocator.ts (FULL MODERN REPLACEMENT)
 * ---------------------------------------------------------
 * This version introduces:
 *
 * ✔ Strict Round Balancing (B1)
 * ✔ Multi-division scheduling intelligence
 * ✔ Clean "priority queue" generation
 * ✔ Auto-assign engine for first-wave and freed courts
 * ✔ Pure functional design (no React)
 * ✔ Fully documented, maintainable structure
 *
 * This file is the foundation for the Live Courts system.
 */

import { Match, Court, Division } from "../types";

/* -------------------------------------------------------
 * TYPES
 * -----------------------------------------------------*/

export interface QueueMatch {
  id: string;
  divisionId: string;
  roundNumber: number;
  stage: string;
  teamAId: string;
  teamBId: string;
  status: string;
  court?: string;
}

export interface AllocationResult {
  queue: QueueMatch[];
  waitTimes: Record<string, number>;
}

/* -------------------------------------------------------
 * HELPERS: STATUS NORMALIZATION
 * -----------------------------------------------------*/

const isWaitingStatus = (s: string) =>
  s === "not_started" || s === "waiting";

/* -------------------------------------------------------
 * ROUND BALANCING LOGIC (Strict B1)
 * -----------------------------------------------------*/

/**
 * Computes the "current active round" per division.
 * i.e., the earliest unfinished round.
 */
function getDivisionProgress(matches: Match[]): Record<string, number> {
  const progress: Record<string, number> = {};

  for (const m of matches) {
    if (!progress[m.divisionId]) {
      progress[m.divisionId] = m.roundNumber || 1;
    }

    // If a match in a lower round is still not completed → push the progress back
    if (m.status !== "completed") {
      const rn = m.roundNumber || 1;
      if (rn < progress[m.divisionId]) {
        progress[m.divisionId] = rn;
      }
    }
  }

  return progress;
}

/**
 * Computes a strict priority score for matches.
 * Lower score = higher priority.
 */
function computePriorityScores(
  matches: Match[],
  divisions: Division[]
): Map<string, number> {
  const progress = getDivisionProgress(matches);
  const scores = new Map<string, number>();

  for (const m of matches) {
    if (!isWaitingStatus(m.status)) continue;

    const divisionRoundNeeded = progress[m.divisionId];
    const thisRound = m.roundNumber || 1;

    // Core strict round balancing:
    // PRIORITY 1: Match belongs to the earliest unfinished round of its division
    const roundPriority = thisRound === divisionRoundNeeded ? 0 : 1;

    // Secondary priority: ensure divisions take turns
    const divisionIndex =
      divisions.findIndex((d) => d.id === m.divisionId) ?? 0;

    // Final score:
    const score = roundPriority * 100 + divisionIndex * 10 + thisRound;

    scores.set(m.id, score);
  }

  return scores;
}

/* -------------------------------------------------------
 * QUEUE GENERATION
 * -----------------------------------------------------*/

/**
 * Builds a clean sorted queue of matches eligible for assignment.
 */
export function getScheduledQueue(
  matches: Match[],
  courts: Court[],
  divisions: Division[]
): AllocationResult {
  try {
    const scores = computePriorityScores(matches, divisions);

    const queue: QueueMatch[] = matches
      .filter((m) => isWaitingStatus(m.status))
      .map((m) => ({
        id: m.id,
        divisionId: m.divisionId,
        roundNumber: m.roundNumber || 1,
        stage: m.stage || "",
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        status: m.status,
        court: m.court,
      }))
      .sort((a, b) => {
        const sa = scores.get(a.id) ?? 9999;
        const sb = scores.get(b.id) ?? 9999;
        return sa - sb; // lowest score = highest priority
      });

    const waitTimes: Record<string, number> = {};
    queue.forEach((m, i) => (waitTimes[m.id] = i));

    return { queue, waitTimes };
  } catch (err) {
    console.error("courtAllocator error:", err);
    return { queue: [], waitTimes: {} };
  }
}

/* -------------------------------------------------------
 * AUTO-ASSIGN ENGINE
 * -----------------------------------------------------*/

/**
 * Chooses the next best match for a court.
 */
export function getNextMatchForCourt(
  queue: QueueMatch[],
  activeCourtNames: string[]
): QueueMatch | null {
  for (const m of queue) {
    // Skip matches already assigned to courts
    if (m.court && activeCourtNames.includes(m.court)) continue;

    return m;
  }
  return null;
}

/**
 * Auto-assign first wave of matches:
 * Assigns as many matches as free courts.
 */
export function autoAssignFirstWave(
  queue: QueueMatch[],
  courts: Court[]
): Array<{ matchId: string; courtName: string }> {
  const actions: Array<{ matchId: string; courtName: string }> = [];

  const activeCourts = courts.filter((c) => c.active);
  const freeCourts = activeCourts.filter((c) => !c.currentMatchId);

  let qIndex = 0;

  for (const court of freeCourts) {
    const next = queue[qIndex];
    if (!next) break;

    actions.push({
      matchId: next.id,
      courtName: court.name,
    });

    qIndex++;
  }

  return actions;
}

/**
 * Auto-assign NEXT match when ONE court becomes free.
 */
export function autoAssignOnCourtFree(
  queue: QueueMatch[],
  court: Court
): { matchId: string; courtName: string } | null {
  const next = queue[0];
  if (!next) return null;

  return { matchId: next.id, courtName: court.name };
}
