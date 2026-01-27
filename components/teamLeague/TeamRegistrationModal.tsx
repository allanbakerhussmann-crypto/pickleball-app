/**
 * TeamRegistrationModal Component
 *
 * Modal for registering a team in a team league.
 * Allows user to become captain and optionally play on the team.
 *
 * FILE LOCATION: components/teamLeague/TeamRegistrationModal.tsx
 * VERSION: V07.56
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { TeamLeague, TeamLeagueFeeConfig } from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (data: TeamRegistrationData) => Promise<void>;
  teamLeagueId: string;
  teamLeagueName: string;
  teamLeague: TeamLeague;
  /** Clubs the user is a member of */
  userClubs?: { id: string; name: string }[];
}

export interface TeamRegistrationData {
  name: string;
  clubId?: string;
  clubName?: string;
  homeVenue?: string;
  contactPhone?: string;
  captainIsPlaying: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatAmount = (cents?: number): string => {
  if (!cents || cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
};

// ============================================
// MAIN COMPONENT
// ============================================

export const TeamRegistrationModal: React.FC<TeamRegistrationModalProps> = ({
  isOpen,
  onClose,
  onRegister,
  teamLeagueId: _teamLeagueId,
  teamLeagueName,
  teamLeague,
  userClubs = [],
}) => {
  const { userProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [teamName, setTeamName] = useState('');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [homeVenue, setHomeVenue] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [captainIsPlaying, setCaptainIsPlaying] = useState(true); // Default to playing captain

  // Pre-fill phone from profile
  useEffect(() => {
    if (userProfile?.phone) {
      setContactPhone(userProfile.phone);
    }
  }, [userProfile?.phone]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTeamName('');
      setSelectedClubId('');
      setHomeVenue('');
      setContactPhone(userProfile?.phone || '');
      setCaptainIsPlaying(true);
      setError(null);
    }
  }, [isOpen, userProfile?.phone]);

  if (!isOpen) return null;

  // Construct fees from flattened TeamLeague properties
  const fees: TeamLeagueFeeConfig | undefined = teamLeague.entryFeeType !== 'none' || teamLeague.venueFeeEnabled
    ? {
        entryFeeType: teamLeague.entryFeeType,
        entryFeeAmount: teamLeague.entryFeeAmount,
        venueFeeEnabled: teamLeague.venueFeeEnabled,
        venueFeeAmount: teamLeague.venueFeeAmount,
        requirePaymentBeforeApproval: teamLeague.requirePaymentBeforeApproval,
        currency: teamLeague.feeCurrency,
      }
    : undefined;
  const selectedClub = userClubs.find(c => c.id === selectedClubId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await onRegister({
        name: teamName.trim(),
        clubId: selectedClubId || undefined,
        clubName: selectedClub?.name,
        homeVenue: homeVenue.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        captainIsPlaying,
      });
      onClose();
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Failed to register team');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Register Your Team</h2>
            <p className="text-sm text-gray-400">{teamLeagueName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Captain Role Selection */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Will you also play?
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              You will be registered as the Team Captain.
            </p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-amber-500 transition-colors">
                <input
                  type="radio"
                  name="captainRole"
                  checked={captainIsPlaying}
                  onChange={() => setCaptainIsPlaying(true)}
                  className="mt-0.5 w-4 h-4 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">Yes, I will play on this team</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-lime-600/80 text-lime-100">CAPTAIN</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-600/80 text-blue-100">PLAYER</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    You will be added to the roster and available for match lineups.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-amber-500 transition-colors">
                <input
                  type="radio"
                  name="captainRole"
                  checked={!captainIsPlaying}
                  onChange={() => setCaptainIsPlaying(false)}
                  className="mt-0.5 w-4 h-4 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">No, I will only manage the team</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-lime-600/80 text-lime-100">CAPTAIN</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    You will manage the team but not be on the playing roster.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Team Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Team Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g., North Shore Smashers"
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Club Affiliation */}
          {userClubs.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Club Affiliation (Optional)
              </label>
              <select
                value={selectedClubId}
                onChange={(e) => setSelectedClubId(e.target.value)}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
                disabled={isSubmitting}
              >
                <option value="">No club affiliation</option>
                {userClubs.map(club => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Only shows clubs you are a member of.
              </p>
            </div>
          )}

          {/* Home Venue */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Home Venue (Optional)
            </label>
            <input
              type="text"
              value={homeVenue}
              onChange={(e) => setHomeVenue(e.target.value)}
              placeholder="e.g., North Shore Pickleball Club"
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Contact Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Contact Phone (Optional)
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+64 21 123 4567"
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
              disabled={isSubmitting}
            />
          </div>

          {/* League Requirements */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              League Requirements
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Roster size</span>
                <span className="text-white">{teamLeague.minPlayersPerTeam} - {teamLeague.maxPlayersPerTeam} players</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>DUPR ID</span>
                <span className="text-white">{teamLeague.duprMode === 'required' ? 'Required' : 'Not required'}</span>
              </div>
              {teamLeague.duprRestrictions?.enabled && (
                <div className="flex justify-between text-gray-400">
                  <span>Rating cap</span>
                  <span className="text-white">{teamLeague.duprRestrictions.maxDoublesRating}</span>
                </div>
              )}
            </div>
          </div>

          {/* Fee Summary */}
          {fees && (fees.entryFeeType !== 'none' || fees.venueFeeEnabled) && (
            <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-200 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Fee Information
              </h3>
              <div className="space-y-2 text-sm">
                {fees.entryFeeType !== 'none' && (
                  <div className="flex justify-between text-amber-300/80">
                    <span>Entry Fee</span>
                    <span className="text-amber-100 font-medium">
                      {formatAmount(fees.entryFeeAmount)} {fees.entryFeeType === 'per_team' ? 'per team' : 'per player'}
                    </span>
                  </div>
                )}
                {fees.venueFeeEnabled && (
                  <div className="flex justify-between text-amber-300/80">
                    <span>Venue Fee</span>
                    <span className="text-amber-100 font-medium">
                      {formatAmount(fees.venueFeeAmount)} per fixture (home team)
                    </span>
                  </div>
                )}
                {fees.requirePaymentBeforeApproval && (
                  <p className="text-xs text-amber-300/60 mt-2 pt-2 border-t border-amber-700/50">
                    Payment required before team approval.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-lime-600 hover:bg-lime-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Registering...
                </>
              ) : (
                'Register Team'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TeamRegistrationModal;
