
import React, { useState, useEffect } from 'react';
import type { Board, Match } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { MatchLineupEditor } from './MatchLineupEditor';

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
  // Team League Boards
  boards?: Board[];
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
  const { currentUser } = useAuth();
  const [score1, setScore1] = useState<number | ''>(match.score1 ?? '');
  const [score2, setScore2] = useState<number | ''>(match.score2 ?? '');
  
  // Board scores state
  const [expanded, setExpanded] = useState(false);
  const [boardScores, setBoardScores] = useState<Record<number, { s1: string, s2: string }>>({});

  // Lineup Editor State
  const [showLineupEditor, setShowLineupEditor] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  // If the match scores change from outside (e.g. other player / organiser),
  // keep local inputs in sync.
  useEffect(() => {
    setScore1(match.score1 ?? '');
    setScore2(match.score2 ?? '');
  }, [match.score1, match.score2]);

  const isCompleted = match.status === 'completed';
  const isPendingConfirmation = match.status === 'pending_confirmation';
  const isDisputed = match.status === 'disputed';
  const isTeamMatch = !!match.boards && match.boards.length > 0;

  const handleSubmit = (boardIdx?: number) => {
    if (!isVerified) {
      console.warn('Only verified organisers/players can submit scores.');
      return;
    }
    if (!canCurrentUserEdit) {
      console.warn('Only players in this match can enter scores.');
      return;
    }

    let s1, s2;
    // Handle Board Score
    if (boardIdx !== undefined && isTeamMatch) {
        const bScore = boardScores[boardIdx];
        if (!bScore) return;
        s1 = parseInt(bScore.s1, 10);
        s2 = parseInt(bScore.s2, 10);
        // We append the board index to the match ID for the parent to handle
        onUpdateScore(`${match.id}:${boardIdx}`, s1, s2, 'submit');
        return;
    }

    // Handle Normal Match Score
    s1 = typeof score1 === 'string' ? parseInt(score1, 10) : score1;
    s2 = typeof score2 === 'string' ? parseInt(score2, 10) : score2;

    if (Number.isNaN(s1) || Number.isNaN(s2)) {
      return;
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
    const reason = 'Disputed by user';
    const s1 = typeof score1 === 'string' ? parseInt(score1, 10) : score1;
    const s2 = typeof score2 === 'string' ? parseInt(score2, 10) : score2;
    onUpdateScore(match.id, s1 || 0, s2 || 0, 'dispute', reason);
  };

  const canSetLineup = canCurrentUserEdit && isTeamMatch && !isCompleted; 

  const statusLabel =
    match.status === 'not_started'
      ? 'Not Started'
      : match.status === 'in_progress'
      ? 'In Progress'
      : match.status === 'completed'
      ? 'Completed'
      : match.status === 'pending_confirmation'
      ? 'Pending Confirmation'
      : match.status === 'disputed'
      ? 'Disputed'
      : match.status;

  const statusColor =
    match.status === 'in_progress'
      ? 'text-blue-400'
      : match.status === 'completed'
      ? 'text-green-400'
      : match.status === 'pending_confirmation'
      ? 'text-yellow-300'
      : match.status === 'disputed'
      ? 'text-red-300'
      : 'text-gray-400';

  const showEditableInputs =
  !isCompleted && canCurrentUserEdit && isVerified && match.status === 'in_progress' && !isTeamMatch;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3 min-w-0 relative">
      {/* Lineup Editor Modal */}
      {showLineupEditor && editingTeamId && (
          <MatchLineupEditor 
            match={match as any} 
            teamId={editingTeamId} 
            onClose={() => setShowLineupEditor(false)} 
          />
      )}

      {/* Header line: Match # / Round / Court / Status */}
      <div className="flex justify-between items-center text-xs text-gray-400">
        <div>
          <span className="font-semibold text-gray-200">
            Match #{matchNumber}
          </span>
          {match.roundNumber && (
            <span className="ml-2">
              • Round {match.roundNumber}
            </span>
          )}
          {match.courtName && (
            <span className="ml-2">
              • Court {match.courtName}
            </span>
          )}
        </div>
        <div className={`font-semibold ${statusColor}`}>{statusLabel}</div>
      </div>

      {/* Teams + scores (Aggregate or Single) */}
      <div className="flex justify-between items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {match.team1.name}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {match.team1.players.map(p => p.name).join(' / ')}
          </div>
          {canSetLineup && (
              <button 
                onClick={() => { setEditingTeamId(match.team1.id); setShowLineupEditor(true); }}
                className="text-[10px] text-blue-400 hover:text-blue-300 underline mt-1"
              >
                  Set Lineup
              </button>
          )}
        </div>

        {/* Score inputs (or read-only display) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex flex-col items-center">
            {showEditableInputs ? (
              <input
                type="number"
                value={score1}
                onChange={e =>
                  setScore1(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-12 bg-gray-800 text-white text-center text-sm rounded border border-gray-600 focus:outline-none focus:border-green-500"
              />
            ) : (
              <div className="w-8 text-center text-white text-xl font-bold">
                {match.score1 ?? '-'}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400">–</div>

          <div className="flex flex-col items-center">
            {showEditableInputs ? (
              <input
                type="number"
                value={score2}
                onChange={e =>
                  setScore2(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-12 bg-gray-800 text-white text-center text-sm rounded border border-gray-600 focus:outline-none focus:border-green-500"
              />
            ) : (
              <div className="w-8 text-center text-white text-xl font-bold">
                {match.score2 ?? '-'}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 text-right min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {match.team2.name}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {match.team2.players.map(p => p.name).join(' / ')}
          </div>
          {canSetLineup && (
              <button 
                onClick={() => { setEditingTeamId(match.team2.id); setShowLineupEditor(true); }}
                className="text-[10px] text-blue-400 hover:text-blue-300 underline mt-1"
              >
                  Set Lineup
              </button>
          )}
        </div>
      </div>

      {/* Team Match Boards */}
      {isTeamMatch && (
          <div className="mt-2 border-t border-gray-800 pt-2">
              <button 
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-white bg-gray-800/50 p-1.5 rounded"
              >
                  <span className="font-bold">{match.boards?.length} Lines (Boards)</span>
                  <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              
              {expanded && (
                  <div className="mt-2 space-y-2">
                      {match.boards?.map((board, idx) => {
                          const bComplete = board.status === 'completed';
                          const canEditBoard = canCurrentUserEdit && !bComplete;
                          const bScoreA = board.scoreTeamAGames?.[0];
                          const bScoreB = board.scoreTeamBGames?.[0];
                          
                          // Display lineup names if available
                          const playersA = board.teamAPlayers?.map(p => p.name).join('/') || 'TBD';
                          const playersB = board.teamBPlayers?.map(p => p.name).join('/') || 'TBD';

                          return (
                              <div key={idx} className="bg-gray-800/50 p-2 rounded text-xs border border-gray-800">
                                  <div className="flex justify-between items-center mb-1">
                                      <span className="text-green-400 font-bold uppercase text-[10px]">{board.boardType.replace('_', ' ')}</span>
                                      <div className="flex items-center gap-2">
                                          {canEditBoard ? (
                                              <>
                                                  <input 
                                                    className="w-8 bg-gray-700 text-center rounded border border-gray-600 text-white"
                                                    placeholder="-"
                                                    value={boardScores[idx]?.s1 || ''}
                                                    onChange={e => setBoardScores({...boardScores, [idx]: { ...boardScores[idx], s1: e.target.value }})}
                                                  />
                                                  <span className="text-gray-500">-</span>
                                                  <input 
                                                    className="w-8 bg-gray-700 text-center rounded border border-gray-600 text-white"
                                                    placeholder="-"
                                                    value={boardScores[idx]?.s2 || ''}
                                                    onChange={e => setBoardScores({...boardScores, [idx]: { ...boardScores[idx], s2: e.target.value }})}
                                                  />
                                                  <button onClick={() => handleSubmit(idx)} className="ml-1 text-green-400 hover:text-green-300">✓</button>
                                              </>
                                          ) : (
                                              <span className="font-bold text-white">
                                                  {bScoreA !== undefined ? bScoreA : '-'} : {bScoreB !== undefined ? bScoreB : '-'}
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  <div className="flex justify-between text-gray-400 text-[10px]">
                                      <span className="truncate max-w-[40%]">{playersA}</span>
                                      <span className="text-gray-600">vs</span>
                                      <span className="truncate max-w-[40%] text-right">{playersB}</span>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      )}

      {/* Info + Actions */}
      <div className="flex justify-between items-center mt-1 text-xs">
        <div className="text-gray-400 truncate mr-2">
          {isWaitingOnYou && (
            <span className="text-yellow-300 font-semibold">
              Waiting for your confirmation
            </span>
          )}
          {!isWaitingOnYou && isPendingConfirmation && (
            <span className="text-gray-400">
              Waiting for opponent confirmation
            </span>
          )}
          {isDisputed && (
            <span className="text-red-300">
              Score disputed – organiser review needed
            </span>
          )}
          {!isCompleted && !isPendingConfirmation && !isDisputed && !isWaitingOnYou && (
            <span className="text-gray-500">
              {showEditableInputs
                ? 'Enter final score.'
                : isTeamMatch ? 'Set lineups & score boards.' : 'Scores view only.'}
            </span>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {/* Submit scores */}
          {showEditableInputs && (
            <button
              onClick={() => handleSubmit()}
              className="px-3 py-1 rounded text-xs font-semibold bg-green-600 hover:bg-green-500 text-white"
            >
              Submit Score
            </button>
          )}


          {/* Confirm / Dispute */}
          {isPendingConfirmation && canCurrentUserConfirm && (
            <>
              <button
                onClick={handleConfirm}
                className="px-3 py-1 rounded text-xs font-semibold bg-green-600 hover:bg-green-500 text-white"
              >
                Confirm
              </button>
              <button
                onClick={handleDispute}
                className="px-3 py-1 rounded text-xs font-semibold bg-red-600 hover:bg-red-500 text-white"
              >
                Dispute
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
