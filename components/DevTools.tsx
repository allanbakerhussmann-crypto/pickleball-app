
import React, { useState } from 'react';
import { 
    createCompetition, 
    createCompetitionEntry, 
    generateLeagueSchedule, 
    listCompetitions, 
    listCompetitionEntries,
    subscribeToCompetitionMatches,
    db
} from '../services/firebase';
import { deleteDoc, doc, collection, getDocs, query, where, writeBatch } from '@firebase/firestore';
import type { Competition, CompetitionEntry } from '../types';

export const DevTools: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [testLog, setTestLog] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const log = (msg: string) => setTestLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

    const runLeagueIntegrationTest = async () => {
        if (!confirm("Run Integration Test? This will create and delete data in Firestore.")) return;
        setIsRunning(true);
        setTestLog([]);
        log("Starting League Integration Test...");

        const testCompId = `test_comp_${Date.now()}`;
        const entry1Id = `test_entry_1_${Date.now()}`;
        const entry2Id = `test_entry_2_${Date.now()}`;

        try {
            // 1. Create Competition
            log(`Creating Test Competition: ${testCompId}`);
            const comp: Competition = {
                id: testCompId,
                name: "INTEGRATION TEST LEAGUE",
                type: 'league',
                organiserId: 'test_runner',
                startDate: '2024-01-01',
                endDate: '2024-01-02',
                status: 'draft',
                settings: { points: { win: 3, loss: 0, draw: 1 }, tieBreaker: 'point_diff' }
            };
            await createCompetition(comp);
            log("✓ Competition created.");

            // 2. Add Entrants
            log("Adding 2 Test Entries...");
            const e1: CompetitionEntry = { id: entry1Id, competitionId: testCompId, entryType: 'individual', teamId: 'Player One', status: 'active', createdAt: Date.now() };
            const e2: CompetitionEntry = { id: entry2Id, competitionId: testCompId, entryType: 'individual', teamId: 'Player Two', status: 'active', createdAt: Date.now() };
            
            await createCompetitionEntry(e1);
            await createCompetitionEntry(e2);
            log("✓ Entries added.");

            // 3. Generate Schedule
            log("Generating Schedule...");
            await generateLeagueSchedule(testCompId);
            
            // 4. Verify Matches
            log("Verifying Matches...");
            // Allow DB propagation
            await new Promise(r => setTimeout(r, 1500)); 
            
            const qMatches = query(collection(db, 'matches'), where('competitionId', '==', testCompId));
            const snap = await getDocs(qMatches);
            
            if (snap.size > 0) {
                log(`✓ SUCCESS: ${snap.size} match(es) generated.`);
            } else {
                throw new Error("FAIL: No matches found after generation.");
            }

            // 5. Cleanup
            log("Cleaning up...");
            const batch = writeBatch(db);
            batch.delete(doc(db, 'competitions', testCompId));
            batch.delete(doc(db, 'competitionEntries', entry1Id));
            batch.delete(doc(db, 'competitionEntries', entry2Id));
            snap.forEach(m => batch.delete(m.ref));
            await batch.commit();
            log("✓ Cleanup complete.");
            log("TEST PASSED.");

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
                        <span className="text-red-400">Warning: Use with caution on production databases.</span>
                    </p>
                    
                    <button 
                        onClick={runLeagueIntegrationTest} 
                        disabled={isRunning}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                    >
                        {isRunning ? 'Running...' : 'Run League Integration Test'}
                    </button>

                    <div className="mt-4 bg-black/50 p-4 rounded h-64 overflow-y-auto font-mono text-xs text-green-400 border border-gray-700">
                        {testLog.length === 0 ? <span className="text-gray-600">// Logs will appear here...</span> : testLog.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
};
