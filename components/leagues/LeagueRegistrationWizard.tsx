/**
 * LeagueRegistrationWizard Component
 *
 * Simple registration wizard for leagues.
 * For singles: direct join
 * For doubles: uses DoublesPartnerFlow with invite/open team/join modes
 *
 * FILE LOCATION: components/leagues/LeagueRegistrationWizard.tsx
 * VERSION: V07.26
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  joinLeague,
  updateUserProfile,
  joinLeagueWithPartnerInvite,
  joinLeagueAsOpenTeam,
  joinOpenTeamDirect,
  cancelPendingRequestsForTeam,
} from '../../services/firebase';
import { getDuprLoginIframeUrl, parseDuprLoginEvent } from '../../services/dupr';
import { DoublesPartnerFlow, type PartnerSelection } from './DoublesPartnerFlow';
import type { League, UserProfile } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueRegistrationWizardProps {
  league: League;
  onClose: () => void;
  onComplete: () => void;
  /** V07.27: When true, only shows join_open option (for full leagues with open teams) */
  onlyJoinOpen?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueRegistrationWizard: React.FC<LeagueRegistrationWizardProps> = ({
  league,
  onClose,
  onComplete,
  onlyJoinOpen = false,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Step management
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Partner selection (for doubles)
  const [partnerSelection, setPartnerSelection] = useState<PartnerSelection | null>(null);

  // DUPR Required modal state
  const [showDuprRequiredModal, setShowDuprRequiredModal] = useState(false);
  const [duprLinking, setDuprLinking] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(userProfile);

  // Determine league characteristics
  const isDoubles = league.type === 'doubles';

  // Check if DUPR is required and user doesn't have it linked
  const isDuprRequired = league.settings?.duprSettings?.mode === 'required';
  const userHasDupr = !!(currentUserProfile?.duprId);
  const needsDuprLink = isDuprRequired && !userHasDupr;

  // Show DUPR required modal if user doesn't have DUPR linked
  useEffect(() => {
    if (needsDuprLink) {
      setShowDuprRequiredModal(true);
    }
  }, [needsDuprLink]);

  // Listen for DUPR login messages
  useEffect(() => {
    if (!showDuprRequiredModal) return;

    const handleDuprMessage = async (event: MessageEvent) => {
      const loginData = parseDuprLoginEvent(event);
      if (!loginData || !currentUser?.uid) return;

      console.log('DUPR login successful from league registration:', loginData);
      setDuprLinking(true);

      try {
        // Update user profile with DUPR data
        await updateUserProfile(currentUser.uid, {
          duprId: loginData.duprId,
          duprDisplayName: loginData.displayName,
          duprSinglesRating: loginData.singles,
          duprDoublesRating: loginData.doubles,
          duprSinglesReliability: loginData.singlesReliability,
          duprDoublesReliability: loginData.doublesReliability,
          duprLinkedAt: Date.now(),
        });

        // Update local state
        setCurrentUserProfile(prev => prev ? ({
          ...prev,
          duprId: loginData.duprId,
          duprDisplayName: loginData.displayName,
          duprSinglesRating: loginData.singles,
          duprDoublesRating: loginData.doubles,
        }) : null);

        // Close modal after successful link
        setShowDuprRequiredModal(false);
      } catch (error) {
        console.error('Failed to link DUPR account:', error);
      } finally {
        setDuprLinking(false);
      }
    };

    window.addEventListener('message', handleDuprMessage);
    return () => window.removeEventListener('message', handleDuprMessage);
  }, [showDuprRequiredModal, currentUser?.uid]);

  // For doubles: step 1 is partner selection, step 2 is confirm
  // For singles: step 1 is confirm
  const totalSteps = isDoubles ? 2 : 1;

  // ============================================
  // PARTNER SELECTION HANDLER
  // ============================================

  const handlePartnerSelected = (selection: PartnerSelection) => {
    setPartnerSelection(selection);
    setStep(2); // Move to confirmation step
  };

  // ============================================
  // REGISTRATION SUBMIT
  // ============================================

  const handleSubmit = async () => {
    if (!currentUser || !userProfile) return;

    setError(null);
    setLoading(true);

    try {
      if (isDoubles) {
        // Handle doubles registration based on partner selection mode
        if (!partnerSelection) {
          throw new Error('Please select a partner option');
        }

        switch (partnerSelection.mode) {
          case 'invite':
            // Invite a specific partner - creates member + invite atomically
            if (!partnerSelection.partnerUserId || !partnerSelection.partnerName) {
              throw new Error('Please select a partner to invite');
            }
            await joinLeagueWithPartnerInvite(
              league.id,
              currentUser.uid,
              userProfile.displayName || 'Player',
              userProfile.duprId || null,
              partnerSelection.partnerUserId,
              partnerSelection.partnerName,
              partnerSelection.partnerDuprId || null,
              null, // divisionId
              league.name
            );
            break;

          case 'open_team':
            // Create open team looking for partner
            await joinLeagueAsOpenTeam(
              league.id,
              currentUser.uid,
              userProfile.displayName || 'Player',
              userProfile.duprId || null,
              null // divisionId
            );
            break;

          case 'join_open':
            // V07.27: Direct join to open team (no request/approval needed)
            // The team owner consented to auto-matching by creating an open team
            if (!partnerSelection.openTeamMemberId || !partnerSelection.openTeamOwnerName) {
              throw new Error('Please select a team to join');
            }
            // Directly join the open team - this makes us the partner immediately
            const result = await joinOpenTeamDirect(
              league.id,
              partnerSelection.openTeamMemberId,
              currentUser.uid,
              userProfile.displayName || 'Player',
              userProfile.duprId || null
            );
            console.log('Joined team:', result.teamName);
            // Clean up any other pending requests for this team (non-critical, best effort)
            try {
              await cancelPendingRequestsForTeam(partnerSelection.openTeamMemberId);
            } catch (cleanupErr) {
              // Cleanup is not critical - old requests will expire naturally
              console.log('Note: Could not clean up old requests:', cleanupErr);
            }
            break;

          default:
            throw new Error('Invalid partner selection mode');
        }
      } else {
        // Singles league - direct join
        await joinLeague(
          league.id,
          currentUser.uid,
          userProfile.displayName || 'Player',
          null // divisionId
        );
      }

      onComplete();
    } catch (e: any) {
      console.error('Registration failed:', e);
      setError(e.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP NAVIGATION
  // ============================================

  const canProceed = () => {
    // For doubles on confirmation step, partner must be selected
    if (isDoubles && step === 2 && !partnerSelection) return false;
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      if (isDoubles && step === 2) {
        // Going back to partner selection, clear selection
        setPartnerSelection(null);
      }
    } else {
      onClose();
    }
  };

  // ============================================
  // RENDER
  // ============================================

  const renderConfirmStep = () => (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="font-semibold text-white mb-3">Registration Summary</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">League:</span>
            <span className="text-white">{league.name}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Type:</span>
            <span className="text-white capitalize">{league.type}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Format:</span>
            <span className="text-white capitalize">{league.format.replace('_', ' ')}</span>
          </div>

          {isDoubles && partnerSelection && (
            <div className="flex justify-between">
              <span className="text-gray-400">Partner:</span>
              <span className="text-white">
                {partnerSelection.mode === 'open_team'
                  ? 'Looking for partner'
                  : partnerSelection.mode === 'join_open'
                  ? `Joining ${partnerSelection.openTeamOwnerName}'s team`
                  : partnerSelection.partnerName || 'Not selected'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mode-specific messages */}
      {isDoubles && partnerSelection?.mode === 'invite' && (
        <div className="bg-lime-900/20 border border-lime-700 rounded-lg p-3">
          <p className="text-lime-300 text-sm">
            Your partner will receive an invitation. Your team will show as "Pending Partner" until they accept.
          </p>
        </div>
      )}

      {isDoubles && partnerSelection?.mode === 'open_team' && (
        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-300 text-sm">
            You'll be registered as an open team. The first eligible player who joins will automatically become your partner.
          </p>
        </div>
      )}

      {isDoubles && partnerSelection?.mode === 'join_open' && (
        <div className="bg-lime-900/20 border border-lime-700 rounded-lg p-3">
          <p className="text-lime-300 text-sm">
            You will be automatically partnered with {partnerSelection.openTeamOwnerName}. Open teams accept all eligible players.
          </p>
        </div>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    // For doubles, step 1 is partner selection using DoublesPartnerFlow
    if (isDoubles && step === 1) {
      return (
        <DoublesPartnerFlow
          league={league}
          onPartnerSelected={handlePartnerSelected}
          onBack={onClose}
          onlyJoinOpen={onlyJoinOpen}
        />
      );
    }
    return renderConfirmStep();
  };

  const getStepTitle = () => {
    if (isDoubles && step === 1) return 'Partner Selection';
    return 'Confirm Registration';
  };

  // For doubles step 1, DoublesPartnerFlow handles its own navigation
  const showFooter = !(isDoubles && step === 1);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      {/* DUPR Required Modal */}
      {showDuprRequiredModal && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[70] rounded-lg p-4 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-lg border border-lime-500/50 shadow-2xl max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-lime-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">DUPR Account Required</h3>
            <p className="text-gray-300 mb-4 text-sm">
              This league requires a linked DUPR account for match result submissions. Please link your DUPR account to continue with registration.
            </p>

            {duprLinking ? (
              <div className="py-8">
                <div className="animate-spin w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-400 text-sm">Linking your DUPR account...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-lg p-2 border border-gray-700">
                  <iframe
                    src={getDuprLoginIframeUrl()}
                    className="w-full h-[400px] rounded"
                    title="Link DUPR Account"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Sign in with your DUPR credentials above to link your account.
                </p>
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              Cancel Registration
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-800 w-full max-w-lg rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Join {league.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress - only show when not on partner selection step */}
          {totalSteps > 1 && !(isDoubles && step === 1) && (
            <>
              <div className="flex items-center gap-2 mt-3">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded ${
                      i < step ? 'bg-lime-500' : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>
              <div className="text-sm text-gray-400 mt-2">
                Step {step} of {totalSteps}: {getStepTitle()}
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {renderCurrentStep()}
        </div>

        {/* Footer - hide during partner selection (DoublesPartnerFlow has its own) */}
        {showFooter && (
          <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 flex justify-between">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="px-6 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Joining...' : 'Join League'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeagueRegistrationWizard;
