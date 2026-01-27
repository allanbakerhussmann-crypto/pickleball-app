/**
 * Team League (Interclub) Firebase Services
 *
 * Database operations for the Team League format where clubs/organizations
 * field teams that compete across multiple boards.
 *
 * ⚠️ COLLECTION PATH: teamLeagues/{teamLeagueId}
 *    - Teams: teamLeagues/{teamLeagueId}/teams/{teamId}
 *    - Fixtures: teamLeagues/{teamLeagueId}/fixtures/{fixtureId}
 *    - Do NOT use leagues/ collection for team leagues
 *
 * FILE LOCATION: services/firebase/teamLeague.ts
 * VERSION: V07.57
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  runTransaction,
  deleteDoc,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from './config';
import type {
  TeamLeague,
  InterclubTeam,
  TeamRosterPlayer,
  TeamLeagueFixture,
  TeamLeagueStanding,
  TeamStatus,
  CaptainAgreement,
  FixtureBoardMatch,
  FixtureLineupPlayer,
  TeamLeagueStatus,
  TeamLeagueBoardConfig,
} from '../../types/teamLeague';
import {
  createAuditEntry,
  DEFAULT_TEAM_LEAGUE,
} from '../../types/teamLeague';

// Re-export types for consumers
export type { TeamLeagueStatus } from '../../types/teamLeague';

// ============================================
// TEAM LEAGUE LISTING
// ============================================

/**
 * Get all team leagues with optional filters
 *
 * ⚠️ Reads from teamLeagues/ collection (NOT leagues/)
 */
export async function getTeamLeagues(filters?: {
  status?: TeamLeagueStatus;
  createdByUserId?: string;
}): Promise<TeamLeague[]> {
  // Query teamLeagues collection - no format filter needed
  const q = query(
    collection(db, 'teamLeagues'),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);
  let teamLeagues = snap.docs.map(d => d.data() as TeamLeague);

  // Apply client-side filters (to avoid complex composite indexes)
  if (filters?.status) {
    teamLeagues = teamLeagues.filter(l => l.status === filters.status);
  }
  if (filters?.createdByUserId) {
    teamLeagues = teamLeagues.filter(l => l.createdByUserId === filters.createdByUserId);
  }

  return teamLeagues;
}

/**
 * Get a single team league by ID
 *
 * ⚠️ Reads from teamLeagues/ collection (NOT leagues/)
 */
export async function getTeamLeague(teamLeagueId: string): Promise<TeamLeague | null> {
  const docSnap = await getDoc(doc(db, 'teamLeagues', teamLeagueId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as TeamLeague;
}

/**
 * Subscribe to team leagues (real-time updates)
 *
 * ⚠️ Subscribes to teamLeagues/ collection (NOT leagues/)
 */
export function subscribeToTeamLeagues(
  callback: (teamLeagues: TeamLeague[]) => void,
  filters?: { status?: TeamLeagueStatus }
): Unsubscribe {
  // Query teamLeagues collection - no format filter needed
  const q = query(
    collection(db, 'teamLeagues'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    let teamLeagues = snap.docs.map(d => d.data() as TeamLeague);

    // Apply filters client-side
    if (filters?.status) {
      teamLeagues = teamLeagues.filter(l => l.status === filters.status);
    }

    callback(teamLeagues);
  }, (error) => {
    console.error('Error subscribing to team leagues:', error);
    callback([]);
  });
}

/**
 * Subscribe to a single team league (real-time updates)
 */
export function subscribeToTeamLeague(
  teamLeagueId: string,
  callback: (teamLeague: TeamLeague | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'teamLeagues', teamLeagueId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(snap.data() as TeamLeague);
  }, (error) => {
    console.error('Error subscribing to team league:', error);
    callback(null);
  });
}

// ============================================
// TEAM LEAGUE CRUD
// ============================================

/**
 * Create a new team league
 *
 * ⚠️ Writes to teamLeagues/ collection (NOT leagues/)
 * ⚠️ Uses flattened structure (NOT nested settings.teamLeague)
 */
export async function createTeamLeague(data: {
  name: string;
  description?: string;
  seasonStart: string; // ISO date YYYY-MM-DD
  seasonEnd: string;   // ISO date YYYY-MM-DD
  venue?: string;
  country?: string;
  region?: string;
  createdByUserId: string;
  organizerName: string;
  boards?: TeamLeagueBoardConfig[];
  maxTeams?: number;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  numberOfWeeks?: number;
  scheduleType?: TeamLeague['scheduleType'];
  defaultMatchDay?: number;
  defaultMatchTime?: string;
  duprMode?: TeamLeague['duprMode'];
  entryFeeType?: TeamLeague['entryFeeType'];
  entryFeeAmount?: number;
}): Promise<string> {
  const teamLeagueId = doc(collection(db, 'teamLeagues')).id;
  const now = Date.now();

  // Build the team league document with defaults
  const teamLeagueDoc: TeamLeague = {
    id: teamLeagueId,
    name: data.name,
    description: data.description,
    country: data.country || DEFAULT_TEAM_LEAGUE.country,
    region: data.region,
    venue: data.venue,
    seasonStart: data.seasonStart,
    seasonEnd: data.seasonEnd,
    status: 'draft',
    createdByUserId: data.createdByUserId,
    organizerName: data.organizerName,

    // Board configuration
    boards: data.boards || DEFAULT_TEAM_LEAGUE.boards,

    // Team settings
    maxTeams: data.maxTeams ?? DEFAULT_TEAM_LEAGUE.maxTeams,
    minPlayersPerTeam: data.minPlayersPerTeam ?? DEFAULT_TEAM_LEAGUE.minPlayersPerTeam,
    maxPlayersPerTeam: data.maxPlayersPerTeam ?? DEFAULT_TEAM_LEAGUE.maxPlayersPerTeam,
    allowMultiTeamPlayers: DEFAULT_TEAM_LEAGUE.allowMultiTeamPlayers,

    // Schedule settings
    numberOfWeeks: data.numberOfWeeks ?? DEFAULT_TEAM_LEAGUE.numberOfWeeks,
    scheduleType: data.scheduleType ?? DEFAULT_TEAM_LEAGUE.scheduleType,
    defaultMatchDay: data.defaultMatchDay ?? DEFAULT_TEAM_LEAGUE.defaultMatchDay,
    defaultMatchTime: data.defaultMatchTime ?? DEFAULT_TEAM_LEAGUE.defaultMatchTime,
    lineupLockMinutesBeforeMatch: DEFAULT_TEAM_LEAGUE.lineupLockMinutesBeforeMatch,

    // DUPR
    duprMode: data.duprMode ?? DEFAULT_TEAM_LEAGUE.duprMode,

    // Scoring
    pointsPerBoardWin: DEFAULT_TEAM_LEAGUE.pointsPerBoardWin,
    pointsPerMatchWin: DEFAULT_TEAM_LEAGUE.pointsPerMatchWin,
    tieBreakerOrder: DEFAULT_TEAM_LEAGUE.tieBreakerOrder,
    byeBoardWins: DEFAULT_TEAM_LEAGUE.byeBoardWins,
    standingsUpdateMode: DEFAULT_TEAM_LEAGUE.standingsUpdateMode,

    // Roster & Seeding
    playerSeeding: DEFAULT_TEAM_LEAGUE.playerSeeding,
    substituteRules: DEFAULT_TEAM_LEAGUE.substituteRules,

    // Fees (flattened)
    entryFeeType: data.entryFeeType ?? DEFAULT_TEAM_LEAGUE.entryFeeType,
    entryFeeAmount: data.entryFeeAmount ?? DEFAULT_TEAM_LEAGUE.entryFeeAmount,
    venueFeeEnabled: DEFAULT_TEAM_LEAGUE.venueFeeEnabled,
    venueFeeAmount: DEFAULT_TEAM_LEAGUE.venueFeeAmount,
    requirePaymentBeforeApproval: DEFAULT_TEAM_LEAGUE.requirePaymentBeforeApproval,
    feeCurrency: DEFAULT_TEAM_LEAGUE.feeCurrency,

    // Withdrawal handling
    defaultWithdrawalHandling: DEFAULT_TEAM_LEAGUE.defaultWithdrawalHandling,

    // Venues
    venues: DEFAULT_TEAM_LEAGUE.venues,

    // Timestamps
    createdAt: now,
    updatedAt: now,
  };

  // Clean undefined values
  const cleanedDoc = Object.fromEntries(
    Object.entries(teamLeagueDoc).filter(([_, v]) => v !== undefined)
  ) as TeamLeague;

  await setDoc(doc(db, 'teamLeagues', teamLeagueId), cleanedDoc);
  return teamLeagueId;
}

/**
 * Update a team league
 */
export async function updateTeamLeague(
  teamLeagueId: string,
  updates: Partial<Omit<TeamLeague, 'id' | 'createdByUserId' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'teamLeagues', teamLeagueId), {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a team league
 */
export async function deleteTeamLeague(teamLeagueId: string): Promise<void> {
  await deleteDoc(doc(db, 'teamLeagues', teamLeagueId));
}

/**
 * Update team league status
 *
 * Valid transitions:
 * - draft -> published (make visible but registration not open)
 * - published -> draft (unpublish - back to draft)
 * - published -> registration (open registration)
 * - registration -> published (close registration but keep visible)
 * - registration -> registration_closed (close registration)
 * - registration_closed -> registration (reopen registration)
 * - registration_closed -> active (start league)
 * - active -> completed (complete league)
 * - any -> cancelled (cancel league)
 */
export async function updateTeamLeagueStatus(
  teamLeagueId: string,
  newStatus: TeamLeagueStatus
): Promise<void> {
  console.log('[teamLeague.ts] updateTeamLeagueStatus called', { teamLeagueId, newStatus });

  const teamLeagueRef = doc(db, 'teamLeagues', teamLeagueId);
  const teamLeagueSnap = await getDoc(teamLeagueRef);

  if (!teamLeagueSnap.exists()) {
    console.error('[teamLeague.ts] Team league not found:', teamLeagueId);
    throw new Error('Team league not found');
  }

  const currentStatus = teamLeagueSnap.data()?.status as TeamLeagueStatus;
  console.log('[teamLeague.ts] Current status from Firestore:', currentStatus);

  // Validate status transitions
  const validTransitions: Record<TeamLeagueStatus, TeamLeagueStatus[]> = {
    draft: ['published', 'cancelled'],
    published: ['draft', 'registration', 'cancelled'],
    registration: ['draft', 'published', 'registration_closed', 'cancelled'],
    registration_closed: ['registration', 'active', 'cancelled'],
    active: ['completed', 'cancelled'],
    completed: ['cancelled'],
    cancelled: [],
  };

  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    console.error('[teamLeague.ts] Invalid transition:', { currentStatus, newStatus, validTransitions: validTransitions[currentStatus] });
    throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  console.log('[teamLeague.ts] Transition is valid, updating Firestore...');
  await updateDoc(teamLeagueRef, {
    status: newStatus,
    updatedAt: Date.now(),
  });
  console.log('[teamLeague.ts] Firestore updated successfully');
}

// ============================================
// TEAM CRUD
// ============================================

/**
 * Create a new interclub team
 *
 * ⚠️ Writes to teamLeagues/{teamLeagueId}/teams/ (NOT leagues/)
 */
export async function createInterclubTeam(
  teamLeagueId: string,
  teamData: {
    name: string;
    captainId: string;
    captainName: string;
    captainEmail?: string;
    captainPhone?: string;
    clubId?: string;
    clubName?: string;
    captainIsPlaying?: boolean;
    initialRoster?: { playerId: string; playerName: string; gender?: 'male' | 'female' | 'other' }[];
    captainAgreementAccepted: boolean;
  }
): Promise<InterclubTeam> {
  if (!teamData.captainAgreementAccepted) {
    throw new Error('Captain agreement is required');
  }

  const teamRef = doc(collection(db, 'teamLeagues', teamLeagueId, 'teams'));
  const now = Date.now();

  // Create roster - captain only added if they're playing
  const roster: TeamRosterPlayer[] = [];
  const captainIsPlaying = teamData.captainIsPlaying ?? true; // Default to playing captain

  if (captainIsPlaying) {
    roster.push({
      playerId: teamData.captainId,
      playerName: teamData.captainName,
      isCaptain: true,
      isPlayingCaptain: true,
      playerType: 'rostered',
      eligibleForLineup: false, // Must accept waiver first
      addedAt: now,
      addedBy: teamData.captainId,
    });
  }

  // Add initial roster players
  if (teamData.initialRoster) {
    for (const player of teamData.initialRoster) {
      if (player.playerId !== teamData.captainId) {
        roster.push({
          playerId: player.playerId,
          playerName: player.playerName,
          gender: player.gender,
          isCaptain: false,
          isPlayingCaptain: false,
          playerType: 'rostered',
          eligibleForLineup: false,
          addedAt: now,
          addedBy: teamData.captainId,
        });
      }
    }
  }

  const captainAgreement: CaptainAgreement = {
    accepted: true,
    acceptedAt: now,
    acceptedBy: teamData.captainId,
    agreementVersion: '1.0',
  };

  const team: InterclubTeam = {
    id: teamRef.id,
    teamLeagueId,
    name: teamData.name,
    clubId: teamData.clubId,
    clubName: teamData.clubName,
    captainId: teamData.captainId,
    captainName: teamData.captainName,
    captainPhone: teamData.captainPhone,
    captainEmail: teamData.captainEmail,
    captainIsPlaying,
    roster,
    status: 'pending_approval',
    captainAgreement,
    paymentStatus: 'pending',
    amountDue: 0,
    amountPaid: 0,
    stats: {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      boardsWon: 0,
      boardsLost: 0,
      boardDiff: 0,
      points: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  // Clean undefined values
  const cleanedTeam = Object.fromEntries(
    Object.entries(team).filter(([_, v]) => v !== undefined)
  ) as InterclubTeam;

  await setDoc(teamRef, cleanedTeam);
  return team;
}

/**
 * Get a team by ID
 */
export async function getInterclubTeam(
  teamLeagueId: string,
  teamId: string
): Promise<InterclubTeam | null> {
  const docSnap = await getDoc(doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as InterclubTeam;
}

/**
 * Get all teams in a team league
 */
export async function getInterclubTeams(teamLeagueId: string): Promise<InterclubTeam[]> {
  const q = query(
    collection(db, 'teamLeagues', teamLeagueId, 'teams'),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as InterclubTeam);
}

/**
 * Get teams by status
 */
export async function getInterclubTeamsByStatus(
  teamLeagueId: string,
  status: TeamStatus
): Promise<InterclubTeam[]> {
  const q = query(
    collection(db, 'teamLeagues', teamLeagueId, 'teams'),
    where('status', '==', status),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as InterclubTeam);
}

/**
 * Subscribe to teams in a team league
 */
export function subscribeToInterclubTeams(
  teamLeagueId: string,
  callback: (teams: InterclubTeam[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'teamLeagues', teamLeagueId, 'teams'),
    orderBy('name', 'asc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => d.data() as InterclubTeam));
  });
}

/**
 * Update a team
 */
export async function updateInterclubTeam(
  teamLeagueId: string,
  teamId: string,
  updates: Partial<InterclubTeam>
): Promise<void> {
  console.log('[teamLeague.ts] updateInterclubTeam called', {
    teamLeagueId,
    teamId,
    updates,
  });

  try {
    await updateDoc(doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId), {
      ...updates,
      updatedAt: Date.now(),
    });
    console.log('[teamLeague.ts] updateInterclubTeam successful');
  } catch (error) {
    console.error('[teamLeague.ts] updateInterclubTeam FAILED', error);
    throw error;
  }
}

/**
 * Approve a team
 */
export async function approveTeam(
  teamLeagueId: string,
  teamId: string
): Promise<void> {
  console.log('[teamLeague.ts] approveTeam called', { teamLeagueId, teamId });
  await updateInterclubTeam(teamLeagueId, teamId, {
    status: 'approved',
  });
  console.log('[teamLeague.ts] approveTeam completed');
}

/**
 * Reject a team
 */
export async function rejectTeam(
  teamLeagueId: string,
  teamId: string,
  _reason?: string
): Promise<void> {
  console.log('[teamLeague.ts] rejectTeam called', { teamLeagueId, teamId });
  // Future: Store rejection reason
  await updateInterclubTeam(teamLeagueId, teamId, {
    status: 'rejected',
  });
  console.log('[teamLeague.ts] rejectTeam completed');
}

/**
 * Withdraw a team
 */
export async function withdrawTeam(
  teamLeagueId: string,
  teamId: string,
  reason: string,
  handling: 'auto_forfeit' | 'convert_to_bye' | 'remove_fixtures' | 'void_all'
): Promise<void> {
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const teamRef = doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId);

    // Update team status
    transaction.update(teamRef, {
      status: 'withdrawn',
      withdrawnAt: now,
      withdrawnReason: reason,
      withdrawalHandling: handling,
      updatedAt: now,
    });

    // Handle fixtures based on withdrawal option
    const fixturesSnap = await getDocs(
      query(
        collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
        where('status', 'in', ['scheduled', 'lineups_submitted', 'in_progress'])
      )
    );

    for (const fixtureDoc of fixturesSnap.docs) {
      const fixture = fixtureDoc.data() as TeamLeagueFixture;

      // Check if this team is involved
      const isHome = fixture.homeTeamId === teamId;
      const isAway = fixture.awayTeamId === teamId;
      if (!isHome && !isAway) continue;

      const fixtureRef = doc(db, 'teamLeagues', teamLeagueId, 'fixtures', fixture.id);

      switch (handling) {
        case 'auto_forfeit':
          // Set all boards to forfeit, opponent wins
          const boardsArray = Object.values(fixture.boards || {});
          const forfeitBoards: Record<string, FixtureBoardMatch> = {};
          for (const board of boardsArray) {
            forfeitBoards[board.boardMatchId] = {
              ...board,
              status: 'forfeit',
              winningSide: isHome ? 'away' : 'home',
            };
          }
          transaction.update(fixtureRef, {
            status: 'completed',
            boards: forfeitBoards,
            result: {
              homeBoardsWon: isHome ? 0 : boardsArray.length,
              awayBoardsWon: isAway ? 0 : boardsArray.length,
              winnerId: isHome ? 'away' : 'home',
            },
            scoreState: 'official',
            scoreLocked: true,
            updatedAt: now,
          });
          break;

        case 'convert_to_bye':
          // Change to bye fixture
          if (isHome) {
            transaction.update(fixtureRef, {
              homeTeamId: 'BYE',
              homeTeamName: 'BYE',
              status: 'completed',
              updatedAt: now,
            });
          } else {
            transaction.update(fixtureRef, {
              awayTeamId: 'BYE',
              awayTeamName: 'BYE',
              status: 'completed',
              updatedAt: now,
            });
          }
          break;

        case 'remove_fixtures':
          // Delete the fixture
          transaction.delete(fixtureRef);
          break;

        case 'void_all':
          // Mark fixture as cancelled
          transaction.update(fixtureRef, {
            status: 'cancelled',
            updatedAt: now,
          });
          break;
      }
    }

    // For void_all, also void completed fixtures
    if (handling === 'void_all') {
      const completedSnap = await getDocs(
        query(
          collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
          where('status', '==', 'completed')
        )
      );

      for (const fixtureDoc of completedSnap.docs) {
        const fixture = fixtureDoc.data() as TeamLeagueFixture;
        if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) {
          transaction.update(doc(db, 'teamLeagues', teamLeagueId, 'fixtures', fixture.id), {
            status: 'cancelled',
            updatedAt: now,
          });
        }
      }
    }
  });
}

// ============================================
// ROSTER MANAGEMENT
// ============================================

/**
 * Add a player to team roster
 */
export async function addPlayerToRoster(
  teamLeagueId: string,
  teamId: string,
  player: {
    playerId: string;
    playerName: string;
    gender?: 'male' | 'female' | 'other';
    duprId?: string;
    duprRating?: number;
  },
  addedBy: string
): Promise<void> {
  const team = await getInterclubTeam(teamLeagueId, teamId);
  if (!team) throw new Error('Team not found');

  // Check if player already on roster
  if (team.roster.some(p => p.playerId === player.playerId)) {
    throw new Error('Player already on roster');
  }

  const now = Date.now();
  const newPlayer: TeamRosterPlayer = {
    playerId: player.playerId,
    playerName: player.playerName,
    gender: player.gender,
    duprId: player.duprId,
    duprRatingAtRegistration: player.duprRating,
    currentDuprRating: player.duprRating,
    isCaptain: false,
    isPlayingCaptain: false,
    playerType: 'rostered',
    eligibleForLineup: false, // Must accept waiver
    addedAt: now,
    addedBy,
  };

  await updateDoc(doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId), {
    roster: [...team.roster, newPlayer],
    updatedAt: now,
  });
}

/**
 * Remove a player from roster
 */
export async function removePlayerFromRoster(
  teamLeagueId: string,
  teamId: string,
  playerId: string
): Promise<void> {
  const team = await getInterclubTeam(teamLeagueId, teamId);
  if (!team) throw new Error('Team not found');

  // Cannot remove captain
  if (team.captainId === playerId) {
    throw new Error('Cannot remove team captain');
  }

  const updatedRoster = team.roster.filter(p => p.playerId !== playerId);

  await updateDoc(doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId), {
    roster: updatedRoster,
    updatedAt: Date.now(),
  });
}

/**
 * Player accepts their own waivers
 */
export async function acceptPlayerWaivers(
  teamLeagueId: string,
  teamId: string,
  playerId: string,
  acceptances: {
    liabilityWaiver: boolean;
    duprWaiver?: boolean;
  },
  waiverVersion: string,
  duprWaiverVersion?: string
): Promise<void> {
  if (!acceptances.liabilityWaiver) {
    throw new Error('Liability waiver acceptance is required');
  }

  const now = Date.now();
  const teamRef = doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId);

  await runTransaction(db, async (transaction) => {
    const teamDoc = await transaction.get(teamRef);
    if (!teamDoc.exists()) throw new Error('Team not found');

    const team = teamDoc.data() as InterclubTeam;
    const playerIndex = team.roster.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) throw new Error('Player not found on roster');

    const updatedRoster = [...team.roster];
    const player = { ...updatedRoster[playerIndex] };

    player.waiverAcceptance = {
      accepted: true,
      acceptedAt: now,
      acceptedBy: playerId,
      waiverVersion,
    };

    if (acceptances.duprWaiver && duprWaiverVersion) {
      player.duprWaiverAcceptance = {
        accepted: true,
        acceptedAt: now,
        acceptedBy: playerId,
        waiverVersion: duprWaiverVersion,
      };
    }

    player.eligibleForLineup = true;
    updatedRoster[playerIndex] = player;

    transaction.update(teamRef, {
      roster: updatedRoster,
      updatedAt: now,
    });
  });
}

/**
 * Update player seeding
 */
export async function updatePlayerSeeding(
  teamLeagueId: string,
  teamId: string,
  playerSeeds: { playerId: string; seedNumber: number }[]
): Promise<void> {
  const team = await getInterclubTeam(teamLeagueId, teamId);
  if (!team) throw new Error('Team not found');

  const updatedRoster = team.roster.map(player => {
    const seedInfo = playerSeeds.find(s => s.playerId === player.playerId);
    return seedInfo
      ? { ...player, seedNumber: seedInfo.seedNumber, captainOverrideSeed: seedInfo.seedNumber }
      : player;
  });

  await updateDoc(doc(db, 'teamLeagues', teamLeagueId, 'teams', teamId), {
    roster: updatedRoster,
    updatedAt: Date.now(),
  });
}

// ============================================
// FIXTURE CRUD
// ============================================

/**
 * Create initial boards as a map (Record<string, FixtureBoardMatch>)
 *
 * ⚠️ Boards stored as map for atomic per-board updates
 */
function createInitialBoardsMap(
  fixtureId: string,
  boardConfigs: TeamLeagueBoardConfig[]
): Record<string, FixtureBoardMatch> {
  const boards: Record<string, FixtureBoardMatch> = {};

  for (const config of boardConfigs) {
    const boardMatchId = `${fixtureId}_${config.id}`;
    boards[boardMatchId] = {
      boardMatchId,
      boardConfigId: config.id,
      boardNumber: config.order,
      status: 'scheduled',
      homePlayerIds: [],
      awayPlayerIds: [],
      homePlayerNames: [],
      awayPlayerNames: [],
    };
  }

  return boards;
}

/**
 * Create a fixture
 *
 * ⚠️ Requires homeCaptainId and awayCaptainId for Firestore rules
 * ⚠️ Uses Record<string, FixtureBoardMatch> for boards
 */
export async function createFixture(
  teamLeagueId: string,
  fixtureData: {
    homeTeamId: string;
    homeTeamName: string;
    homeCaptainId: string;
    awayTeamId: string;
    awayTeamName: string;
    awayCaptainId: string;
    weekNumber: number;
    scheduledDate: string;
    scheduledTime: string;
    venueId?: string;
    venueName?: string;
  },
  boardConfigs: TeamLeagueBoardConfig[],
  createdBy: string,
  createdByName: string
): Promise<TeamLeagueFixture> {
  const fixtureRef = doc(collection(db, 'teamLeagues', teamLeagueId, 'fixtures'));
  const now = Date.now();

  // Create boards as a map (Record<string, FixtureBoardMatch>)
  const boards = createInitialBoardsMap(fixtureRef.id, boardConfigs);

  const auditEntry = createAuditEntry(
    'fixture_created',
    createdBy,
    createdByName,
    {
      homeTeam: fixtureData.homeTeamName,
      awayTeam: fixtureData.awayTeamName,
      weekNumber: fixtureData.weekNumber,
    }
  );

  const fixture: TeamLeagueFixture = {
    id: fixtureRef.id,
    teamLeagueId,
    homeTeamId: fixtureData.homeTeamId,
    homeTeamName: fixtureData.homeTeamName,
    homeCaptainId: fixtureData.homeCaptainId,
    awayTeamId: fixtureData.awayTeamId,
    awayTeamName: fixtureData.awayTeamName,
    awayCaptainId: fixtureData.awayCaptainId,
    weekNumber: fixtureData.weekNumber,
    scheduledDate: fixtureData.scheduledDate,
    scheduledTime: fixtureData.scheduledTime,
    venueId: fixtureData.venueId,
    venueName: fixtureData.venueName,
    status: 'scheduled',
    boards,
    scoreState: 'none',
    scoreLocked: false,
    auditLog: [auditEntry],
    createdAt: now,
    updatedAt: now,
  };

  // Clean undefined values
  const cleanedFixture = Object.fromEntries(
    Object.entries(fixture).filter(([_, v]) => v !== undefined)
  ) as TeamLeagueFixture;

  await setDoc(fixtureRef, cleanedFixture);
  return fixture;
}

/**
 * Get a fixture by ID
 */
export async function getFixture(
  teamLeagueId: string,
  fixtureId: string
): Promise<TeamLeagueFixture | null> {
  const docSnap = await getDoc(doc(db, 'teamLeagues', teamLeagueId, 'fixtures', fixtureId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as TeamLeagueFixture;
}

/**
 * Get all fixtures in a league
 */
export async function getFixtures(teamLeagueId: string): Promise<TeamLeagueFixture[]> {
  const q = query(
    collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
    orderBy('weekNumber', 'asc'),
    orderBy('scheduledDate', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as TeamLeagueFixture);
}

/**
 * Get fixtures by week
 */
export async function getFixturesByWeek(
  teamLeagueId: string,
  weekNumber: number
): Promise<TeamLeagueFixture[]> {
  const q = query(
    collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
    where('weekNumber', '==', weekNumber),
    orderBy('scheduledDate', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as TeamLeagueFixture);
}

/**
 * Get fixtures for a team
 */
export async function getTeamFixtures(
  teamLeagueId: string,
  teamId: string
): Promise<TeamLeagueFixture[]> {
  // Get home fixtures
  const homeQ = query(
    collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
    where('homeTeamId', '==', teamId)
  );
  const homeSnap = await getDocs(homeQ);

  // Get away fixtures
  const awayQ = query(
    collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
    where('awayTeamId', '==', teamId)
  );
  const awaySnap = await getDocs(awayQ);

  const fixtures = [
    ...homeSnap.docs.map(d => d.data() as TeamLeagueFixture),
    ...awaySnap.docs.map(d => d.data() as TeamLeagueFixture),
  ];

  // Sort by week/date
  return fixtures.sort((a, b) => {
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.scheduledDate.localeCompare(b.scheduledDate);
  });
}

/**
 * Subscribe to fixtures
 */
export function subscribeToFixtures(
  teamLeagueId: string,
  callback: (fixtures: TeamLeagueFixture[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'teamLeagues', teamLeagueId, 'fixtures'),
    orderBy('weekNumber', 'asc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => d.data() as TeamLeagueFixture));
  });
}

/**
 * Update a fixture
 */
export async function updateFixture(
  teamLeagueId: string,
  fixtureId: string,
  updates: Partial<TeamLeagueFixture>
): Promise<void> {
  await updateDoc(doc(db, 'teamLeagues', teamLeagueId, 'fixtures', fixtureId), {
    ...updates,
    updatedAt: Date.now(),
  });
}

// ============================================
// LINEUP MANAGEMENT
// ============================================

/**
 * Board assignment for lineup submission
 */
interface BoardAssignment {
  boardConfigId: string;
  playerIds: string[];
  playerNames: string[];
  duprIds?: string[];
}

/**
 * Submit team lineup
 *
 * ⚠️ Uses FixtureLineupPlayer[] for lineup
 * ⚠️ Updates boards map using Object.entries/Object.fromEntries
 */
export async function submitLineup(
  teamLeagueId: string,
  fixtureId: string,
  teamId: string,
  teamName: string,
  lineupPlayers: FixtureLineupPlayer[],
  boardAssignments: BoardAssignment[],
  submittedBy: string,
  submittedByName: string
): Promise<void> {
  const fixture = await getFixture(teamLeagueId, fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  const isHome = teamId === fixture.homeTeamId;
  const isAway = teamId === fixture.awayTeamId;
  if (!isHome && !isAway) throw new Error('Team not part of this fixture');

  const now = Date.now();

  // Check if lineup is locked
  if (fixture.lineupLockedAt && fixture.lineupLockedAt < now) {
    throw new Error('Lineup is locked');
  }

  const auditEntry = createAuditEntry(
    'lineup_submitted',
    submittedBy,
    submittedByName,
    {
      team: isHome ? 'home' : 'away',
      teamName,
      boardAssignments: boardAssignments.length,
    },
    teamId
  );

  // Update boards with player assignments (boards is a Record/map)
  const updatedBoards: Record<string, FixtureBoardMatch> = {};
  for (const [boardMatchId, board] of Object.entries(fixture.boards || {})) {
    const assignment = boardAssignments.find(a => a.boardConfigId === board.boardConfigId);
    if (!assignment) {
      updatedBoards[boardMatchId] = board;
      continue;
    }

    if (isHome) {
      updatedBoards[boardMatchId] = {
        ...board,
        homePlayerIds: assignment.playerIds,
        homePlayerNames: assignment.playerNames,
      };
    } else {
      updatedBoards[boardMatchId] = {
        ...board,
        awayPlayerIds: assignment.playerIds,
        awayPlayerNames: assignment.playerNames,
      };
    }
  }

  const updates: Partial<TeamLeagueFixture> = {
    boards: updatedBoards,
    auditLog: [...(fixture.auditLog || []), auditEntry],
    updatedAt: now,
  };

  if (isHome) {
    updates.homeLineup = lineupPlayers;
  } else {
    updates.awayLineup = lineupPlayers;
  }

  // Check if both lineups submitted
  const hasHomeLineup = isHome || (fixture.homeLineup && fixture.homeLineup.length > 0);
  const hasAwayLineup = isAway || (fixture.awayLineup && fixture.awayLineup.length > 0);
  if (hasHomeLineup && hasAwayLineup) {
    updates.status = 'lineups_submitted';
  }

  await updateFixture(teamLeagueId, fixtureId, updates);
}

/**
 * Unlock lineup (organizer action)
 */
export async function unlockLineup(
  teamLeagueId: string,
  fixtureId: string,
  team: 'home' | 'away',
  reason: string,
  unlockedBy: string,
  unlockedByName: string
): Promise<void> {
  const fixture = await getFixture(teamLeagueId, fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  const now = Date.now();

  const auditEntry = createAuditEntry(
    'lineup_unlocked',
    unlockedBy,
    unlockedByName,
    {
      team,
      teamName: team === 'home' ? fixture.homeTeamName : fixture.awayTeamName,
      reason,
      previousLockedAt: fixture.lineupLockedAt,
    }
  );

  await updateFixture(teamLeagueId, fixtureId, {
    lineupUnlockedBy: unlockedBy,
    lineupUnlockedAt: now,
    lineupUnlockReason: reason,
    auditLog: [...(fixture.auditLog || []), auditEntry],
  });
}

// ============================================
// SCORING
// ============================================

/**
 * Propose fixture scores (captain action)
 */
export async function proposeFixtureScores(
  teamLeagueId: string,
  fixtureId: string,
  boardScores: { boardMatchId: string; scores: { gameNumber: number; scoreA: number; scoreB: number }[]; winnerId: 'home' | 'away' }[],
  proposedBy: string,
  proposedByName: string,
  proposedByTeam: 'home' | 'away'
): Promise<void> {
  const fixture = await getFixture(teamLeagueId, fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  if (fixture.scoreLocked) {
    throw new Error('Scores are locked');
  }

  const now = Date.now();

  // Update boards with scores (boards is a Record/map)
  const updatedBoards: Record<string, FixtureBoardMatch> = {};
  for (const [boardMatchId, board] of Object.entries(fixture.boards || {})) {
    const scoreData = boardScores.find(s => s.boardMatchId === board.boardMatchId);
    if (!scoreData) {
      updatedBoards[boardMatchId] = board;
      continue;
    }

    updatedBoards[boardMatchId] = {
      ...board,
      scores: scoreData.scores,
      winningSide: scoreData.winnerId,
      status: 'played',
      completedAt: now,
    };
  }

  // Calculate aggregate result
  let homeBoardsWon = 0;
  let awayBoardsWon = 0;
  for (const board of Object.values(updatedBoards)) {
    if (board.winningSide === 'home') homeBoardsWon++;
    else if (board.winningSide === 'away') awayBoardsWon++;
  }

  const scoreSnapshot = {
    boards: boardScores.map(b => ({
      boardMatchId: b.boardMatchId,
      scores: b.scores,
      winnerId: b.winnerId,
    })),
  };

  const auditEntry = createAuditEntry(
    'scores_proposed',
    proposedBy,
    proposedByName,
    {
      team: proposedByTeam,
      homeBoardsWon,
      awayBoardsWon,
    },
    proposedByTeam === 'home' ? fixture.homeTeamId : fixture.awayTeamId,
    scoreSnapshot
  );

  await updateFixture(teamLeagueId, fixtureId, {
    boards: updatedBoards,
    result: {
      homeBoardsWon,
      awayBoardsWon,
      winnerId: homeBoardsWon > awayBoardsWon ? 'home' : awayBoardsWon > homeBoardsWon ? 'away' : 'draw',
    },
    scoreState: 'proposed',
    scoreProposal: {
      proposedBy,
      proposedAt: now,
      proposedByTeam,
    },
    status: 'in_progress',
    auditLog: [...(fixture.auditLog || []), auditEntry],
  });
}

/**
 * Confirm fixture scores (opposing captain action)
 */
export async function confirmFixtureScores(
  teamLeagueId: string,
  fixtureId: string,
  confirmedBy: string,
  confirmedByName: string
): Promise<void> {
  const fixture = await getFixture(teamLeagueId, fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  if (fixture.scoreState !== 'proposed') {
    throw new Error('No proposed scores to confirm');
  }

  const boardsArray = Object.values(fixture.boards || {});
  const scoreSnapshot = {
    boards: boardsArray
      .filter(b => (b.scores || []).length > 0)
      .map(b => ({
        boardMatchId: b.boardMatchId,
        scores: b.scores || [],
        winnerId: b.winningSide,
      })),
  };

  const auditEntry = createAuditEntry(
    'scores_confirmed',
    confirmedBy,
    confirmedByName,
    {
      homeBoardsWon: fixture.result?.homeBoardsWon,
      awayBoardsWon: fixture.result?.awayBoardsWon,
    },
    undefined,
    scoreSnapshot
  );

  await updateFixture(teamLeagueId, fixtureId, {
    scoreState: 'signed',
    auditLog: [...(fixture.auditLog || []), auditEntry],
  });
}

/**
 * Dispute fixture scores
 */
export async function disputeFixtureScores(
  teamLeagueId: string,
  fixtureId: string,
  disputedBy: string,
  disputedByName: string,
  reason: string
): Promise<void> {
  const fixture = await getFixture(teamLeagueId, fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  const auditEntry = createAuditEntry(
    'scores_disputed',
    disputedBy,
    disputedByName,
    { reason }
  );

  await updateFixture(teamLeagueId, fixtureId, {
    scoreState: 'disputed',
    auditLog: [...(fixture.auditLog || []), auditEntry],
  });
}

/**
 * Finalize fixture (organizer action)
 *
 * ⚠️ Uses Record<string, FixtureBoardMatch> for boards
 */
export async function finalizeFixture(
  teamLeagueId: string,
  fixtureId: string,
  finalizedBy: string,
  finalizedByName: string,
  overrideScores?: { boardMatchId: string; scores: { gameNumber: number; scoreA: number; scoreB: number }[]; winnerId: 'home' | 'away' }[]
): Promise<void> {
  const fixture = await getFixture(teamLeagueId, fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  const now = Date.now();

  let finalBoards: Record<string, FixtureBoardMatch> = { ...fixture.boards };

  // Apply override scores if provided
  if (overrideScores) {
    for (const [boardMatchId, board] of Object.entries(fixture.boards || {})) {
      const override = overrideScores.find(s => s.boardMatchId === board.boardMatchId);
      if (!override) {
        finalBoards[boardMatchId] = board;
        continue;
      }

      finalBoards[boardMatchId] = {
        ...board,
        scores: override.scores,
        winningSide: override.winnerId,
        status: 'played',
        completedAt: board.completedAt || now,
      };
    }
  }

  // Calculate final result
  let homeBoardsWon = 0;
  let awayBoardsWon = 0;
  for (const board of Object.values(finalBoards)) {
    if (board.winningSide === 'home') homeBoardsWon++;
    else if (board.winningSide === 'away') awayBoardsWon++;
  }

  const winnerId = homeBoardsWon > awayBoardsWon ? 'home' : awayBoardsWon > homeBoardsWon ? 'away' : 'draw';

  const boardsArray = Object.values(finalBoards);
  const scoreSnapshot = {
    boards: boardsArray
      .filter(b => (b.scores || []).length > 0)
      .map(b => ({
        boardMatchId: b.boardMatchId,
        scores: b.scores || [],
        winnerId: b.winningSide,
      })),
  };

  const auditEntry = createAuditEntry(
    'fixture_finalized',
    finalizedBy,
    finalizedByName,
    {
      homeBoardsWon,
      awayBoardsWon,
      winnerId,
      wasOverride: !!overrideScores,
    },
    undefined,
    scoreSnapshot
  );

  await updateFixture(teamLeagueId, fixtureId, {
    boards: finalBoards,
    result: { homeBoardsWon, awayBoardsWon, winnerId },
    officialResult: {
      boards: finalBoards,
      homeBoardsWon,
      awayBoardsWon,
      winnerId,
      finalizedBy,
      finalizedAt: now,
    },
    scoreState: 'official',
    scoreLocked: true,
    status: 'finalized',
    finalizedAt: now,
    finalizedBy,
    auditLog: [...(fixture.auditLog || []), auditEntry],
  });

  // Update team stats
  await updateTeamStatsAfterFixture(teamLeagueId, fixture.homeTeamId, fixture.awayTeamId);
}

/**
 * Calculate team stats from fixtures
 *
 * ⚠️ Uses TeamLeague type (flattened settings at root)
 */
function calculateTeamStats(
  team: InterclubTeam,
  fixtures: TeamLeagueFixture[],
  teamLeague: TeamLeague
): InterclubTeam['stats'] {
  const stats: InterclubTeam['stats'] = {
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    boardsWon: 0,
    boardsLost: 0,
    boardDiff: 0,
    points: 0,
  };

  for (const fixture of fixtures) {
    // Only count finalized fixtures with official results
    if (fixture.status !== 'finalized' || !fixture.officialResult) continue;

    const isHome = fixture.homeTeamId === team.id;
    const isAway = fixture.awayTeamId === team.id;
    if (!isHome && !isAway) continue;

    stats.played++;

    const result = fixture.officialResult;
    const teamBoardsWon = isHome ? result.homeBoardsWon : result.awayBoardsWon;
    const opponentBoardsWon = isHome ? result.awayBoardsWon : result.homeBoardsWon;

    stats.boardsWon += teamBoardsWon;
    stats.boardsLost += opponentBoardsWon;

    if (teamBoardsWon > opponentBoardsWon) {
      stats.wins++;
      stats.points += teamLeague.pointsPerMatchWin;
    } else if (teamBoardsWon < opponentBoardsWon) {
      stats.losses++;
    } else {
      stats.draws++;
      stats.points += 1; // Draw points
    }

    stats.points += teamBoardsWon * teamLeague.pointsPerBoardWin;
  }

  stats.boardDiff = stats.boardsWon - stats.boardsLost;

  return stats;
}

/**
 * Update team stats after fixture completion
 */
async function updateTeamStatsAfterFixture(
  teamLeagueId: string,
  homeTeamId: string,
  awayTeamId: string
): Promise<void> {
  const fixtures = await getFixtures(teamLeagueId);
  const teamLeague = await getTeamLeague(teamLeagueId);
  if (!teamLeague) return;

  // Update home team
  if (homeTeamId !== 'BYE') {
    const homeTeam = await getInterclubTeam(teamLeagueId, homeTeamId);
    if (homeTeam) {
      const stats = calculateTeamStats(homeTeam, fixtures, teamLeague);
      await updateInterclubTeam(teamLeagueId, homeTeamId, { stats });
    }
  }

  // Update away team
  if (awayTeamId !== 'BYE') {
    const awayTeam = await getInterclubTeam(teamLeagueId, awayTeamId);
    if (awayTeam) {
      const stats = calculateTeamStats(awayTeam, fixtures, teamLeague);
      await updateInterclubTeam(teamLeagueId, awayTeamId, { stats });
    }
  }
}

// ============================================
// STANDINGS
// ============================================

/**
 * Calculate standings for all teams
 *
 * ⚠️ Uses TeamLeague type (flattened settings at root)
 */
export async function calculateStandings(
  teamLeagueId: string
): Promise<TeamLeagueStanding[]> {
  const teams = await getInterclubTeams(teamLeagueId);
  const fixtures = await getFixtures(teamLeagueId);
  const teamLeague = await getTeamLeague(teamLeagueId);

  if (!teamLeague) {
    throw new Error('Team league not found');
  }

  const standings: TeamLeagueStanding[] = teams
    .filter(t => t.status !== 'pending_approval' && t.status !== 'rejected')
    .map(team => ({
      teamId: team.id,
      teamName: team.name,
      rank: 0,
      stats: calculateTeamStats(team, fixtures, teamLeague),
      withdrawn: team.status === 'withdrawn',
    }));

  // Sort by tiebreaker order
  standings.sort((a, b) => {
    // Withdrawn teams go to bottom
    if (a.withdrawn && !b.withdrawn) return 1;
    if (!a.withdrawn && b.withdrawn) return -1;

    for (const tiebreaker of teamLeague.tieBreakerOrder) {
      let diff = 0;
      switch (tiebreaker) {
        case 'matchWins':
          diff = b.stats.wins - a.stats.wins;
          break;
        case 'boardDiff':
          diff = b.stats.boardDiff - a.stats.boardDiff;
          break;
        case 'pointDiff':
          diff = b.stats.points - a.stats.points;
          break;
        // headToHead would need additional logic
      }
      if (diff !== 0) return diff;
    }

    // Final tiebreaker: points
    return b.stats.points - a.stats.points;
  });

  // Assign ranks
  standings.forEach((standing, index) => {
    standing.rank = standing.withdrawn ? 0 : index + 1;
  });

  return standings;
}

// ============================================
// SCHEDULE GENERATION
// ============================================

/**
 * Generate round-robin schedule for team league
 */
export async function generateTeamLeagueSchedule(
  teamLeagueId: string,
  options: {
    startDate: string;
    dayOfWeek: number; // 0 = Sunday, 6 = Saturday
    defaultTime: string;
    defaultVenueId?: string;
    defaultVenueName?: string;
  },
  createdBy: string,
  createdByName: string
): Promise<TeamLeagueFixture[]> {
  const teams = await getInterclubTeamsByStatus(teamLeagueId, 'approved_paid');

  if (teams.length < 2) {
    throw new Error('Need at least 2 approved teams to generate schedule');
  }

  const teamLeague = await getTeamLeague(teamLeagueId);
  if (!teamLeague || !teamLeague.boards.length) {
    throw new Error('Board configuration required');
  }

  // Build team lookup maps
  const teamIds = teams.map(t => t.id);
  const teamNames = new Map(teams.map(t => [t.id, t.name]));
  const captainIds = new Map(teams.map(t => [t.id, t.captainId]));

  // Add BYE if odd number of teams
  if (teamIds.length % 2 !== 0) {
    teamIds.push('BYE');
    teamNames.set('BYE', 'BYE');
    captainIds.set('BYE', 'BYE');
  }

  const n = teamIds.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;

  const fixtures: TeamLeagueFixture[] = [];
  const rotation = [...teamIds];

  for (let round = 0; round < rounds; round++) {
    // Calculate date for this week
    const startDateObj = new Date(options.startDate);
    const weekOffset = round * 7;
    const fixtureDate = new Date(startDateObj.getTime() + weekOffset * 24 * 60 * 60 * 1000);

    // Adjust to correct day of week
    const currentDay = fixtureDate.getDay();
    const daysToAdd = (options.dayOfWeek - currentDay + 7) % 7;
    fixtureDate.setDate(fixtureDate.getDate() + daysToAdd);

    const dateStr = fixtureDate.toISOString().split('T')[0];

    for (let match = 0; match < matchesPerRound; match++) {
      const homeIdx = match;
      const awayIdx = n - 1 - match;
      const homeTeamId = rotation[homeIdx];
      const awayTeamId = rotation[awayIdx];

      // Skip if both are BYE (shouldn't happen)
      if (homeTeamId === 'BYE' && awayTeamId === 'BYE') continue;

      const fixture = await createFixture(
        teamLeagueId,
        {
          homeTeamId,
          homeTeamName: teamNames.get(homeTeamId) || 'Unknown',
          homeCaptainId: captainIds.get(homeTeamId) || 'BYE',
          awayTeamId,
          awayTeamName: teamNames.get(awayTeamId) || 'Unknown',
          awayCaptainId: captainIds.get(awayTeamId) || 'BYE',
          weekNumber: round + 1,
          scheduledDate: dateStr,
          scheduledTime: options.defaultTime,
          venueId: options.defaultVenueId,
          venueName: options.defaultVenueName,
        },
        teamLeague.boards,
        createdBy,
        createdByName
      );

      fixtures.push(fixture);
    }

    // Rotate teams (keep first team fixed for round-robin)
    const last = rotation.pop()!;
    rotation.splice(1, 0, last);
  }

  return fixtures;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate lineup before submission
 */
export function validateLineup(
  team: InterclubTeam,
  boardAssignments: BoardAssignment[],
  boardConfigs: TeamLeagueBoardConfig[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const assignment of boardAssignments) {
    const boardConfig = boardConfigs.find(b => b.id === assignment.boardConfigId);
    if (!boardConfig) {
      errors.push(`Invalid board ID: ${assignment.boardConfigId}`);
      continue;
    }

    // Check player count
    const expectedPlayers = boardConfig.format === 'singles' ? 1 : 2;
    if (assignment.playerIds.length !== expectedPlayers) {
      errors.push(`Board ${boardConfig.id} requires ${expectedPlayers} player(s)`);
    }

    // Check players are on roster and eligible
    for (const playerId of assignment.playerIds) {
      const player = team.roster.find(p => p.playerId === playerId);

      if (!player) {
        errors.push(`Player ${playerId} is not on the roster`);
        continue;
      }

      if (!player.eligibleForLineup) {
        errors.push(`${player.playerName} has not completed their waivers`);
      }
    }

    // Check gender requirements for mixed doubles
    if (boardConfig.format === 'mixed' && assignment.playerIds.length === 2) {
      const players = assignment.playerIds.map((id: string) =>
        team.roster.find(p => p.playerId === id)
      );

      const hasMale = players.some((p: TeamRosterPlayer | undefined) => p?.gender === 'male');
      const hasFemale = players.some((p: TeamRosterPlayer | undefined) => p?.gender === 'female');

      if (!hasMale || !hasFemale) {
        errors.push(`Mixed doubles board requires one male and one female player`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
