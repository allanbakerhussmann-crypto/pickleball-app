
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cors = require('cors')({ origin: true });

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
    const teamA = await db.collection('teams').doc(matchData.teamAId).get();
    const teamB = await db.collection('teams').doc(matchData.teamBId).get();
    
    const playersA = teamA.exists ? (teamA.data().players || []) : [];
    const playersB = teamB.exists ? (teamB.data().players || []) : [];
    
    return playersA.includes(uid) || playersB.includes(uid);
}

// --- Auth Helper ---

async function validateAuth(req, res) {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    res.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  try {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error("Auth verification failed:", error);
    res.status(401).send({ error: 'Unauthorized' });
    return null;
  }
}

// --- Request Handler Wrapper (Manual CORS + Auth) ---

const createHandler = (handler) => {
  return functions.https.onRequest((req, res) => {
    // Log for debugging - Cloud Functions logs
    console.log(`Request -> method=${req.method} path=${req.path} origin=${req.headers.origin} userAgent=${req.headers['user-agent']}`);
    console.log('Request headers:', JSON.stringify(req.headers));

    // Ensure CORS middleware runs first
    cors(req, res, async () => {
      // IMPORTANT: handle preflight before ANY auth logic
      if (req.method === 'OPTIONS') {
        // Echo back origin or use wildcard while debugging
        const origin = req.headers.origin || '*';
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        res.set('Access-Control-Max-Age', '3600'); // cache preflight for 1 hour
        console.log('Preflight handled -> responding with CORS headers');
        return res.status(204).send('');
      }

      // Only accept POST for these endpoints (keep same logic)
      if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' });
      }

      // Now run auth and handler
      try {
        const uid = await validateAuth(req, res);
        if (!uid) return; // validateAuth already sent 401 if null

        const result = await handler(req.body, uid);
        
        // Ensure success responses include CORS header too (middleware usually handles this, but safe to be explicit)
        res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
        return res.status(200).json(result || { success: true });
      } catch (err) {
        console.error("Function error:", err);
        const status = err.httpStatus || 500;
        // Ensure error responses include CORS header too
        res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
        return res.status(status).json({ error: err.message || 'Internal Server Error' });
      }
    });
  });
};

// --- Functions ---

exports.createTeam = createHandler(async (data, uid) => {
  const tournamentId = data?.tournamentId;
  const divisionId = data?.divisionId;
  const playerIds = data?.playerIds;
  const teamName = data?.teamName || null;

  if (!tournamentId || !divisionId || !Array.isArray(playerIds) || playerIds.length === 0) {
    const e = new Error('tournamentId, divisionId and playerIds are required.');
    e.httpStatus = 400; throw e;
  }

  const teamId = deterministicTeamId(tournamentId, divisionId, playerIds);

  const result = await db.runTransaction(async (tx) => {
    const teamRef = db.collection('teams').doc(teamId);
    const teamSnap = await tx.get(teamRef);

    if (teamSnap.exists) {
      return { existed: true, teamId, team: teamSnap.data() };
    }

    const now = Date.now();
    const teamDoc = {
      id: teamId,
      tournamentId,
      divisionId,
      players: playerIds.slice().sort(),
      teamName,
      createdByUserId: uid,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    tx.set(teamRef, teamDoc);

    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      action: 'create_team',
      actorId: uid,
      timestamp: now,
      details: { teamId, tournamentId }
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
                  
                  batch.set(mRef, {
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
                  });
                  matchesCount++;
                  
                  // Create MatchTeams
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
    const { matchId, score1, score2 } = data;
    
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
            winnerTeamId
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

  batch.update(matchRef, {
    status: 'completed',
    endTime: Date.now(),
    lastUpdatedBy: uid,
    lastUpdatedAt: Date.now(),
    winnerTeamId: winnerId,
    scoreTeamAGames: scores.scoreTeamAGames,
    scoreTeamBGames: scores.scoreTeamBGames
  });

  // 3. Update MatchTeams
  const mtSnap = await db.collection('matchTeams').where('matchId', '==', matchId).get();
  mtSnap.forEach(doc => {
      const mt = doc.data();
      if (mt.teamId === sub.teamAId) {
          batch.update(doc.ref, { scoreGames: scores.scoreTeamAGames });
      } else if (mt.teamId === sub.teamBId) {
          batch.update(doc.ref, { scoreGames: scores.scoreTeamBGames });
      }
  });
  
  // 4. Update Standings (Atomic)
  if (match.competitionId) {
      const compSnap = await db.collection('competitions').doc(match.competitionId).get();
      const comp = compSnap.data();
      const pointsSettings = comp.settings && comp.settings.points ? comp.settings.points : { win: 3, loss: 0, draw: 1 };

      const getStandingRef = (teamId) => {
          const id = match.divisionId 
            ? `${match.competitionId}_${match.divisionId}_${teamId}` 
            : `${match.competitionId}_${teamId}`;
          return db.collection('standings').doc(id);
      };

      const scoreA = (scores.scoreTeamAGames || []).reduce((a, b) => a + b, 0);
      const scoreB = (scores.scoreTeamBGames || []).reduce((a, b) => a + b, 0);

      const sARef = getStandingRef(sub.teamAId);
      const sBRef = getStandingRef(sub.teamBId);

      const inc = admin.firestore.FieldValue.increment;

      batch.set(sARef, {
          played: inc(1),
          pointsFor: inc(scoreA),
          pointsAgainst: inc(scoreB),
          pointDifference: inc(scoreA - scoreB),
          updatedAt: Date.now()
      }, { merge: true });

      batch.set(sBRef, {
          played: inc(1),
          pointsFor: inc(scoreB),
          pointsAgainst: inc(scoreA),
          pointDifference: inc(scoreB - scoreA),
          updatedAt: Date.now()
      }, { merge: true });

      if (scoreA > scoreB) {
          batch.set(sARef, { wins: inc(1), points: inc(pointsSettings.win) }, { merge: true });
          batch.set(sBRef, { losses: inc(1), points: inc(pointsSettings.loss) }, { merge: true });
      } else if (scoreB > scoreA) {
          batch.set(sBRef, { wins: inc(1), points: inc(pointsSettings.win) }, { merge: true });
          batch.set(sARef, { losses: inc(1), points: inc(pointsSettings.loss) }, { merge: true });
      } else {
          batch.set(sARef, { draws: inc(1), points: inc(pointsSettings.draw) }, { merge: true });
          batch.set(sBRef, { draws: inc(1), points: inc(pointsSettings.draw) }, { merge: true });
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
    