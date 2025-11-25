// services/partnerLogic.ts
import type { Division, Team, UserProfile } from '../types';

/**
 * Build a consistent doubles team name from one or two players.
 * - If two players: "Alice & Bob"
 * - If one player: "Alice (looking for partner)"
 */
export const buildDoublesTeamName = (
  players: UserProfile[],
): string => {
  if (players.length >= 2) {
    return `${players[0].displayName} & ${players[1].displayName}`;
  }
  if (players.length === 1) {
    return `${players[0].displayName} (looking for partner)`;
  }
  return 'TBD Team';
};

/**
 * Check if a given user is already in *any* team for this division.
 */
export const isUserAlreadyInDivisionTeam = (
  userId: string,
  divisionId: string,
  teams: Team[],
): boolean => {
  return teams.some(
    (t) => t.divisionId === divisionId && t.players.includes(userId) && t.status !== 'withdrawn',
  );
};

/**
 * Find the "pending_partner" team for a user (used for the
 * "I don't have a partner yet" and "Join a player looking for a partner" flows).
 */
export const findOpenPartnerTeam = (
  userId: string,
  divisionId: string,
  teams: Team[],
): Team | undefined => {
  return teams.find(
    (t) =>
      t.divisionId === divisionId &&
      t.status === 'pending_partner' &&
      t.players.length === 1 &&
      t.players[0] === userId,
  );
};

/**
 * Basic eligibility check for a partner based on division rules.
 * (We only keep it generic here; gender / age / rating filtering still happens
 * in the UI query as you already do.)
 */
export const canUsersShareDivision = (opts: {
  division: Division;
  playerA: UserProfile;
  playerB: UserProfile;
}): boolean => {
  const { division, playerA, playerB } = opts;

  // Age
  const minAge = division.minAge ?? undefined;
  const maxAge = division.maxAge ?? undefined;

  const parseAge = (birthDate?: string): number | undefined => {
    if (!birthDate) return;
    const d = new Date(birthDate);
    if (Number.isNaN(d.getTime())) return;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  };

  const aAge = parseAge(playerA.birthDate);
  const bAge = parseAge(playerB.birthDate);

  if (minAge !== undefined) {
    if ((aAge !== undefined && aAge < minAge) || (bAge !== undefined && bAge < minAge)) {
      return false;
    }
  }
  if (maxAge !== undefined) {
    if ((aAge !== undefined && aAge > maxAge) || (bAge !== undefined && bAge > maxAge)) {
      return false;
    }
  }

  // Rating (very simple min / max check; DUPR vs internal rating is already
  // handled when you pick which number to store)
  const minRating = division.minRating ?? undefined;
  const maxRating = division.maxRating ?? undefined;

  const getRating = (p: UserProfile): number | undefined =>
    p.duprDoublesRating ?? p.duprSinglesRating ?? p.ratingDoubles ?? p.ratingSingles ?? undefined;

  const aR = getRating(playerA);
  const bR = getRating(playerB);

  const checkRating = (r?: number): boolean => {
    if (r === undefined) return true;
    if (minRating !== undefined && r < minRating) return false;
    if (maxRating !== undefined && r > maxRating) return false;
    return true;
  };

  if (!checkRating(aR) || !checkRating(bR)) return false;

  return true;
};
