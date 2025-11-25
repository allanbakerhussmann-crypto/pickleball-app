
import React, { useState } from 'react';
import type { Match } from '../types';

// UI Model
export interface MatchDisplay {
  id: string;
  team1: { id: string; name: string; players: {name: string}[] };
  team2: { id: string; name: string; players: {name: string}[] };
  score1: number | null;
  score2: number | null;
  status: Match['status'];
  roundNumber: number;
}

interface MatchCardProps {
  match: MatchDisplay;
  matchNumber: number;
  onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => void;
  isVerified: boolean;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, matchNumber, onUpdateScore, isVerified }) => {
  const [s1, setS1] = useState(match.score1?.toString() || '');
  const [s2, setS2] = useState(match.score2?.toString() || '');
  
  return (
      <div className="bg-gray-700 p-3 rounded border border-gray-600 mb-2 flex items-center justify-between">
          <div className="flex-1 text-right pr-3">
              <div className={`font-bold text-white ${match.status === 'completed' && (match.score1 || 0) > (match.score2 || 0) ? 'text-green-400' : ''}`}>
                  {match.team1.name}
              </div>
          </div>
          <div className="flex gap-2 items-center">
             <input 
                className="w-10 text-center bg-gray-900 text-white rounded border border-gray-600" 
                value={s1} onChange={e => setS1(e.target.value)} 
                disabled={match.status === 'completed'}
             />
             <span className="text-gray-500">-</span>
             <input 
                className="w-10 text-center bg-gray-900 text-white rounded border border-gray-600" 
                value={s2} onChange={e => setS2(e.target.value)}
                disabled={match.status === 'completed'}
             />
             {match.status !== 'completed' && (
                 <button 
                    onClick={() => onUpdateScore(match.id, parseInt(s1), parseInt(s2), 'submit')}
                    className="bg-green-600 text-white text-xs px-2 py-1 rounded"
                 >
                     ✓
                 </button>
             )}
          </div>
          <div className="flex-1 text-left pl-3">
               <div className={`font-bold text-white ${match.status === 'completed' && (match.score2 || 0) > (match.score1 || 0) ? 'text-green-400' : ''}`}>
                  {match.team2.name}
              </div>
          </div>
      </div>
  );
};
