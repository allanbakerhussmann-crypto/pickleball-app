/**
 * LeagueRegistrationWizard Component
 * 
 * Simple registration wizard for leagues.
 * For singles: direct join
 * For doubles: partner selection with invite/open modes
 * 
 * FILE LOCATION: components/leagues/LeagueRegistrationWizard.tsx
 * VERSION: V05.17
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  joinLeague,
  searchUsers,
} from '../../services/firebase';
import type { League, UserProfile } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueRegistrationWizardProps {
  league: League;
  onClose: () => void;
  onComplete: () => void;
}

type PartnerMode = 'invite' | 'open_team';

interface PartnerSelection {
  mode: PartnerMode;
  partnerUserId?: string;
  partnerName?: string;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueRegistrationWizard: React.FC<LeagueRegistrationWizardProps> = ({
  league,
  onClose,
  onComplete,
}) => {
  const { currentUser, userProfile } = useAuth();
  
  // Step management
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Partner selection (for doubles)
  const [partnerSelection, setPartnerSelection] = useState<PartnerSelection>({ mode: 'invite' });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Determine league characteristics
  const isDoubles = league.type === 'doubles';
  const totalSteps = isDoubles ? 2 : 1;

  // ============================================
  // PARTNER SEARCH
  // ============================================

  const handlePartnerSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      // Use basic searchUsers for league partner search
      const results = await searchUsers(term);
      // Filter out current user
      const filtered = results.filter(u => u.id !== currentUser?.uid);
      setSearchResults(filtered);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectPartner = (user: UserProfile) => {
    setPartnerSelection({
      mode: 'invite',
      partnerUserId: user.id,
      partnerName: user.displayName || user.email || 'Partner',
    });
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleClearPartner = () => {
    setPartnerSelection({ mode: partnerSelection.mode });
  };

  // ============================================
  // REGISTRATION SUBMIT
  // ============================================

  const handleSubmit = async () => {
    if (!currentUser || !userProfile) return;
    
    setError(null);
    setLoading(true);
    
    try {
      // Validate partner selection for doubles
      if (isDoubles && partnerSelection.mode === 'invite' && !partnerSelection.partnerUserId) {
        throw new Error('Please select a partner to invite');
      }
      
      // Join the league - pass all required arguments
      // joinLeague(leagueId, userId, displayName, divisionId?, partnerUserId?, partnerDisplayName?)
      await joinLeague(
        league.id,
        currentUser.uid,
        userProfile.displayName || 'Player',
        null, // divisionId - null for now
        isDoubles ? (partnerSelection.partnerUserId || null) : null,
        isDoubles ? (partnerSelection.partnerName || null) : null
      );
      
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
    if (step === 1 && isDoubles) {
      if (partnerSelection.mode === 'invite' && !partnerSelection.partnerUserId) return false;
      // open_team doesn't require selection to proceed
    }
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
    } else {
      onClose();
    }
  };

  // ============================================
  // RENDER
  // ============================================

  const renderPartnerStep = () => (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        Select how you want to find a doubles partner:
      </p>
      
      {/* Partner Mode Selection */}
      <div className="flex flex-col gap-3">
        <label 
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
            partnerSelection.mode === 'invite' 
              ? 'border-blue-500 bg-blue-900/20' 
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            checked={partnerSelection.mode === 'invite'}
            onChange={() => setPartnerSelection({ mode: 'invite' })}
            className="w-4 h-4"
          />
          <div>
            <div className="font-semibold text-white">Invite a specific partner</div>
            <div className="text-xs text-gray-400">Search for someone you know</div>
          </div>
        </label>
        
        <label 
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
            partnerSelection.mode === 'open_team' 
              ? 'border-blue-500 bg-blue-900/20' 
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            checked={partnerSelection.mode === 'open_team'}
            onChange={() => setPartnerSelection({ mode: 'open_team' })}
            className="w-4 h-4"
          />
          <div>
            <div className="font-semibold text-white">I don't have a partner yet</div>
            <div className="text-xs text-gray-400">Register solo and find a partner later</div>
          </div>
        </label>
      </div>

      {/* Invite Partner Search */}
      {partnerSelection.mode === 'invite' && (
        <div className="space-y-3">
          {partnerSelection.partnerUserId ? (
            <div className="flex items-center justify-between p-3 bg-green-900/20 border border-green-700 rounded-lg">
              <div>
                <span className="text-green-400 font-semibold">Partner Selected:</span>
                <span className="text-white ml-2">{partnerSelection.partnerName}</span>
              </div>
              <button
                onClick={handleClearPartner}
                className="text-gray-400 hover:text-white text-sm"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handlePartnerSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
              />
              
              {searchLoading && (
                <div className="text-gray-400 text-sm">Searching...</div>
              )}
              
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg bg-gray-900">
                  {searchResults.map(user => (
                    <div
                      key={user.id}
                      onClick={() => handleSelectPartner(user)}
                      className="p-3 hover:bg-gray-800 cursor-pointer border-b border-gray-700 last:border-b-0"
                    >
                      <div className="font-semibold text-white">{user.displayName}</div>
                      <div className="text-xs text-gray-400">{user.email}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {searchTerm.length >= 2 && !searchLoading && searchResults.length === 0 && (
                <div className="text-gray-400 text-sm">No players found</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Open Team */}
      {partnerSelection.mode === 'open_team' && (
        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-blue-300 text-sm">
            ✓ You'll be registered and can find a partner later through the league page.
          </p>
        </div>
      )}
    </div>
  );

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
          
          {isDoubles && (
            <div className="flex justify-between">
              <span className="text-gray-400">Partner:</span>
              <span className="text-white">
                {partnerSelection.mode === 'open_team' 
                  ? 'Finding later'
                  : partnerSelection.partnerName || 'Not selected'}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {isDoubles && partnerSelection.mode === 'invite' && partnerSelection.partnerUserId && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
          <p className="text-yellow-300 text-sm">
            ⚠️ Your partner will receive an invitation to join your team.
          </p>
        </div>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    if (isDoubles && step === 1) {
      return renderPartnerStep();
    }
    return renderConfirmStep();
  };

  const getStepTitle = () => {
    if (isDoubles && step === 1) return 'Partner Selection';
    return 'Confirm Registration';
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
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
          
          {/* Progress */}
          {totalSteps > 1 && (
            <>
              <div className="flex items-center gap-2 mt-3">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded ${
                      i < step ? 'bg-blue-500' : 'bg-gray-700'
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

        {/* Footer */}
        <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 flex justify-between">
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
          >
            {loading ? 'Joining...' : step === totalSteps ? 'Join League' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeagueRegistrationWizard;