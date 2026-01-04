/**
 * DuprReviewModal - Organizer modal for reviewing and finalizing scores
 *
 * Shows:
 * - Team snapshot with player names
 * - Score proposal (if exists)
 * - Signed/disputed status
 * - Score editor
 * - DUPR eligibility toggle
 * - Finalise button
 *
 * @version V07.10
 * @file components/shared/DuprReviewModal.tsx
 */

import { useState, useEffect } from 'react';
import type { GameScore } from '../../types';
import type { DuprReviewModalData } from '../../types/duprPanel';

interface DuprReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DuprReviewModalData | null;
  onFinalise: (
    matchId: string,
    scores: GameScore[],
    winnerId: string,
    duprEligible: boolean
  ) => Promise<void>;
  isSaving: boolean;
}

export function DuprReviewModal({
  isOpen,
  onClose,
  data,
  onFinalise,
  isSaving,
}: DuprReviewModalProps) {
  // Local state for editing
  const [scores, setScores] = useState<GameScore[]>([]);
  const [winnerId, setWinnerId] = useState<string>('');
  const [duprEligible, setDuprEligible] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Initialize state from data
  useEffect(() => {
    if (data) {
      // Use proposal scores if available, otherwise official
      const initialScores = data.proposal?.scores || data.official?.scores || [];
      setScores(initialScores.length > 0 ? [...initialScores] : [{ gameNumber: 1, scoreA: 0, scoreB: 0 }]);
      setWinnerId(data.proposal?.winnerId || data.official?.winnerId || '');
      setDuprEligible(data.match.dupr?.eligible !== false);
      setIsEditing(false);
    }
  }, [data]);

  if (!isOpen || !data) return null;

  const { match, proposal, official } = data;
  const sideAName = match.sideA?.name || 'Side A';
  const sideBName = match.sideB?.name || 'Side B';
  const sideAId = match.sideA?.id || '';
  const sideBId = match.sideB?.id || '';

  // Calculate winner from scores
  const calculateWinner = (gameScores: GameScore[]): string => {
    let gamesA = 0;
    let gamesB = 0;
    for (const game of gameScores) {
      if ((game.scoreA || 0) > (game.scoreB || 0)) gamesA++;
      else if ((game.scoreB || 0) > (game.scoreA || 0)) gamesB++;
    }
    return gamesA > gamesB ? sideAId : gamesB > gamesA ? sideBId : '';
  };

  // Handle score change
  const handleScoreChange = (gameIndex: number, field: 'scoreA' | 'scoreB', value: number) => {
    const newScores = [...scores];
    newScores[gameIndex] = { ...newScores[gameIndex], [field]: value };
    setScores(newScores);
    setWinnerId(calculateWinner(newScores));
  };

  // Add a game
  const addGame = () => {
    setScores([...scores, { gameNumber: scores.length + 1, scoreA: 0, scoreB: 0 }]);
  };

  // Remove a game
  const removeGame = (index: number) => {
    if (scores.length > 1) {
      const newScores = scores.filter((_, i) => i !== index).map((s, i) => ({ ...s, gameNumber: i + 1 }));
      setScores(newScores);
      setWinnerId(calculateWinner(newScores));
    }
  };

  // Handle finalise
  const handleFinalise = async () => {
    if (!winnerId) {
      alert('Cannot finalize: No winner determined');
      return;
    }
    await onFinalise(match.id, scores, winnerId, duprEligible);
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {official ? 'Review Official Result' : 'Finalise Score'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Teams */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border ${winnerId === sideAId ? 'border-lime-500 bg-lime-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <p className="text-xs text-gray-500 uppercase">Side A</p>
              <p className="text-lg font-semibold text-white">{sideAName}</p>
              {data.sideAPlayerNames.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  {data.sideAPlayerNames.join(', ')}
                </p>
              )}
              {winnerId === sideAId && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-lime-500 text-gray-900 rounded">
                  Winner
                </span>
              )}
            </div>
            <div className={`p-4 rounded-xl border ${winnerId === sideBId ? 'border-lime-500 bg-lime-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <p className="text-xs text-gray-500 uppercase">Side B</p>
              <p className="text-lg font-semibold text-white">{sideBName}</p>
              {data.sideBPlayerNames.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  {data.sideBPlayerNames.join(', ')}
                </p>
              )}
              {winnerId === sideBId && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-lime-500 text-gray-900 rounded">
                  Winner
                </span>
              )}
            </div>
          </div>

          {/* Proposal Info (if exists) */}
          {proposal && (
            <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Score Proposal</p>
                  <p className="text-sm text-gray-300 mt-1">
                    Entered by {proposal.enteredByName || 'Unknown'} on{' '}
                    {formatDate(proposal.enteredAt)}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  proposal.status === 'signed' ? 'bg-lime-500/20 text-lime-400' :
                  proposal.status === 'disputed' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {proposal.status}
                </span>
              </div>

              {proposal.status === 'signed' && proposal.signedByName && (
                <p className="text-sm text-lime-400 mt-2">
                  Signed by {proposal.signedByName} on {formatDate(proposal.signedAt!)}
                </p>
              )}

              {proposal.status === 'disputed' && (
                <div className="mt-2 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                  <p className="text-sm text-red-400">
                    <strong>Disputed by:</strong> {proposal.disputedByName || 'Unknown'}
                  </p>
                  {proposal.disputeReason && (
                    <p className="text-sm text-red-300 mt-1">
                      <strong>Reason:</strong> {proposal.disputeReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Scores Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">
                {isEditing ? 'Edit Scores' : 'Scores'}
              </p>
              {!official && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {isEditing ? 'Use Proposal' : 'Edit Scores'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {scores.map((game, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">Game {index + 1}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={game.scoreA || 0}
                      onChange={(e) => handleScoreChange(index, 'scoreA', parseInt(e.target.value) || 0)}
                      disabled={!isEditing && !official}
                      className="w-16 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-center text-white disabled:opacity-50"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={game.scoreB || 0}
                      onChange={(e) => handleScoreChange(index, 'scoreB', parseInt(e.target.value) || 0)}
                      disabled={!isEditing && !official}
                      className="w-16 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-center text-white disabled:opacity-50"
                    />
                  </div>
                  {isEditing && scores.length > 1 && (
                    <button
                      onClick={() => removeGame(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isEditing && (
              <button
                onClick={addGame}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + Add Game
              </button>
            )}
          </div>

          {/* DUPR Eligibility */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-700 bg-gray-800/50">
            <div>
              <p className="text-sm font-medium text-white">DUPR Eligible</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Submit this match result to DUPR for rating calculation
              </p>
            </div>
            <button
              onClick={() => setDuprEligible(!duprEligible)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${duprEligible ? 'bg-lime-500' : 'bg-gray-600'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${duprEligible ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleFinalise}
            disabled={isSaving || !winnerId}
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
              ${!isSaving && winnerId
                ? 'bg-lime-500 text-gray-900 hover:bg-lime-400'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              'Finalise Official Result'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DuprReviewModal;
