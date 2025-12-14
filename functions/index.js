
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cors = require('cors');

admin.initializeApp();
const db = admin.firestore();

// --- Helpers ---

/**
 * Deterministic team id based on tournamentId|divisionId|sorted(playerIds)
 * -> returns team_<sha256 hex>
 */
function deterministicTeamId(tournamentId, divisionId, playerIds) {
  const sorted = (playerIds || []).slice().sort();
  const input = `${tournamentId}|${divisionId}|${sorted.join(',')}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `team_${hash}`;
}

async function isOrganizerOrAdmin(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return false;
  const data = snap.data();
  const roles = data.roles || [];
  return roles.includes('organizer') || roles.includes('admin') || data.isRootAdmin === true;
}

async function isParticipantOrOrganizer(uid, matchData) {
    if (await isOrganizerOrAdmin(uid)) return true;
    
    // Check if uid is directly in teamA or teamB (e.g. singles or cached id)
    if (matchData.teamAId === uid || matchData.teamBId === uid) return true;
    
    // Check Team collections
    try {
      const teamA = await db.collection('teams').doc(matchData.teamAId).get();
      const teamB = await db.collection('teams').doc(matchData.teamBId).get();
      
      const playersA = teamA.exists ? (teamA.data().players || []) : [];
      const playersB = teamB.exists ? (teamB.data().players || []) : [];
      
      return playersA.includes(uid) || playersB.includes(uid);
    } catch (e) {
      console.warn('Error checking participation', e);
      return false;
    }
}

// --- Auth Helper ---

async function validateAuth(req) {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    const e = new Error('Unauthorized: No token provided');
    e.httpStatus = 401;
    throw e;
  }
  try {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error("Auth verification failed:", error);
    const e = new Error('Unauthorized: Invalid token');
    e.httpStatus = 401;
    throw e;
  }
}

// --- Request Handler Wrapper (Manual CORS + Auth) ---

const DEBUG_BYPASS_AUTH = (process.env.DEBUG_BYPASS_AUTH === '1' || process.env.DEBUG_BYPASS_AUTH === 'true');

// Reusable CORS middleware (we'll also handle OPTIONS explicitly below)
const corsMiddleware = cors({ origin: true, credentials: true });

const createHandler = (handler) => {
  return functions.https.onRequest((req, res) => {
    // Log incoming request for debugging
    console.info('request method=', req.method, 'origin=', req.get('Origin'));

    // 1) Handle preflight explicitly and *immediately* with correct headers
    if (req.method === 'OPTIONS') {
      const origin = req.get('Origin') || '*';
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Max-Age', '3600');
      // If your client uses credentials (cookies / Authorization), include this:
      res.set('Access-Control-Allow-Credentials', 'true');
      return res.status(204).send('');
    }

    // 2) For real requests use the CORS middleware to set headers and then run handler
    corsMiddleware(req, res, async () => {
      // Only allow POST in this API
      if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' });
      }

      try {
        let uid;
        if (DEBUG_BYPASS_AUTH) {
          uid = 'debug-bypass-uid';
          console.log('DEBUG_BYPASS_AUTH enabled - skipping real auth, uid=', uid);
        } else {
          // Validate auth (your existing validateAuth). 
          uid = await validateAuth(req);
        }
        
        if (!uid) {
            // Should be handled by validateAuth throwing, but just in case
            throw new Error('Authentication failed');
        }

        const result = await handler(req.body, uid);
        
        // Echo origin to be safe (cors middleware already sets a header but this ensures it)
        res.set('Access-Control-Allow-Origin', req.get('Origin') || '*');
        res.set('Access-Control-Allow-Credentials', 'true');
        return res.status(200).json(result || { success: true });
      } catch (err) {
        console.error('Function error:', err);
        const status = err.httpStatus || 500;
        // Ensure headers are set on error too so browser can read the error message
        res.set('Access-Control-Allow-Origin', req.get('Origin') || '*');
        res.set('Access-Control-Allow-Credentials', 'true');
        return res.status(status).json({ error: err.message || 'Internal error' });
      }
    });
  });
};

// --- Functions ---

exports.createTeam = createHandler(async (data, uid) => {
  const tournamentId = data?.tournamentId;
  const competitionId = data?.competitionId;
  const divisionId = data?.divisionId;
  const playerIds = data?.playerIds;
  const teamName = data?.teamName || null;

  const eventId = tournamentId || competitionId;

  if (!eventId || !divisionId || !Array.isArray(playerIds) || playerIds.length === 0) {
    const e = new Error('tournamentId/competitionId, divisionId and playerIds are required.');
    e.httpStatus = 400; throw e;
  }

  const teamId = deterministicTeamId(eventId, divisionId, playerIds);

  const result = await db.runTransaction(async (tx) => {
    const teamRef = db.collection('teams').doc(teamId);
    const teamSnap = await tx.get(teamRef);

    if (teamSnap.exists) {
      return { existed: true, teamId, team: teamSnap.data() };
    }

    const now = Date.now();
    const teamDoc = {
      id: teamId,
      divisionId,
      players: playerIds.slice().sort(),
      teamName,
      createdByUserId: uid,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    
    if (tournamentId) teamDoc.tournamentId = tournamentId;
    if (competitionId) teamDoc.competitionId = competitionId;

    tx.set(teamRef, teamDoc);

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      action: 'create_team',
      actorId: uid,
      timestamp: now,
      details: { teamId, eventId }
    });

    return { existed: false, teamId, team: teamDoc };
  });

  return result;
});

exports.createCompetition = createHandler(async (data, uid) => {
  if (!(await isOrganizerOrAdmin(uid))) {
    const e = new Error('Must be organiser or admin');
    e.httpStatus = 403; throw e;
  }

  const comp = data.competition;
  if (!comp) throw new Error("Missing competition data");

  // Force system fields
  comp.organiserId = uid;
  comp.createdAt = Date.now();
  comp.status = 'draft';

  const docRef = db.collection('competitions').doc(comp.id);
  await docRef.set(comp);

  await db.collection('auditLogs').add({
    action: 'create_competition',
    actorId: uid,
    entityId: comp.id,
    timestamp: Date.now(),
    details: { name: comp.name }
  });

  return { id: docRef.id };
});

exports.generateLeagueSchedule = createHandler(async (data, uid) => {
  const competitionId = data.competitionId;
  const compRef = db.collection('competitions').doc(competitionId);
  const compSnap = await compRef.get();
  
  if (!compSnap.exists) {
      const e = new Error('Competition not found');
      e.httpStatus = 404; throw e;
  }
  
  const comp = compSnap.data();
  if (comp.organiserId !== uid && !(await isOrganizerOrAdmin(uid))) {
    const e = new Error('Not authorised');
    e.httpStatus = 403; throw e;
  }

  const isTeamLeague = comp.type === 'team_league';
  // Use new TeamLeagueSettings if available, fallback to legacy teamMatchConfig
  const teamLeagueSettings = comp.settings && comp.settings.teamLeague;
  const legacyConfig = comp.settings && comp.settings.teamMatchConfig;
  const teamBoardsConfig = teamLeagueSettings ? teamLeagueSettings.boards : (legacyConfig ? legacyConfig.boards : []);

  // 1. Fetch Entries
  const entriesSnap = await db.collection('competitionEntries')
    .where('competitionId', '==', competitionId)
    .where('status', '==', 'active')
    .get();
  
  const entries = entriesSnap.docs.map(d => d.data());
  const entriesByDivision = {};

  if (comp.divisions && comp.divisions.length > 0) {
      comp.divisions.forEach(d => entriesByDivision[d.id] = []);
      entries.forEach(e => {
          if (e.divisionId && entriesByDivision[e.divisionId]) {
              entriesByDivision[e.divisionId].push(e);
          }
      });
  } else {
      entriesByDivision['default'] = entries;
  }

  const batch = db.batch();
  let matchesCount = 0;

  // 2. Generate Logic
  for (const [divId, divEntries] of Object.entries(entriesByDivision)) {
      if (divEntries.length < 2) continue;

      // Initialize Standings
      divEntries.forEach(e => {
          const teamId = e.teamId || e.playerId || 'unknown';
          const standingId = divId === 'default' 
            ? `${competitionId}_${teamId}` 
            : `${competitionId}_${divId}_${teamId}`;
          
          const sRef = db.collection('standings').doc(standingId);
          batch.set(sRef, {
              competitionId,
              divisionId: divId === 'default' ? null : divId,
              teamId,
              teamName: teamId,
              played: 0, wins: 0, losses: 0, draws: 0, 
              pointsFor: 0, pointsAgainst: 0, pointDifference: 0, 
              points: 0,
              boardWins: 0, boardLosses: 0,
              updatedAt: Date.now()
          }, { merge: true });
      });

      // Round Robin Algorithm
      const participants = divEntries.map(e => e.teamId || e.playerId || 'unknown');
      if (participants.length % 2 !== 0) participants.push('BYE');

      const numRounds = participants.length - 1;
      const halfSize = participants.length / 2;
      const teams = [...participants];

      for (let round = 0; round < numRounds; round++) {
          for (let i = 0; i < halfSize; i++) {
              const teamA = teams[i];
              const teamB = teams[teams.length - 1 - i];

              if (teamA !== 'BYE' && teamB !== 'BYE') {
                  const matchId = `match_${competitionId}_${divId}_${Date.now()}_${round}_${i}`;
                  const mRef = db.collection('matches').doc(matchId);
                  
                  const matchData = {
                      id: matchId,
                      competitionId,
                      divisionId: divId === 'default' ? null : divId,
                      teamAId: teamA,
                      teamBId: teamB,
                      status: 'scheduled',
                      roundNumber: round + 1,
                      stage: `Round ${round + 1}`,
                      scoreTeamAGames: [],
                      scoreTeamBGames: [],
                      lastUpdatedBy: 'system',
                      lastUpdatedAt: Date.now(),
                      createdAt: Date.now()
                  };

                  if (isTeamLeague) {
                      matchData.boards = teamBoardsConfig.map((b, idx) => ({
                          boardNumber: b.boardNumber || (idx + 1),
                          boardType: b.boardType || b.type,
                          weight: b.weight !== undefined ? b.weight : 1,
                          teamAPlayers: [],
                          teamBPlayers: [],
                          scoreTeamAGames: [],
                          scoreTeamBGames: [],
                          status: 'scheduled'
                      }));
                      matchData.aggregate = { teamAPoints: 0, teamBPoints: 0, winnerTeamId: null };
                  }

                  batch.set(mRef, matchData);
                  matchesCount++;
                  
                  // Create MatchTeams (for legacy compat or advanced queries)
                  const mtARef = db.collection('matchTeams').doc();
                  batch.set(mtARef, { matchId, teamId: teamA, isHomeTeam: true, scoreGames: [] });
                  const mtBRef = db.collection('matchTeams').doc();
                  batch.set(mtBRef, { matchId, teamId: teamB, isHomeTeam: false, scoreGames: [] });
              }
          }
          // Rotate array
          teams.splice(1, 0, teams.pop());
      }
  }

  batch.update(compRef, { status: 'in_progress', updatedAt: Date.now() });
  
  await db.collection('auditLogs').add({
    action: 'generate_schedule',
    actorId: uid,
    entityId: competitionId,
    timestamp: Date.now(),
    details: { matchesGenerated: matchesCount }
  });

  await batch.commit();
  
  return { success: true, matchesGenerated: matchesCount };
});

exports.submitMatchScore = createHandler(async (data, uid) => {
    const { matchId, score1, score2, boardIndex } = data;
    
    if (typeof score1 !== 'number' || typeof score2 !== 'number') {
        const e = new Error('Scores must be numbers');
        e.httpStatus = 400; throw e;
    }

    const matchRef = db.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
        const e = new Error('Match not found');
        e.httpStatus = 404; throw e;
    }
    const match = matchSnap.data();
    
    if (!(await isParticipantOrOrganizer(uid, match))) {
         const e = new Error('User is not a participant or organizer');
         e.httpStatus = 403; throw e;
    }
    
    // Determine winner
    let winnerTeamId = null;
    if (score1 > score2) winnerTeamId = match.teamAId;
    else if (score2 > score1) winnerTeamId = match.teamBId;
    else winnerTeamId = 'draw'; 
    
    const submission = {
        tournamentId: match.tournamentId || null,
        competitionId: match.competitionId || null,
        matchId: matchId,
        submittedBy: uid,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        submittedScore: {
            scoreTeamAGames: [score1],
            scoreTeamBGames: [score2],
            winnerTeamId,
            boardIndex: boardIndex !== undefined ? boardIndex : null
        },
        status: 'pending_opponent',
        createdAt: Date.now()
    };
    
    const batch = db.batch();
    const subRef = db.collection('matchScoreSubmissions').doc();
    batch.set(subRef, submission);
    
    batch.update(matchRef, {
        status: 'pending_confirmation',
        lastUpdatedBy: uid,
        lastUpdatedAt: Date.now(),
        winnerTeamId 
    });
    
    await batch.commit();
    return { success: true, submissionId: subRef.id };
});

exports.submitLineup = createHandler(async (data, uid) => {
    const { matchId, teamId, boards } = data; // boards: { boardNumber: number, playerIds: string[] }[]

    if (!matchId || !teamId || !Array.isArray(boards)) {
        const e = new Error("Missing matchId, teamId, or boards array");
        e.httpStatus = 400; throw e;
    }

    const matchRef = db.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
        const e = new Error('Match not found');
        e.httpStatus = 404; throw e;
    }
    const match = matchSnap.data();

    if (match.teamAId !== teamId && match.teamBId !== teamId) {
        const e = new Error('Team not part of this match');
        e.httpStatus = 400; throw e;
    }

    // Check if user is captain or roster member or admin
    // Get Roster to validate players
    const rosterRef = db.collection('teamRosters').doc(teamId);
    const rosterSnap = await rosterRef.get();
    let rosterPlayers = [];
    
    if (rosterSnap.exists) {
        rosterPlayers = rosterSnap.data().players || [];
    } else {
        // Fallback to Team doc if no roster (legacy)
        const teamSnap = await db.collection('teams').doc(teamId).get();
        if (teamSnap.exists) {
            rosterPlayers = teamSnap.data().players || [];
        }
    }

    // Auth check: User must be in roster or admin
    const isAdmin = await isOrganizerOrAdmin(uid);
    if (!isAdmin && !rosterPlayers.includes(uid)) {
        const e = new Error('Not authorized to submit lineup for this team');
        e.httpStatus = 403; throw e;
    }

    // Validate players in lineup are in roster
    const allPlayerIds = boards.flatMap(b => b.playerIds);
    for (const pid of allPlayerIds) {
        if (!rosterPlayers.includes(pid)) {
             const e = new Error(`Player ${pid} is not on the roster`);
             e.httpStatus = 400; throw e;
        }
    }

    // Save Lineup
    const lineupId = `${matchId}_${teamId}`;
    const lineupRef = db.collection('lineups').doc(lineupId);
    
    await lineupRef.set({
        id: lineupId,
        matchId,
        teamId,
        submittedBy: uid,
        boards,
        submittedAt: Date.now(),
        locked: true // Lock immediately upon submission for simplicity in this version
    });

    // Update Match doc with snapshot for UI display
    // We need to resolve player names for the snapshot
    const playerProfilesSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', allPlayerIds).get();
    const playerMap = {};
    playerProfilesSnap.forEach(doc => { playerMap[doc.id] = doc.data().displayName || 'Unknown'; });

    const isTeamA = match.teamAId === teamId;
    const updatedBoards = [...(match.boards || [])];

    boards.forEach(assignment => {
        const idx = assignment.boardNumber - 1;
        if (updatedBoards[idx]) {
            const snapshot = assignment.playerIds.map(pid => ({ id: pid, name: playerMap[pid] || 'Unknown' }));
            if (isTeamA) {
                updatedBoards[idx].teamAPlayers = snapshot;
            } else {
                updatedBoards[idx].teamBPlayers = snapshot;
            }
        }
    });

    await matchRef.update({
        boards: updatedBoards,
        lastUpdatedAt: Date.now()
    });

    return { success: true };
});

exports.confirmMatchScore = createHandler(async (data, uid) => {
  const { matchId, submissionId } = data;

  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
      const e = new Error('Match not found');
      e.httpStatus = 404; throw e;
  }
  const match = matchSnap.data();

  if (!(await isParticipantOrOrganizer(uid, match))) {
      const e = new Error('Not a participant');
      e.httpStatus = 403; throw e;
  }

  // If no submissionId provided, try to find one
  let subRef;
  let sub;
  
  if (submissionId) {
      subRef = db.collection('matchScoreSubmissions').doc(submissionId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) {
          const e = new Error('Submission not found');
          e.httpStatus = 404; throw e;
      }
      sub = subSnap.data();
  } else {
      const q = await db.collection('matchScoreSubmissions')
        .where('matchId', '==', matchId)
        .where('status', '==', 'pending_opponent')
        .limit(1)
        .get();
      if (q.empty) {
          const e = new Error('No pending submission found');
          e.httpStatus = 404; throw e;
      }
      sub = q.docs[0].data();
      subRef = q.docs[0].ref;
  }

  if (sub.status !== 'pending_opponent') {
      const e = new Error('Submission not pending');
      e.httpStatus = 400; throw e;
  }

  // Strict check: Cannot confirm own submission unless admin/organizer
  if (sub.submittedBy === uid && !(await isOrganizerOrAdmin(uid))) {
      const e = new Error('Cannot confirm your own submission');
      e.httpStatus = 403; throw e;
  }

  const batch = db.batch();

  // 1. Confirm Submission
  batch.update(subRef, { status: 'confirmed', respondedAt: Date.now() });

  // 2. Update Match
  const scores = sub.submittedScore;
  let winnerId = scores.winnerTeamId;
  if (winnerId === 'draw') winnerId = null;

  // Handle Team Match Board Update
  if (match.boards && scores.boardIndex !== undefined && scores.boardIndex !== null) {
      const idx = scores.boardIndex;
      const updatedBoards = [...match.boards];
      if (updatedBoards[idx]) {
          updatedBoards[idx].scoreTeamAGames = scores.scoreTeamAGames;
          updatedBoards[idx].scoreTeamBGames = scores.scoreTeamBGames;
          updatedBoards[idx].status = 'completed';
          updatedBoards[idx].winnerTeamId = winnerId;
      }
      
      // Calculate Aggregate (Weighted Score)
      let matchScoreA = 0;
      let matchScoreB = 0;
      let boardsWonA = 0;
      let boardsWonB = 0;

      const compSnap = await db.collection('competitions').doc(match.competitionId).get();
      const comp = compSnap.data();
      const teamLeagueSettings = comp?.settings?.teamLeague;
      const legacyConfig = comp?.settings?.teamMatchConfig;
      
      updatedBoards.forEach((b, i) => {
          // If board is completed, add its weight to the match score
          if (b.status === 'completed' && b.winnerTeamId) {
              const weight = b.weight || 1;
              if (b.winnerTeamId === match.teamAId) {
                  matchScoreA += weight;
                  boardsWonA++;
              } else if (b.winnerTeamId === match.teamBId) {
                  matchScoreB += weight;
                  boardsWonB++;
              }
          }
      });

      const allCompleted = updatedBoards.every(b => b.status === 'completed');
      
      // Determine Match Winner based on weighted scores
      let matchWinnerId = null;
      if (matchScoreA > matchScoreB) matchWinnerId = match.teamAId;
      else if (matchScoreB > matchScoreA) matchWinnerId = match.teamBId;
      else matchWinnerId = 'draw';

      const updatePayload = {
          boards: updatedBoards,
          lastUpdatedBy: uid,
          lastUpdatedAt: Date.now(),
          'aggregate.teamAPoints': matchScoreA, // Weighted Board Score
          'aggregate.teamBPoints': matchScoreB,
          'aggregate.winnerTeamId': matchWinnerId === 'draw' ? null : matchWinnerId
      };

      if (allCompleted) {
          updatePayload.status = 'completed';
          updatePayload.endTime = Date.now();
          updatePayload.winnerTeamId = matchWinnerId === 'draw' ? null : matchWinnerId;
      } else {
          // Reset pending status so more scores can come in
          updatePayload.status = 'in_progress'; // or 'scheduled'
      }
      
      batch.update(matchRef, updatePayload);

      if (allCompleted) {
          // Calculate League Table Points
          const pointsPerMatchWin = teamLeagueSettings?.pointsPerMatchWin || 3;
          const pointsPerBoardWin = teamLeagueSettings?.pointsPerBoardWin || 0;
          // Draw points - use standard settings if available or 1 as fallback
          const pointsDraw = comp?.settings?.points?.draw !== undefined ? comp.settings.points.draw : 1;

          let leaguePointsA = (boardsWonA * pointsPerBoardWin);
          let leaguePointsB = (boardsWonB * pointsPerBoardWin);

          if (matchWinnerId === match.teamAId) leaguePointsA += pointsPerMatchWin;
          else if (matchWinnerId === match.teamBId) leaguePointsB += pointsPerMatchWin;
          else if (matchWinnerId === 'draw') {
              leaguePointsA += pointsDraw;
              leaguePointsB += pointsDraw;
          }

          // Aggregated Overrides for updateStandings
          const overridesA = {
              points: leaguePointsA,
              boardWins: boardsWonA,
              boardLosses: boardsWonB
          };
          const overridesB = {
              points: leaguePointsB,
              boardWins: boardsWonB,
              boardLosses: boardsWonA
          };

          await updateStandings(batch, match.competitionId, match.divisionId, match.teamAId, match.teamBId, matchScoreA, matchScoreB, comp, { overridesA, overridesB });
      }

  } else {
      // Standard Match Update
      batch.update(matchRef, {
        status: 'completed',
        endTime: Date.now(),
        lastUpdatedBy: uid,
        lastUpdatedAt: Date.now(),
        winnerTeamId: winnerId,
        scoreTeamAGames: scores.scoreTeamAGames,
        scoreTeamBGames: scores.scoreTeamBGames
      });

      // Update MatchTeams
      const mtSnap = await db.collection('matchTeams').where('matchId', '==', matchId).get();
      mtSnap.forEach(doc => {
          const mt = doc.data();
          if (mt.teamId === sub.teamAId) {
              batch.update(doc.ref, { scoreGames: scores.scoreTeamAGames });
          } else if (mt.teamId === sub.teamBId) {
              batch.update(doc.ref, { scoreGames: scores.scoreTeamBGames });
          }
      });

      if (match.competitionId) {
          const compSnap = await db.collection('competitions').doc(match.competitionId).get();
          const scoreA = (scores.scoreTeamAGames || []).reduce((a, b) => a + b, 0);
          const scoreB = (scores.scoreTeamBGames || []).reduce((a, b) => a + b, 0);
          await updateStandings(batch, match.competitionId, match.divisionId, sub.teamAId, sub.teamBId, scoreA, scoreB, compSnap.data());
      }
  }

  // Audit
  await db.collection('auditLogs').add({
    action: 'confirm_score',
    actorId: uid,
    entityId: matchId,
    timestamp: Date.now(),
    details: { submissionId, scores }
  });

  await batch.commit();
  return { success: true };
});

async function updateStandings(batch, competitionId, divisionId, teamAId, teamBId, scoreA, scoreB, comp, overrides = null) {
    const pointsSettings = comp.settings && comp.settings.points ? comp.settings.points : { win: 3, loss: 0, draw: 1 };

    const getStandingRef = (teamId) => {
        const id = divisionId 
          ? `${competitionId}_${divisionId}_${teamId}` 
          : `${competitionId}_${teamId}`;
        return db.collection('standings').doc(id);
    };

    const sARef = getStandingRef(teamAId);
    const sBRef = getStandingRef(teamBId);

    const inc = admin.firestore.FieldValue.increment;

    // Base Updates
    const updateA = {
        played: inc(1),
        pointsFor: inc(scoreA),
        pointsAgainst: inc(scoreB),
        pointDifference: inc(scoreA - scoreB),
        updatedAt: Date.now()
    };
    
    const updateB = {
        played: inc(1),
        pointsFor: inc(scoreB),
        pointsAgainst: inc(scoreA),
        pointDifference: inc(scoreB - scoreA),
        updatedAt: Date.now()
    };

    // Apply Overrides if present (Team League)
    if (overrides) {
        if (overrides.overridesA) {
            updateA.points = inc(overrides.overridesA.points);
            updateA.boardWins = inc(overrides.overridesA.boardWins);
            updateA.boardLosses = inc(overrides.overridesA.boardLosses);
        }
        if (overrides.overridesB) {
            updateB.points = inc(overrides.overridesB.points);
            updateB.boardWins = inc(overrides.overridesB.boardWins);
            updateB.boardLosses = inc(overrides.overridesB.boardLosses);
        }
        
        // Win/Loss/Draw counters based on scores (Match Score)
        if (scoreA > scoreB) {
            updateA.wins = inc(1);
            updateB.losses = inc(1);
        } else if (scoreB > scoreA) {
            updateB.wins = inc(1);
            updateA.losses = inc(1);
        } else {
            updateA.draws = inc(1);
            updateB.draws = inc(1);
        }

    } else {
        // Standard Scoring Logic
        if (scoreA > scoreB) {
            updateA.wins = inc(1);
            updateA.points = inc(pointsSettings.win);
            
            updateB.losses = inc(1);
            updateB.points = inc(pointsSettings.loss);
        } else if (scoreB > scoreA) {
            updateB.wins = inc(1);
            updateB.points = inc(pointsSettings.win);
            
            updateA.losses = inc(1);
            updateA.points = inc(pointsSettings.loss);
        } else {
            updateA.draws = inc(1);
            updateA.points = inc(pointsSettings.draw);
            
            updateB.draws = inc(1);
            updateB.points = inc(pointsSettings.draw);
        }
    }

    batch.set(sARef, updateA, { merge: true });
    batch.set(sBRef, updateB, { merge: true });
}

exports.disputeMatchScore = createHandler(async (data, uid) => {
    const { matchId, reason } = data;
    
    const matchRef = db.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
        const e = new Error('Match not found');
        e.httpStatus = 404; throw e;
    }
    const match = matchSnap.data();
    
    if (!(await isParticipantOrOrganizer(uid, match))) {
         const e = new Error('User is not a participant or organizer');
         e.httpStatus = 403; throw e;
    }
    
    const subsQuery = await db.collection('matchScoreSubmissions')
        .where('matchId', '==', matchId)
        .where('status', '==', 'pending_opponent')
        .get();
        
    const batch = db.batch();
    subsQuery.forEach(doc => {
        batch.update(doc.ref, { status: 'rejected', respondedAt: Date.now(), reasonRejected: reason || 'Disputed' });
    });
    
    batch.update(matchRef, {
        status: 'disputed',
        lastUpdatedBy: uid,
        lastUpdatedAt: Date.now(),
        disputeReason: reason || null
    });

    // Audit
    await db.collection('auditLogs').add({
      action: 'dispute_score',
      actorId: uid,
      entityId: matchId,
      timestamp: Date.now(),
      details: { reason }
    });
    
    await batch.commit();
    return { success: true };
});

exports.bulkImportClubMembers = createHandler(async (data, uid) => {
  // Placeholder logic for bulk import
  const { rows } = data;
  if (!Array.isArray(rows)) {
      const e = new Error("Rows must be an array");
      e.httpStatus = 400; throw e;
  }
  const results = rows.map(r => ({ email: r.email, status: 'Processed', notes: 'Simulated Import' }));
  return { results }; 
});
