
import React, { useState, useEffect } from 'react';
import type { Board, Match } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { MatchLineupEditor } from './MatchLineupEditor';

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
  isWaitingOnYou?: boolean;
  canCurrentUserConfirm?: boolean;
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
  
  const [expanded, setExpanded] = useState(false);
  const [boardScores, setBoardScores] = useState<Record<number, { s1: string, s2: string }>>({});
  const [showLineupEditor, setShowLineupEditor] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  useEffect(() => {
    setScore1(match.score1 ?? '');
    setScore2(match.score2 ?? '');
  }, [match.score1, match.score2]);

  const isCompleted = match.status === 'completed';
  const isPendingConfirmation = match.status === 'pending_confirmation';
  const isDisputed = match.status === 'disputed';
  const isTeamMatch = !!match.boards && match.boards.length > 0;

  const handleSubmit = (boardIdx?: number) => {
    if (!isVerified || !canCurrentUserEdit) return;

    let s1, s2;
    if (boardIdx !== undefined && isTeamMatch) {
        const bScore = boardScores[boardIdx];
        if (!bScore) return;
        s1 = parseInt(bScore.s1, 10);
        s2 = parseInt(bScore.s2, 10);
        onUpdateScore(`${match.id}:${boardIdx}`, s1, s2, 'submit');
        return;
    }

    s1 = typeof score1 === 'string' ? parseInt(score1, 10) : score1;
    s2 = typeof score2 === 'string' ? parseInt(score2, 10) : score2;

    if (Number.isNaN(s1) || Number.isNaN(s2)) return;
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
    onUpdateScore(match.id, 0, 0, 'dispute', 'Disputed by user');
  };

  const canSetLineup = canCurrentUserEdit && isTeamMatch && !isCompleted; 

  const statusLabel =
    match.status === 'not_started' ? 'Scheduled' :
    match.status === 'in_progress' ? 'LIVE' :
    match.status === 'completed' ? 'FINAL' :
    match.status === 'pending_confirmation' ? 'Confirming' :
    match.status === 'disputed' ? 'Disputed' : match.status;

  const statusBadgeColor =
    match.status === 'in_progress' ? 'bg-red-600 text-white animate-pulse shadow-red-500/50 shadow-sm' :
    match.status === 'completed' ? 'bg-gray-700 text-gray-300' :
    match.status === 'pending_confirmation' ? 'bg-yellow-500 text-black' :
    'bg-blue-600 text-white';

  const showEditableInputs = !isCompleted && canCurrentUserEdit && isVerified && match.status === 'in_progress' && !isTeamMatch;

  // Helper for avatar initials
  const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

  return (
    <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden shadow-lg relative group transition-all hover:border-gray-600">
      {/* Lineup Editor Modal */}
      {showLineupEditor && editingTeamId && (
          <MatchLineupEditor 
            match={match as any} 
            teamId={editingTeamId} 
            onClose={() => setShowLineupEditor(false)} 
          />
      )}

      {/* Top Bar: Compact Metadata */}
      <div className="bg-gray-900/80 px-4 py-2 flex justify-between items-center text-[10px] font-bold text-gray-400 border-b border-gray-700/50 uppercase tracking-wider">
        <div className="flex gap-3 items-center">
            <span>#{matchNumber}</span>
            <span>{match.roundNumber ? `R${match.roundNumber}` : 'Pool'}</span>
            {match.courtName && <span className="text-green-400">Court {match.courtName}</span>}
        </div>
        <span className={`px-2 py-0.5 rounded-full ${statusBadgeColor}`}>
            {statusLabel}
        </span>
      </div>

      {/* Main Content */}
      <div className="p-4">
          <div className="flex items-center justify-between gap-2">
              
              {/* Team 1 */}
              <div className="flex-1 flex flex-col items-start min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 border border-gray-600">
                          {getInitials(match.team1.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                          <div className={`font-bold text-base leading-tight truncate ${match.score1 !== null && match.score2 !== null && match.score1 > match.score2 ? 'text-white' : 'text-gray-300'}`}>
                              {match.team1.name}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">{match.team1.players.map(p => p.name.split(' ')[0]).join('/')}</div>
                      </div>
                  </div>
                  {canSetLineup && <button onClick={() => { setEditingTeamId(match.team1.id); setShowLineupEditor(true); }} className="text-[10px] text-blue-400 hover:underline ml-11">Lineup</button>}
              </div>

              {/* Scores (Center) */}
              <div className="flex items-center gap-2 px-2">
                  <div className={`relative w-10 h-12 flex items-center justify-center bg-gray-900 rounded-lg border ${showEditableInputs ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-700'}`}>
                      {showEditableInputs ? (
                          <input 
                            type="number" 
                            className="w-full h-full bg-transparent text-center text-xl font-black text-white focus:outline-none" 
                            value={score1}
                            onChange={e => setScore1(e.target.value === '' ? '' : Number(e.target.value))}
                          />
                      ) : (
                          <span className={`text-xl font-black ${match.score1 !== null && match.score2 !== null && match.score1 > match.score2 ? 'text-green-400' : 'text-gray-400'}`}>
                              {match.score1 ?? '-'}
                          </span>
                      )}
                  </div>
                  <span className="text-gray-600 font-bold text-xs">v</span>
                  <div className={`relative w-10 h-12 flex items-center justify-center bg-gray-900 rounded-lg border ${showEditableInputs ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-700'}`}>
                      {showEditableInputs ? (
                          <input 
                            type="number" 
                            className="w-full h-full bg-transparent text-center text-xl font-black text-white focus:outline-none" 
                            value={score2}
                            onChange={e => setScore2(e.target.value === '' ? '' : Number(e.target.value))}
                          />
                      ) : (
                          <span className={`text-xl font-black ${match.score1 !== null && match.score2 !== null && match.score2 > match.score1 ? 'text-green-400' : 'text-gray-400'}`}>
                              {match.score2 ?? '-'}
                          </span>
                      )}
                  </div>
              </div>

              {/* Team 2 */}
              <div className="flex-1 flex flex-col items-end min-w-0 text-right">
                  <div className="flex items-center gap-3 mb-1 flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 border border-gray-600">
                          {getInitials(match.team2.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                          <div className={`font-bold text-base leading-tight truncate ${match.score2 !== null && match.score1 !== null && match.score2 > match.score1 ? 'text-white' : 'text-gray-300'}`}>
                              {match.team2.name}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">{match.team2.players.map(p => p.name.split(' ')[0]).join('/')}</div>
                      </div>
                  </div>
                  {canSetLineup && <button onClick={() => { setEditingTeamId(match.team2.id); setShowLineupEditor(true); }} className="text-[10px] text-blue-400 hover:underline mr-11">Lineup</button>}
              </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex justify-center gap-3">
              {showEditableInputs && (
                  <button onClick={() => handleSubmit()} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-8 rounded-full text-xs shadow-lg uppercase tracking-wide">
                      Submit Score
                  </button>
              )}
              {isPendingConfirmation && canCurrentUserConfirm && (
                  <>
                      <button onClick={handleConfirm} className="bg-green-600 hover:bg-green-500 text-white font-bold py-1.5 px-4 rounded-full text-xs shadow-lg">Confirm</button>
                      <button onClick={handleDispute} className="bg-red-600 hover:bg-red-500 text-white font-bold py-1.5 px-4 rounded-full text-xs shadow-lg">Dispute</button>
                  </>
              )}
          </div>

          {/* Info Messages */}
          {isWaitingOnYou && <div className="mt-3 text-center text-xs text-yellow-400 font-bold bg-yellow-900/20 py-1 rounded">Action Required: Confirm Score</div>}
      </div>

      {/* Team League Boards Dropdown */}
      {isTeamMatch && (
          <div className="bg-gray-900 border-t border-gray-800">
              <button 
                onClick={() => setExpanded(!expanded)}
                className="w-full py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-gray-800 hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
              >
                  {match.boards?.length} Match Lines
                  <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              
              {expanded && (
                  <div className="p-3 space-y-2 bg-black/20">
                      {match.boards?.map((board, idx) => {
                          const bComplete = board.status === 'completed';
                          const canEditBoard = canCurrentUserEdit && !bComplete;
                          const bScoreA = board.scoreTeamAGames?.[0];
                          const bScoreB = board.scoreTeamBGames?.[0];
                          
                          return (
                              <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-gray-800 border border-gray-700">
                                  <div className="flex-1 text-xs text-gray-400 font-medium">
                                      <span className="block text-white font-bold mb-0.5">{board.boardType.replace('_', ' ').toUpperCase()}</span>
                                      {board.teamAPlayers?.map(p => p.name).join('/') || 'TBD'}
                                  </div>
                                  
                                  <div className="flex items-center gap-2 px-2">
                                      {canEditBoard ? (
                                          <>
                                              <input className="w-8 h-8 text-center bg-gray-700 text-white rounded border border-gray-600 font-bold" value={boardScores[idx]?.s1 || ''} onChange={e => setBoardScores({...boardScores, [idx]: { ...boardScores[idx], s1: e.target.value }})} placeholder="-" />
                                              <span className="text-gray-500">:</span>
                                              <input className="w-8 h-8 text-center bg-gray-700 text-white rounded border border-gray-600 font-bold" value={boardScores[idx]?.s2 || ''} onChange={e => setBoardScores({...boardScores, [idx]: { ...boardScores[idx], s2: e.target.value }})} placeholder="-" />
                                              <button onClick={() => handleSubmit(idx)} className="ml-1 w-6 h-6 flex items-center justify-center bg-green-600 hover:bg-green-500 rounded text-white text-xs">✓</button>
                                          </>
                                      ) : (
                                          <span className="font-mono font-bold text-white text-lg tracking-widest bg-gray-900 px-2 py-1 rounded border border-gray-700">
                                              {bScoreA ?? '-'} : {bScoreB ?? '-'}
                                          </span>
                                      )}
                                  </div>

                                  <div className="flex-1 text-right text-xs text-gray-400 font-medium">
                                      <span className="block text-transparent select-none mb-0.5">.</span>
                                      {board.teamBPlayers?.map(p => p.name).join('/') || 'TBD'}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      )}
    </div>
  );
};
