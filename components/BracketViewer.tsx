


import React from 'react';
import { MatchDisplay, MatchCard } from './MatchCard';
import { useAuth } from '../contexts/AuthContext';

interface BracketViewerProps {
    matches: MatchDisplay[];
    onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => void;
    isVerified: boolean;
    /** Optional title to display above the bracket (e.g., "Main Bracket", "Plate Bracket") */
    bracketTitle?: string;
    /** Type of bracket for styling differences */
    bracketType?: 'main' | 'plate' | 'consolation';
    /** Custom label for the finals match (e.g., "Plate Final" instead of "Finals") */
    finalsLabel?: string;
}

export const BracketViewer: React.FC<BracketViewerProps> = ({
    matches,
    onUpdateScore,
    isVerified,
    bracketTitle,
    bracketType = 'main',
    finalsLabel,
}) => {
    const { currentUser } = useAuth();
    // Group matches by round
    const rounds: { [key: number]: MatchDisplay[] } = {};
    let maxRound = 0;

    (matches || []).forEach(m => {
        // Logic to determine round if not explicit:
        // For now, we assume round numbers are assigned correctly or we default to 1
        // In a real bracket generation, round numbers are critical.
        const round = (m as any).roundNumber || 1;
        if (!rounds[round]) rounds[round] = [];
        rounds[round].push(m);
        if (round > maxRound) maxRound = round;
    });

    const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);

    // Determine color based on bracket type
    const titleColor = bracketType === 'plate' ? 'text-amber-400' : 'text-green-400';

    return (
        <div className="overflow-x-auto pb-4">
             {/* Bracket Title */}
             {bracketTitle && (
                 <h2 className={`text-lg font-bold mb-4 ${titleColor}`}>
                     {bracketTitle}
                 </h2>
             )}
             <div className="min-w-max flex gap-8">
                 {roundKeys.map(roundNum => (
                     <div key={roundNum} className="flex flex-col w-80">
                         <h3 className="text-center text-gray-400 font-bold uppercase text-xs mb-4 tracking-wider border-b border-gray-700 pb-2">
                             {roundNum === maxRound ? (finalsLabel || 'Finals') :
                              roundNum === maxRound - 1 ? 'Semi-Finals' :
                              `Round ${roundNum}`}
                         </h3>
                         <div className="flex flex-col justify-around flex-grow gap-6">
                             {(rounds[roundNum] || []).map((match, idx) => {
                                 const isPlayerInThisMatch = !!currentUser && (
                                     (match.team1?.players || []).some(p => p.name === currentUser.displayName) ||
                                     (match.team2?.players || []).some(p => p.name === currentUser.displayName)
                                 );
                                 return (
                                     <div key={match.id} className="relative">
                                         {/* Connector Lines (CSS tricks would be better but simplified here) */}
                                         {roundNum < maxRound && (
                                             <div className="absolute right-[-32px] top-1/2 w-8 h-[1px] bg-gray-700"></div>
                                         )}
                                         <MatchCard
                                            match={match}
                                            matchNumber={idx + 1} // Just visual index
                                            onUpdateScore={onUpdateScore}
                                            isVerified={isVerified}
                                            canCurrentUserEdit={isPlayerInThisMatch}
                                         />
                                     </div>
                                 );
                             })}
                         </div>
                     </div>
                 ))}
             </div>
        </div>
    );
};
