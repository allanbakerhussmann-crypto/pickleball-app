import React, { useState, useEffect } from 'react';
import type { Match } from '../types';

// UI Model for displaying matches in the Schedule
export interface MatchDisplay {
  id: string;
  team1: { id: string; name: string; players: { name: string }[] };
  team2: { id: string; name: string; players: { name: string }[] };
  score1: number | null;
  score2: number | null;
  status: Match['status'];
  roundNumber: number;
  // optional court info if you want to pass it down later
  court?: string | null;
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
}

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  matchNumber,
  onUpdateScore,
  isVerified,
}) => {
  const [s1, setS1] = useState<string>(match.score1?.toString() ?? '');
  const [s2, setS2] = useState<string>(match.score2?.toString() ?? '');

  // If the match scores in props change (e.g. after confirmation),
  // keep the local inputs in sync
  useEffect(() => {
    setS1(match.score1 != null ? String(match.score1) : '');
    setS2(match.score2 != null ? String(match.score2) : '');
  }, [match.score1, match.score2]);

  const parsedS1 = s1 === '' ? NaN : parseInt(s1, 10);
  const parsedS2 = s2 === '' ? NaN : parseInt(s2, 10);

  const canSubmit =
    !Number.isNaN(parsedS1) &&
    !Number.isNaN(parsedS2) &&
    match.status !== 'completed' &&
    match.status !== 'disputed' &&
    match.status !== 'pending_confirmation';

  const hasScore = match.score1 != null && match.score2 != null;

  // Highlight winner/loser based on score
  const team1IsWinner =
    hasScore && (match.score1 ?? 0) > (match.score2 ?? 0);
  const team2IsWinner =
    hasScore && (match.score2 ?? 0) > (match.score1 ?? 0);

  const statusLabel = (() => {
    switch (match.status) {
      case 'pending':
        return 'Not Started';
      case 'in_progress':
        return 'In Progress';
      case 'pending_confirmation':
        return 'Awaiting Confirmation';
      case 'completed':
        return 'Final';
      case 'disputed':
        return 'Disputed';
      default:
        return '';
    }
  })();

  const statusColor = (() => {
    switch (match.status) {
      case 'pending':
        return 'text-gray-400';
      case 'in_progress':
        return 'text-blue-400';
      case 'pending_confirmation':
        return 'text-amber-400';
      case 'completed':
        return 'text-green-400';
      case 'disputed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  })();

  const handleSubmitClick = () => {
    if (!canSubmit) return;
    onUpdateScore(match.id, parsedS1, parsedS2, 'submit');
  };

  const handleConfirmClick = () => {
    if (!hasScore) return;
    onUpdateScore(
      match.id,
      match.score1 ?? 0,
      match.score2 ?? 0,
      'confirm'
    );
  };

  const handleDisputeClick = () => {
    if (!hasScore) return;
    const reason = window.prompt(
      'Optional: enter a reason for disputing the score',
      ''
    );
    onUpdateScore(
      match.id,
      match.score1 ?? 0,
      match.score2 ?? 0,
      'dispute',
      reason || undefined
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      {/* Left: match info */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-gray-500">
            Match #{matchNumber}
            {match.roundNumber ? ` • Round ${match.roundNumber}` : ''}
            {match.court ? ` • Court ${match.court}` : ''}
          </div>
          <div className={`text-xs font-semibold ${statusColor}`}>
            {statusLabel}
            {isVerified && match.status === 'completed' && (
              <span className="ml-2 text-green-500">✓ Verified</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div
              className={`font-bold ${
                team1IsWinner ? 'text-green-300' : 'text-white'
              }`}
            >
              {match.team1.name}
            </div>
            <div
              className={`font-bold ${
                team2IsWinner ? 'text-green-300' : 'text-white'
              }`}
            >
              {match.team2.name}
            </div>
          </div>

          {/* Score section */}
          <div className="flex items-center gap-2">
            {/* If score is pending or in progress, show input fields + submit */}
            {(match.status === 'pending' ||
              match.status === 'in_progress') && (
              <>
                <input
                  type="number"
                  className="w-12 bg-gray-800 border border-gray-700 text-white text-sm rounded px-1 py-0.5 text-center"
                  value={s1}
                  onChange={(e) => setS1(e.target.value)}
                  placeholder="-"
                />
                <span className="text-gray-400 text-sm">–</span>
                <input
                  type="number"
                  className="w-12 bg-gray-800 border border-gray-700 text-white text-sm rounded px-1 py-0.5 text-center"
                  value={s2}
                  onChange={(e) => setS2(e.target.value)}
                  placeholder="-"
                />
                <button
                  onClick={handleSubmitClick}
                  disabled={!canSubmit}
                  className="bg-green-600 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs px-2 py-1 rounded"
                >
                  ✓
                </button>
              </>
            )}

            {/* Pending confirmation: show submitted score + confirm/dispute */}
            {match.status === 'pending_confirmation' && hasScore && (
              <div className="flex items-center gap-2">
                <div className="text-sm text-amber-300 font-semibold">
                  {match.score1} – {match.score2}
                </div>
                <button
                  onClick={handleConfirmClick}
                  className="bg-green-700 text-white text-xs px-2 py-1 rounded"
                >
                  Confirm
                </button>
                <button
                  onClick={handleDisputeClick}
                  className="bg-red-700 text-white text-xs px-2 py-1 rounded"
                >
                  Dispute
                </button>
              </div>
            )}

            {/* Completed / Disputed: read-only score */}
            {(match.status === 'completed' ||
              match.status === 'disputed') &&
              hasScore && (
                <div className="flex flex-col items-end">
                  <div className="text-sm text-gray-100 font-semibold">
                    {match.score1} – {match.score2}
                  </div>
                  {match.status === 'disputed' && (
                    <div className="text-xs text-red-400">
                      Disputed
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
