const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

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

exports.createTeam = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  const uid = context.auth.uid;

  const tournamentId = data?.tournamentId;
  const divisionId = data?.divisionId;
  const playerIds = data?.playerIds;
  const teamName = data?.teamName || null;

  if (!tournamentId || !divisionId || !Array.isArray(playerIds) || playerIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'tournamentId, divisionId and playerIds are required.');
  }

  const teamId = deterministicTeamId(tournamentId, divisionId, playerIds);

  try {
    const result = await db.runTransaction(async (tx) => {
      const teamRef = db.collection('teams').doc(teamId);
      const teamSnap = await tx.get(teamRef);

      if (teamSnap.exists) {
        // Team already exists: return it
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

      // create team doc
      tx.set(teamRef, teamDoc);

      // audit log
      const auditRef = db.collection('team_creation_audit').doc();
      tx.set(auditRef, {
        teamId,
        action: 'create',
        createdByUserId: uid,
        timestamp: now,
        payload: { tournamentId, divisionId, players: teamDoc.players, teamName }
      });

      return { existed: false, teamId, team: teamDoc };
    });

    return result;
  } catch (err) {
    console.error('createTeam failed', err);
    throw new functions.https.HttpsError('internal', 'Failed to create team', { message: err?.message || String(err) });
  }
});
