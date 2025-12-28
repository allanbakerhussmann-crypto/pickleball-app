/**
 * MatchCard Component
 *
 * Displays a match with score entry capability.
 * Validates scores against game settings (win by 2, first to 11/15/21).
 *
 * V06.09 Changes:
 * - Added gameSettings to MatchDisplay for score validation
 * - Added validateGameScore validation in handleSubmit
 *
 * @version 06.09
 * @file components/MatchCard.tsx
 */

import React, { useState, useEffect } from 'react';
import type { GameSettings } from '../types/game/gameSettings';
import { validateGameScore } from '../services/game';

/**
 * Basic structures for displaying a match.
 * This must line up with what TournamentManager sends in `uiMatches`.
 */

export interface MatchTeam {
  id: string;
  name: string;
  players: { name: string }[];
}

export interface MatchDisplay {
  id: string;
  team1: MatchTeam;
  team2: MatchTeam;
  score1: number | null;
  score2: number | null;
  status: string;
  roundNumber?: number;
  court?: string | null;
  courtName?: string | null;
  // Optional flags added in TournamentManager
  isWaitingOnYou?: boolean;
  canCurrentUserConfirm?: boolean;
  /** Game settings for score validation (win by 2, first to 11/15/21, etc.) */
  gameSettings?: GameSettings;
}

interface MatchCardProps {
  match: MatchDisplay;
  matchNumber: number;
  onUpdateScore: (
    matchId: string,
    score1: number,
    score2: number,
    action: 'submit' | 'confirm' | 'dispute',
    reason?: string
  ) => void;
  isVerified: boolean;
  isWaitingOnYou?: boolean;
  canCurrentUserConfirm?: boolean;
  /** NEW: only true if current user is actually in this match */
  canCurrentUserEdit: boolean;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  matchNumber,
  onUpdateScore,
  isVerified,
  isWaitingOnYou,
  canCurrentUserConfirm,
  canCurrentUserEdit,
}) => {
  const [score1, setScore1] = useState<number | ''>(match.score1 ?? '');
  const [score2, setScore2] = useState<number | ''>(match.score2 ?? '');

  // If the match scores change from outside (e.g. other player / organiser),
  // keep local inputs in sync.
  useEffect(() => {
    setScore1(match.score1 ?? '');
    setScore2(match.score2 ?? '');
  }, [match.score1, match.score2]);

  const isCompleted = match.status === 'completed';
  const isPendingConfirmation = match.status === 'pending_confirmation';
  const isDisputed = match.status === 'disputed';
  const isInProgress = match.status === 'in_progress';

  const handleSubmit = () => {
    if (!isVerified) {
      alert('Only verified organisers/players can submit scores.');
      return;
    }
    if (!canCurrentUserEdit) {
      alert('Only players in this match can enter scores.');
      return;
    }

    const s1 = typeof score1 === 'string' ? parseInt(score1, 10) : score1;
    const s2 = typeof score2 === 'string' ? parseInt(score2, 10) : score2;

    if (Number.isNaN(s1) || Number.isNaN(s2)) {
      alert('Please enter scores for both sides.');
      return;
    }

    // Validate score against game settings (win by 2, first to 11/15/21, etc.)
    if (match.gameSettings) {
      const validation = validateGameScore(s1, s2, match.gameSettings);
      if (!validation.valid) {
        alert(`Invalid score: ${validation.error}`);
        return;
      }
    }

    onUpdateScore(match.id, s1, s2, 'submit');
  };

  const handleConfirm = () => {
    if (!canCurrentUserConfirm) return;
    const s1 = typeof score1 === 'string' ? parseInt(score1, 10) : score1;
    const s2 = typeof score2 === 'string' ? parseInt(score2, 10) : score2;
    onUpdateScore(match.id, s1 || 0, s2 || 0, 'confirm');
  };

  const handleDispute = () => {
    if (!canCurrentUserConfirm) return;
    const reason = window.prompt(
      'Describe what is wrong with this score (optional):'
    );
    const s1 = typeof score1 === 'string' ? parseInt(score1, 10) : score1;
    const s2 = typeof score2 === 'string' ? parseInt(score2, 10) : score2;
    onUpdateScore(match.id, s1 || 0, s2 || 0, 'dispute', reason || undefined);
  };

  const showEditableInputs =
  !isCompleted && canCurrentUserEdit && isVerified && match.status === 'in_progress';

  const t1Winner = match.score1 !== null && match.score2 !== null && match.score1 > match.score2;
  const t2Winner = match.score1 !== null && match.score2 !== null && match.score2 > match.score1;

  return (
    <div className={`rounded-xl border relative overflow-hidden transition-all shadow-md ${
        isInProgress ? 'bg-gray-800 border-green-500/50 shadow-green-900/20' : 
        isCompleted ? 'bg-gray-900 border-gray-800 opacity-90' : 
        'bg-gray-800 border-gray-700'
    }`}>
      
      {/* Live Status Indicator Strip */}
      {isInProgress && <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-green-400 to-emerald-600 animate-pulse z-10"></div>}
      
      <div className="p-3 pl-4">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
                <span className="bg-gray-700 text-gray-300 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">M{matchNumber}</span>
                {match.roundNumber && <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Rd {match.roundNumber}</span>}
                {match.courtName && <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-900/30">{match.courtName}</span>}
            </div>
            
            <div>
                {isInProgress ? <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded font-bold uppercase animate-pulse shadow-sm shadow-green-900/50">Live</span> :
                 isCompleted ? <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Final</span> :
                 isPendingConfirmation ? <span className="text-[10px] bg-yellow-600 text-white px-2 py-0.5 rounded font-bold uppercase shadow-sm">Confirm</span> :
                 match.status === 'scheduled' ? <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Scheduled</span> : 
                 <span className="text-[10px] text-gray-500 uppercase tracking-wider">{match.status.replace('_', ' ')}</span>}
            </div>
          </div>

          {/* Teams and Scores Container */}
          <div className="flex flex-col gap-1.5">
              {/* Team 1 Row */}
              <div className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${t1Winner ? 'bg-green-900/20 border-green-500/30 shadow-inner' : 'bg-gray-900/50 border-gray-700/50'}`}>
                  <div className="min-w-0 flex-1 pr-2">
                      <div className={`font-bold text-sm truncate ${t1Winner ? 'text-green-400' : 'text-gray-200'}`}>{match.team1.name}</div>
                      <div className="text-[10px] text-gray-500 truncate mt-0.5 font-medium">{(match.team1?.players || []).map(p => p.name).join(' / ')}</div>
                  </div>
                  <div className="flex-shrink-0">
                      {showEditableInputs ? (
                          <input
                            type="tel"
                            value={score1}
                            onChange={e => setScore1(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-10 h-9 bg-gray-800 text-center text-white font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-green-500 rounded border border-gray-600"
                            placeholder="-"
                        />
                      ) : (
                          <div className={`w-9 h-9 flex items-center justify-center font-mono font-bold text-lg rounded-md ${t1Winner ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
                              {match.score1 ?? '-'}
                          </div>
                      )}
                  </div>
              </div>

              {/* Team 2 Row */}
              <div className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${t2Winner ? 'bg-green-900/20 border-green-500/30 shadow-inner' : 'bg-gray-900/50 border-gray-700/50'}`}>
                  <div className="min-w-0 flex-1 pr-2">
                      <div className={`font-bold text-sm truncate ${t2Winner ? 'text-green-400' : 'text-gray-200'}`}>{match.team2.name}</div>
                      <div className="text-[10px] text-gray-500 truncate mt-0.5 font-medium">{(match.team2?.players || []).map(p => p.name).join(' / ')}</div>
                  </div>
                  <div className="flex-shrink-0">
                      {showEditableInputs ? (
                          <input
                            type="tel"
                            value={score2}
                            onChange={e => setScore2(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-10 h-9 bg-gray-800 text-center text-white font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-green-500 rounded border border-gray-600"
                            placeholder="-"
                        />
                      ) : (
                          <div className={`w-9 h-9 flex items-center justify-center font-mono font-bold text-lg rounded-md ${t2Winner ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
                              {match.score2 ?? '-'}
                          </div>
                      )}
                  </div>
              </div>
          </div>

          {/* Action Bar */}
          {(showEditableInputs || (isPendingConfirmation && canCurrentUserConfirm) || isDisputed) && (
              <div className="mt-3 pt-2 border-t border-gray-700/50 flex justify-end gap-2">
                  {showEditableInputs && (
                        <button
                        onClick={handleSubmit}
                        className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white shadow-lg transition-transform active:scale-95 uppercase tracking-wide"
                        >
                        Submit Score
                        </button>
                  )}

                  {isPendingConfirmation && canCurrentUserConfirm && (
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={handleDispute}
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 uppercase tracking-wide"
                            >
                                Dispute
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white shadow-lg animate-pulse uppercase tracking-wide"
                            >
                                Confirm
                            </button>
                        </div>
                  )}
                  
                  {isDisputed && (
                      <div className="w-full bg-red-900/20 text-red-400 text-xs p-2 rounded border border-red-900/50 text-center font-bold">
                          ⚠️ Disputed - Reviewing
                      </div>
                  )}
              </div>
          )}
          
          {/* Waiting on opponent message */}
          {!isWaitingOnYou && isPendingConfirmation && (
              <div className="mt-2 text-[10px] text-center text-gray-500 italic bg-gray-900/30 py-1 rounded border border-gray-800">
                  Waiting for opponent confirmation...
              </div>
          )}
      </div>
    </div>
  );
};
