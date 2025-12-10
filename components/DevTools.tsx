
import React, { useState } from 'react';
import { 
    createCompetition, 
    createCompetitionEntry, 
    generateLeagueSchedule, 
    db
} from '../services/firebase';
import { submitMatchScore, confirmMatchScore } from '../services/matchService';
import { deleteDoc, doc, collection, getDocs, query, where, writeBatch, getDoc } from '@firebase/firestore';
import type { Competition, CompetitionEntry, Match, StandingsEntry } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const DevTools: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser } = useAuth();
    const [testLog, setTestLog] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const log = (msg: string) => setTestLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

    const runLeagueIntegrationTest = async () => {
        if (!confirm("Run Integration Test? This will create and delete data in Firestore.")) return;
        if (!currentUser) { alert("Must be logged in."); return; }
        
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
            // 1. Create Competition
            log(`1️⃣ Creating Test Competition: ${testCompId}`);
            const comp: Competition = {
                id: testCompId,
                name: "INTEGRATION TEST LEAGUE",
                type: 'league',
                organiserId: currentUser.uid,
                startDate: '2024-01-01',
                endDate: '2024-01-02',
                status: 'draft',
                settings: { 
                    points: { win: 3, loss: 0, draw: 1 }, 
                    tieBreaker: 'point_diff' 
                },
                visibility: 'private',
                registrationOpen: false
            };
            await createCompetition(comp);
            log("   ✅ Competition created.");

            // 2. Add Entrants
            log(`2️⃣ Adding 2 Test Entries (${teamA}, ${teamB})...`);
            const e1: CompetitionEntry = { id: entry1Id, competitionId: testCompId, entryType: 'individual', teamId: teamA, status: 'active', createdAt: Date.now() };
            const e2: CompetitionEntry = { id: entry2Id, competitionId: testCompId, entryType: 'individual', teamId: teamB, status: 'active', createdAt: Date.now() };
            
            await createCompetitionEntry(e1);
            await createCompetitionEntry(e2);
            log("   ✅ Entries added.");

            // 3. Generate Schedule
            log("3️⃣ Generating Schedule (Cloud Function)...");
            await generateLeagueSchedule(testCompId);
            
            // Allow DB propagation
            await new Promise(r => setTimeout(r, 2000)); 
            
            const qMatches = query(collection(db, 'matches'), where('competitionId', '==', testCompId));
            const matchesSnap = await getDocs(qMatches);
            
            if (matchesSnap.empty) throw new Error("FAIL: No matches generated.");
            
            const matchDoc = matchesSnap.docs[0];
            const matchData = { id: matchDoc.id, ...matchDoc.data() } as Match;
            log(`   ✅ Schedule generated. Found Match ID: ${matchDoc.id}`);

            // 4. Submit Score
            log("4️⃣ Submitting Score (11-5)...");
            // We simulate score submission. Since we are Admin/Organizer (currentUser), we have permission.
            await submitMatchScore(testCompId, matchData, currentUser.uid, 11, 5);
            log("   ✅ Score submitted.");

            // 5. Confirm Score
            log("5️⃣ Confirming Score (Server Side)...");
            // Allow propagation of "pending_confirmation" status
            await new Promise(r => setTimeout(r, 1000));
            // Re-fetch match to get fresh status if needed, but passing ID is enough for service
            await confirmMatchScore(testCompId, matchData, currentUser.uid);
            log("   ✅ Score confirmed.");

            // 6. Verify Standings
            log("6️⃣ Verifying Standings (Atomic Update)...");
            await new Promise(r => setTimeout(r, 2000)); // Wait for async trigger/atomic update

            // Standings ID format: {compId}_{teamId} (since no divisions)
            const standingIdA = `${testCompId}_${teamA}`;
            const standingSnapA = await getDoc(doc(db, 'standings', standingIdA));
            
            if (!standingSnapA.exists()) throw new Error(`FAIL: Standing doc not found for ${teamA}`);
            
            const statsA = standingSnapA.data() as StandingsEntry;
            log(`   📊 ${teamA} Stats: Played: ${statsA.played}, Points: ${statsA.points}, W: ${statsA.wins}`);

            if (statsA.points !== 3 || statsA.wins !== 1) {
                throw new Error(`FAIL: Stats incorrect. Expected 3 pts, 1 win. Got ${statsA.points} pts, ${statsA.wins} wins.`);
            }
            log("   ✅ Standings verified correctly.");

            // 7. Cleanup
            log("🧹 Cleaning up test data...");
            const batch = writeBatch(db);
            
            // Delete Competition
            batch.delete(doc(db, 'competitions', testCompId));
            
            // Delete Entries
            batch.delete(doc(db, 'competitionEntries', entry1Id));
            batch.delete(doc(db, 'competitionEntries', entry2Id));
            
            // Delete Matches
            matchesSnap.forEach(m => batch.delete(m.ref));
            
            // Delete Standings
            batch.delete(doc(db, 'standings', standingIdA));
            batch.delete(doc(db, 'standings', `${testCompId}_${teamB}`));
            
            // Delete Score Submissions
            const qSubs = query(collection(db, 'matchScoreSubmissions'), where('matchId', '==', matchDoc.id));
            const subsSnap = await getDocs(qSubs);
            subsSnap.forEach(s => batch.delete(s.ref));

            // Clean Audit Logs (Optional/Advanced: usually keep audit logs, but for dev tool maybe clean)
            // Skipping audit cleanup to verify persistence.

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
                        <span className="text-red-400">Warning: This creates and deletes real data. Do not run during active events.</span>
                    </p>
                    
                    <button 
                        onClick={runLeagueIntegrationTest} 
                        disabled={isRunning}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
                    >
                        {isRunning ? 'Running Test Suite...' : 'Run Full League Integration Test'}
                    </button>

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