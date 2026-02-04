/**
 * ChallengeModal Component
 * 
 * Modal for creating new ladder challenges or responding to incoming challenges.
 * 
 * FILE LOCATION: components/leagues/ChallengeModal.tsx
 * VERSION: V05.17
 */

import React, { useState } from 'react';
import { ModalShell } from '../shared/ModalShell';
import { useAuth } from '../../contexts/AuthContext';
import { createChallenge, respondToChallenge } from '../../services/firebase';
import type { LeagueMember, LeagueChallenge } from '../../types';

// ============================================
// TYPES
// ============================================

interface ChallengeModalProps {
  leagueId: string;
  mode: 'create' | 'respond';
  // For creating a challenge
  targetMember?: LeagueMember;
  myMembership?: LeagueMember;
  responseDeadlineHours?: number;
  // For responding to a challenge
  challenge?: LeagueChallenge;
  onClose: () => void;
  onSuccess: () => void;
}

// ============================================
// HELPERS
// ============================================

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-NZ', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getTimeRemaining = (deadline: number): string => {
  const now = Date.now();
  const diff = deadline - now;
  
  if (diff <= 0) return 'Expired';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} left`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  
  return `${minutes} minutes left`;
};

// ============================================
// COMPONENT
// ============================================

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  leagueId,
  mode,
  targetMember,
  myMembership,
  responseDeadlineHours = 48,
  challenge,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  // ============================================
  // CREATE CHALLENGE
  // ============================================

  const handleCreateChallenge = async () => {
    if (!currentUser || !myMembership || !targetMember) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await createChallenge(leagueId, {
        challengerId: myMembership.id,
        challengerUserId: currentUser.uid,
        challengerName: myMembership.displayName,
        challengerRank: myMembership.currentRank,
        challengedId: targetMember.id,
        challengedUserId: targetMember.userId,
        challengedName: targetMember.displayName,
        challengedRank: targetMember.currentRank,
        status: 'pending',
        divisionId: targetMember.divisionId || null,
        responseDeadline: Date.now() + (responseDeadlineHours * 60 * 60 * 1000),
        message: message.trim() || null,
      });
      
      onSuccess();
    } catch (e: any) {
      console.error('Failed to create challenge:', e);
      setError(e.message || 'Failed to send challenge');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RESPOND TO CHALLENGE
  // ============================================

  const handleAccept = async () => {
    if (!challenge) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await respondToChallenge(leagueId, challenge.id, 'accepted');
      onSuccess();
    } catch (e: any) {
      console.error('Failed to accept challenge:', e);
      setError(e.message || 'Failed to accept challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!challenge) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await respondToChallenge(leagueId, challenge.id, 'declined');
      onSuccess();
    } catch (e: any) {
      console.error('Failed to decline challenge:', e);
      setError(e.message || 'Failed to decline challenge');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RENDER - CREATE MODE
  // ============================================

  const renderCreateMode = () => {
    if (!targetMember || !myMembership) return null;

    const rankDiff = myMembership.currentRank - targetMember.currentRank;

    return (
      <>
        {/* Challenge Info */}
        <div className="p-6 space-y-4">
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              {/* Challenger (You) */}
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">You</div>
                <div className="text-lg font-bold text-blue-400">
                  #{myMembership.currentRank}
                </div>
                <div className="text-sm text-white truncate max-w-[120px]">
                  {myMembership.displayName}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center px-4">
                <div className="text-2xl">⚔️</div>
                <div className="text-xs text-gray-500 mt-1">
                  {rankDiff} position{rankDiff > 1 ? 's' : ''} up
                </div>
              </div>

              {/* Target */}
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Target</div>
                <div className="text-lg font-bold text-yellow-400">
                  #{targetMember.currentRank}
                </div>
                <div className="text-sm text-white truncate max-w-[120px]">
                  {targetMember.displayName}
                </div>
              </div>
            </div>
          </div>

          {/* Target Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-2xl font-bold text-white">{targetMember.stats.played}</div>
              <div className="text-xs text-gray-400">Played</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-400">{targetMember.stats.wins}</div>
              <div className="text-xs text-gray-400">Wins</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-400">{targetMember.stats.losses}</div>
              <div className="text-xs text-gray-400">Losses</div>
            </div>
          </div>

          {/* Optional Message */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a friendly message..."
              maxLength={200}
              className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500 min-h-[80px] resize-none"
            />
            <div className="text-xs text-gray-500 text-right mt-1">
              {message.length}/200
            </div>
          </div>

          {/* Rules Info */}
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-yellow-400">ℹ️</span>
              <div className="text-yellow-300">
                <p>
                  {targetMember.displayName} will have <strong>{responseDeadlineHours} hours</strong> to 
                  accept or decline your challenge.
                </p>
                <p className="mt-1 text-yellow-400/70">
                  If you win, you'll take their #{targetMember.currentRank} position!
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateChallenge}
            disabled={loading}
            className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
          >
            {loading ? 'Sending...' : '⚔️ Send Challenge'}
          </button>
        </div>
      </>
    );
  };

  // ============================================
  // RENDER - RESPOND MODE
  // ============================================

  const renderRespondMode = () => {
    if (!challenge) return null;

    const isExpired = challenge.responseDeadline < Date.now();

    return (
      <>
        {/* Challenge Info */}
        <div className="p-6 space-y-4">
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              {/* Challenger */}
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Challenger</div>
                <div className="text-lg font-bold text-yellow-400">
                  #{challenge.challengerRank}
                </div>
                <div className="text-sm text-white truncate max-w-[120px]">
                  {challenge.challengerName}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center px-4">
                <div className="text-2xl">⚔️</div>
                <div className="text-xs text-gray-500 mt-1">challenges</div>
              </div>

              {/* You (Challenged) */}
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">You</div>
                <div className="text-lg font-bold text-blue-400">
                  #{challenge.challengedRank}
                </div>
                <div className="text-sm text-white truncate max-w-[120px]">
                  {challenge.challengedName}
                </div>
              </div>
            </div>
          </div>

          {/* Challenger's Message */}
          {challenge.message && (
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Message from {challenge.challengerName}:</div>
              <div className="text-white italic">"{challenge.message}"</div>
            </div>
          )}

          {/* Deadline */}
          <div className={`rounded-lg p-3 text-center ${
            isExpired 
              ? 'bg-red-900/30 border border-red-700' 
              : 'bg-yellow-900/20 border border-yellow-700'
          }`}>
            {isExpired ? (
              <div className="text-red-400">
                ⏰ This challenge has expired
              </div>
            ) : (
              <div>
                <div className="text-yellow-400 font-semibold">
                  ⏰ {getTimeRemaining(challenge.responseDeadline)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Respond by {formatDate(challenge.responseDeadline)}
                </div>
              </div>
            )}
          </div>

          {/* Decline Form */}
          {showDeclineForm && (
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">
                Reason for declining (optional):
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g., Not available this week..."
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500 min-h-[60px] resize-none"
              />
            </div>
          )}

          {/* What happens info */}
          {!isExpired && !showDeclineForm && (
            <div className="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-400">
              <p className="mb-2">
                <span className="text-green-400">✓ Accept:</span> You'll have 7 days to play the match.
              </p>
              <p>
                <span className="text-red-400">✗ Decline:</span> The challenge will be cancelled.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-900 px-6 py-4 border-t border-gray-700">
          {isExpired ? (
            <button
              onClick={onClose}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          ) : showDeclineForm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineForm(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleDecline}
                disabled={loading}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                {loading ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineForm(true)}
                className="flex-1 py-2 bg-red-600/20 border border-red-600 text-red-400 rounded-lg font-semibold hover:bg-red-600/30 transition-colors"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                disabled={loading}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                {loading ? 'Accepting...' : '✓ Accept Challenge'}
              </button>
            </div>
          )}
        </div>
      </>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <ModalShell isOpen={true} onClose={onClose}>
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              {mode === 'create' ? '⚔️ Challenge Player' : '⚔️ Incoming Challenge'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {mode === 'create' ? renderCreateMode() : renderRespondMode()}
    </ModalShell>
  );
};

export default ChallengeModal;