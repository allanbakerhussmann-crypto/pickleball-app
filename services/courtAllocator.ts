
import type { Match, Court } from '../types';

export const MATCH_DURATION_ESTIMATE = 15; // Minutes

export const calculateQueuePriority = (
    match: Match, 
    allMatches: Match[],
    teams: { [id: string]: { played: number } } 
): number => {
    // 1. Stage Priority: Main Bracket > Pools > Bronze > Plate
    let stageScore = 0;
    if (match.stage?.includes('Main Bracket')) stageScore = 1000;
    else if (match.stage?.includes('Pool')) stageScore = 800;
    else if (match.stage?.includes('Bronze')) stageScore = 600;
    else if (match.stage?.includes('Plate')) stageScore = 400;

    // 2. Round Priority: Earlier rounds first
    // Default to 1 if not set (Pools usually R1)
    const roundScore = 100 - (match.roundNumber || 1) * 10;

    // 3. Fairness: Teams with FEWER matches played go first
    const tA = teams[match.teamAId]?.played || 0;
    const tB = teams[match.teamBId]?.played || 0;
    const fairnessScore = 50 - (tA + tB);

    return stageScore + roundScore + fairnessScore;
};

export const getScheduledQueue = (
    matches: Match[], 
    activeCourts: Court[]
): { queue: Match[], waitTimes: {[matchId: string]: number} } => {
    
    // 1. Filter pending
    const pending = matches.filter(m => m.status === 'pending');
    
    // 2. Calc team stats for priority
    const teamStats: { [id: string]: { played: number } } = {};
    matches.forEach(m => {
        if (m.status === 'completed' || m.status === 'in_progress') {
            if (!teamStats[m.teamAId]) teamStats[m.teamAId] = { played: 0 };
            if (!teamStats[m.teamBId]) teamStats[m.teamBId] = { played: 0 };
            teamStats[m.teamAId].played++;
            teamStats[m.teamBId].played++;
        }
    });

    // 3. Sort
    const queue = pending.sort((a, b) => {
        return calculateQueuePriority(b, matches, teamStats) - calculateQueuePriority(a, matches, teamStats);
    });

    // 4. Calculate Estimates
    const waitTimes: {[matchId: string]: number} = {};
    const activeCount = activeCourts.length || 1;
    
    queue.forEach((m, idx) => {
        // Simple formula: Position / Courts * AvgDuration
        // Wait time starts AFTER current matches finish, so roughly:
        const batchesAhead = Math.floor(idx / activeCount);
        waitTimes[m.id] = (batchesAhead + 1) * MATCH_DURATION_ESTIMATE;
    });

    return { queue, waitTimes };
};
