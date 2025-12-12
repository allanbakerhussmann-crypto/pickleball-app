import React, { useState } from 'react';
import { 
    createCompetition, 
    createCompetitionEntry, 
    generateLeagueSchedule, 
    db,
    createTeamServer,
    submitLineup
} from '../services/firebase';
import { submitMatchScore, confirmMatchScore } from '../services/matchService';
import { deleteDoc, doc, collection, getDocs, query, where, writeBatch, getDoc } from 'firebase/firestore';
import type { Competition, CompetitionEntry, Match, StandingsEntry } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const DevTools: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser } = useAuth();
    const [testLog, setTestLog] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const log = (msg: string) => setTestLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

    const runLeagueIntegrationTest = async () => {
        if (!currentUser) { console.warn("Must be logged in."); return; }
        setIsRunning(true);
        setTestLog([]);
        log("🚀 Starting League Integration Test...");

        const timestamp = Date.now();
        const testCompId = `test_comp_${timestamp}`;
        const teamA = `Team_A_${timestamp}`;
        const teamB = `Team_B_${timestamp}`;
        const entry1Id = `entry_${timestamp}_1`;
        const entry2Id = `entry_${timestamp}_2`;

        try {
            log(`1️⃣ Creating Test Competition: ${testCompId}`);
            const comp: Competition = {
                id: testCompId,
                name: "INTEGRATION TEST LEAGUE",
                type: 'league',
                organiserId: currentUser.uid,
                startDate: '2024-01-01',
                endDate: '2024-01-02',
                status: 'draft',
                settings: { points: { win: 3, loss: 0, draw: 1 }, tieBreaker: 'point_diff' },
                visibility: 'private',
                registrationOpen: false
            };
            await createCompetition(comp);
            log("   ✅ Competition created.");

            log(`2️⃣ Adding 2 Test Entries...`);
            const e1: CompetitionEntry = { id: entry1Id, competitionId: testCompId, entryType: 'individual', teamId: teamA, status: 'active', createdAt: Date.now() };
            const e2: CompetitionEntry = { id: entry2Id, competitionId: testCompId, entryType: 'individual', teamId: teamB, status: 'active', createdAt: Date.now() };
            await createCompetitionEntry(e1);
            await createCompetitionEntry(e2);
            log("   ✅ Entries added.");

            log("3️⃣ Generating Schedule...");
            await generateLeagueSchedule(testCompId);
            await new Promise(r => setTimeout(r, 2000)); 
            
            const qMatches = query(collection(db, 'matches'), where('competitionId', '==', testCompId));
            const matchesSnap = await getDocs(qMatches);
            if (matchesSnap.empty) throw new Error("FAIL: No matches generated.");
            const matchDoc = matchesSnap.docs[0];
            const matchData = { id: matchDoc.id, ...matchDoc.data() } as Match;
            log(`   ✅ Schedule generated. Found Match ID: ${matchDoc.id}`);

            log("4️⃣ Submitting Score (11-5)...");
            await submitMatchScore(testCompId, matchData, currentUser.uid, 11, 5);
            log("   ✅ Score submitted.");

            log("5️⃣ Confirming Score...");
            await new Promise(r => setTimeout(r, 1000));
            await confirmMatchScore(testCompId, matchData, currentUser.uid);
            log("   ✅ Score confirmed.");

            log("6️⃣ Verifying Standings...");
            await new Promise(r => setTimeout(r, 2000)); 
            const standingIdA = `${testCompId}_${teamA}`;
            const standingSnapA = await getDoc(doc(db, 'standings', standingIdA));
            if (!standingSnapA.exists()) throw new Error(`FAIL: Standing doc not found for ${teamA}`);
            const statsA = standingSnapA.data() as StandingsEntry;
            
            if (statsA.points !== 3 || statsA.wins !== 1) throw new Error(`FAIL: Stats incorrect. Expected 3 pts, 1 win.`);
            log("   ✅ Standings verified.");

            log("🧹 Cleaning up...");
            const batch = writeBatch(db);
            batch.delete(doc(db, 'competitions', testCompId));
            batch.delete(doc(db, 'competitionEntries', entry1Id));
            batch.delete(doc(db, 'competitionEntries', entry2Id));
            matchesSnap.forEach(m => batch.delete(m.ref));
            batch.delete(doc(db, 'standings', standingIdA));
            batch.delete(doc(db, 'standings', `${testCompId}_${teamB}`));
            const qSubs = query(collection(db, 'matchScoreSubmissions'), where('matchId', '==', matchDoc.id));
            const subsSnap = await getDocs(qSubs);
            subsSnap.forEach(s => batch.delete(s.ref));
            await batch.commit();
            log("   ✅ Cleanup complete.");
            log("🎉 TEST PASSED SUCCESSFULLY.");

        } catch (e: any) {
            console.error(e);
            log(`❌ TEST FAILED: ${e.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const runTeamLeagueIntegrationTest = async () => {
        if (!currentUser) { console.warn("Must be logged in."); return; }
        setIsRunning(true);
        setTestLog([]);
        log("🚀 Starting Team League Test...");

        const timestamp = Date.now();
        const testCompId = `test_tl_${timestamp}`;
        const divId = `div_1`;
        
        try {
            // 1. Create Team League
            log("1️⃣ Creating Team League Competition...");
            const comp: Competition = {
                id: testCompId,
                name: "TEAM LEAGUE TEST",
                type: 'team_league',
                organiserId: currentUser.uid,
                startDate: '2024-01-01',
                endDate: '2024-01-02',
                status: 'draft',
                settings: { 
                    points: { win: 3, loss: 0, draw: 1 }, 
                    tieBreaker: 'point_diff',
                    teamLeague: {
                        boards: [{ boardNumber: 1, boardType: 'singles', weight: 1 }],
                        rosterMin: 1, rosterMax: 5, lineupLockMinutesBeforeMatch: 0,
                        pointsPerBoardWin: 1, pointsPerMatchWin: 2, tieBreakerOrder: []
                    }
                },
                divisions: [{ id: divId, name: 'Div 1', type: 'doubles', gender: 'mixed' }], // Dummy div
                visibility: 'private',
                registrationOpen: false
            };
            await createCompetition(comp);
            
            // 2. Create Teams
            log("2️⃣ Creating Teams A & B...");
            const t1 = await createTeamServer({ competitionId: testCompId, divisionId: divId, playerIds: [currentUser.uid], teamName: 'Team Alpha' });
            const t2 = await createTeamServer({ competitionId: testCompId, divisionId: divId, playerIds: [currentUser.uid], teamName: 'Team Beta' }); // Reuse user for simplicity in test
            const teamAId = t1.team.id;
            const teamBId = t2.team.id;

            // 3. Create Entries
            log("3️⃣ Creating Entries...");
            await createCompetitionEntry({ id: `entry_${teamAId}`, competitionId: testCompId, entryType: 'team', teamId: teamAId, divisionId: divId, status: 'active', createdAt: Date.now() });
            await createCompetitionEntry({ id: `entry_${teamBId}`, competitionId: testCompId, entryType: 'team', teamId: teamBId, divisionId: divId, status: 'active', createdAt: Date.now() });

            // 4. Generate Schedule
            log("4️⃣ Generating Schedule...");
            await generateLeagueSchedule(testCompId);
            await new Promise(r => setTimeout(r, 2000));
            
            const qMatches = query(collection(db, 'matches'), where('competitionId', '==', testCompId));
            const matchesSnap = await getDocs(qMatches);
            if (matchesSnap.empty) throw new Error("No matches generated.");
            const match = { id: matchesSnap.docs[0].id, ...matchesSnap.docs[0].data() } as Match;
            log(`   ✅ Match generated: ${match.id} with ${match.boards?.length} boards.`);

            // 5. Submit Lineup (Team A)
            log("5️⃣ Submitting Lineup...");
            await submitLineup(match.id, teamAId, [{ boardNumber: 1, playerIds: [currentUser.uid] }]);
            // Reload match to verify (optional, skipping for speed)

            // 6. Submit Board Score (Board 1)
            log("6️⃣ Submitting Board Score (11-9)...");
            await submitMatchScore(testCompId, match, currentUser.uid, 11, 9, 0); // boardIndex 0

            // 7. Confirm Match (Triggers aggregation)
            log("7️⃣ Confirming Board/Match...");
            await new Promise(r => setTimeout(r, 1000));
            await confirmMatchScore(testCompId, match, currentUser.uid);
            
            // 8. Verify Standings (Points: 1 board pt + 2 match win pts = 3 total)
            log("8️⃣ Verifying Standings...");
            await new Promise(r => setTimeout(r, 2000));
            const sSnap = await getDoc(doc(db, 'standings', `${testCompId}_${divId}_${teamAId}`));
            if (!sSnap.exists()) throw new Error("Standings not found.");
            const stats = sSnap.data() as StandingsEntry;
            
            log(`   📊 Stats: Points=${stats.points}, BoardWins=${stats.boardWins}`);
            if (stats.points !== 3 || stats.boardWins !== 1) throw new Error(`Expected 3 pts (1 board + 2 win), got ${stats.points}.`);

            log("🎉 TEAM LEAGUE TEST PASSED.");
            
            // Cleanup
            const batch = writeBatch(db);
            batch.delete(doc(db, 'competitions', testCompId));
            batch.delete(doc(db, 'teams', teamAId));
            batch.delete(doc(db, 'teams', teamBId));
            // entries, matches, standings cleanup skipped for brevity in this complex flow
            await batch.commit();

        } catch (e: any) {
            console.error(e);
            log(`❌ TEST FAILED: ${e.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            <button onClick={onBack} className="text-gray-400 mb-4">← Back to Dashboard</button>
            <h1 className="text-2xl font-bold text-white mb-6">Developer Tools</h1>

            <div className="grid gap-6">
                <div className="bg-gray-800 p-6 rounded border border-gray-700">
                    <h2 className="text-lg font-bold text-yellow-400 mb-4">System Health Checks</h2>
                    <p className="text-gray-400 text-sm mb-4">
                        Run integration tests against the connected Firestore instance.
                        <br/>
                        <span className="text-red-400">Warning: Creates and deletes real data.</span>
                    </p>
                    
                    <div className="flex gap-4">
                        <button 
                            onClick={runLeagueIntegrationTest} 
                            disabled={isRunning}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            Test Standard League
                        </button>
                        <button 
                            onClick={runTeamLeagueIntegrationTest} 
                            disabled={isRunning}
                            className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            Test Team League
                        </button>
                    </div>

                    <div className="mt-4 bg-black/50 p-4 rounded h-96 overflow-y-auto font-mono text-xs text-green-400 border border-gray-700 shadow-inner">
                        {testLog.length === 0 ? <span className="text-gray-600">// Execution logs will appear here...</span> : testLog.map((l, i) => (
                            <div key={i} className="border-b border-gray-800/50 pb-1 mb-1 last:border-0">{l}</div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
