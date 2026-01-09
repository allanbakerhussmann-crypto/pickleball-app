/**
 * DoublesPartnerFlow Component
 *
 * Handles partner selection for doubles leagues:
 * - Invite a specific partner
 * - Create open team (looking for partner)
 * - Request to join an open team
 *
 * @version 07.26
 * @file components/leagues/DoublesPartnerFlow.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  searchUsers,
  getOpenLeagueMembers,
} from '../../services/firebase';
import type { League, UserProfile, LeagueMember } from '../../types';

// ============================================
// TYPES
// ============================================

interface DoublesPartnerFlowProps {
  league: League;
  onPartnerSelected: (selection: PartnerSelection) => void;
  onBack: () => void;
  /** V07.27: When true, only shows join_open option (for full leagues with open teams) */
  onlyJoinOpen?: boolean;
}

export type PartnerMode = 'invite' | 'open_team' | 'join_open';

export interface PartnerSelection {
  mode: PartnerMode;
  partnerUserId?: string;
  partnerName?: string;
  partnerDuprId?: string | null;
  openTeamMemberId?: string;
  openTeamOwnerName?: string;
}

interface OpenTeamWithOwner {
  member: LeagueMember;
  owner: UserProfile | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const checkAgeEligibility = (
  userDateOfBirth: string | undefined,
  divisionMaxAge?: number
): { eligible: boolean; reason?: string } => {
  if (!divisionMaxAge || !userDateOfBirth) return { eligible: true };

  const birthDate = new Date(userDateOfBirth);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();

  // Youth protection: Adults cannot enter Under-18 divisions
  if (divisionMaxAge < 18 && age >= 18) {
    return { eligible: false, reason: 'Adults cannot enter youth divisions' };
  }

  return { eligible: true };
};

const checkDuprEligibility = (
  userRating: number | undefined,
  divisionMaxRating?: number
): { eligible: boolean; reason?: string } => {
  if (!divisionMaxRating || !userRating) return { eligible: true };

  // Anti-sandbagging: Higher rated players CANNOT play down
  if (userRating > divisionMaxRating) {
    return { eligible: false, reason: `Rating too high (max ${divisionMaxRating})` };
  }

  return { eligible: true };
};

// ============================================
// COMPONENT
// ============================================

export const DoublesPartnerFlow: React.FC<DoublesPartnerFlowProps> = ({
  league,
  onPartnerSelected,
  onBack,
  onlyJoinOpen = false,
}) => {
  const { currentUser } = useAuth();

  // Mode selection - V07.27: Auto-select join_open if only that mode is allowed
  const [selectedMode, setSelectedMode] = useState<PartnerMode | null>(onlyJoinOpen ? 'join_open' : null);

  // Invite mode state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<UserProfile | null>(null);

  // Open team mode state
  const [openTeams, setOpenTeams] = useState<OpenTeamWithOwner[]>([]);
  const [openTeamsLoading, setOpenTeamsLoading] = useState(false);
  const [selectedOpenTeam, setSelectedOpenTeam] = useState<OpenTeamWithOwner | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);

  // League settings
  const isDuprRequired = league.settings?.duprSettings?.mode === 'required';
  const divisionMaxRating = league.settings?.duprSettings?.maxDuprRating ?? undefined;
  const divisionMaxAge = (league.settings as any)?.maxAge;

  // ============================================
  // SEARCH PARTNERS
  // ============================================

  const handleSearch = useCallback(async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await searchUsers(term);
      // Filter out current user
      const filtered = results.filter(u => u.id !== currentUser?.uid);
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [currentUser?.uid]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length >= 2) {
        handleSearch(searchTerm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch]);

  // ============================================
  // LOAD OPEN TEAMS
  // ============================================

  useEffect(() => {
    if (selectedMode === 'join_open') {
      loadOpenTeams();
    }
  }, [selectedMode]);

  const loadOpenTeams = async () => {
    setOpenTeamsLoading(true);
    try {
      const members = await getOpenLeagueMembers(league.id);
      // Enrich with owner profiles
      const enriched: OpenTeamWithOwner[] = await Promise.all(
        members.map(async (member) => {
          // TODO: Fetch owner profile
          return { member, owner: null };
        })
      );
      setOpenTeams(enriched);
    } catch (err) {
      console.error('Failed to load open teams:', err);
      setError('Failed to load available teams');
    } finally {
      setOpenTeamsLoading(false);
    }
  };

  // ============================================
  // ELIGIBILITY CHECKS
  // ============================================

  const getPartnerEligibility = (user: UserProfile): { eligible: boolean; reasons: string[] } => {
    const reasons: string[] = [];

    // DUPR check
    if (isDuprRequired && !user.duprId) {
      reasons.push('No DUPR linked');
    }

    // Rating check (anti-sandbagging)
    const ratingCheck = checkDuprEligibility(user.duprDoublesRating, divisionMaxRating);
    if (!ratingCheck.eligible && ratingCheck.reason) {
      reasons.push(ratingCheck.reason);
    }

    // Age check (dateOfBirth may not be set on all profiles)
    const ageCheck = checkAgeEligibility((user as any).dateOfBirth, divisionMaxAge);
    if (!ageCheck.eligible && ageCheck.reason) {
      reasons.push(ageCheck.reason);
    }

    return { eligible: reasons.length === 0, reasons };
  };

  // ============================================
  // SELECTION HANDLERS
  // ============================================

  const handleSelectPartner = (user: UserProfile) => {
    const { eligible } = getPartnerEligibility(user);
    if (!eligible) return;

    setSelectedPartner(user);
  };

  const handleSelectOpenTeam = (team: OpenTeamWithOwner) => {
    setSelectedOpenTeam(team);
  };

  const handleConfirm = () => {
    if (selectedMode === 'invite' && selectedPartner) {
      onPartnerSelected({
        mode: 'invite',
        partnerUserId: selectedPartner.id,
        partnerName: selectedPartner.displayName || selectedPartner.email,
        partnerDuprId: selectedPartner.duprId || null,
      });
    } else if (selectedMode === 'open_team') {
      onPartnerSelected({
        mode: 'open_team',
      });
    } else if (selectedMode === 'join_open' && selectedOpenTeam) {
      onPartnerSelected({
        mode: 'join_open',
        openTeamMemberId: selectedOpenTeam.member.id,
        openTeamOwnerName: selectedOpenTeam.member.displayName,
        partnerUserId: selectedOpenTeam.member.userId, // Owner's userId for createLeagueJoinRequest
      });
    }
  };

  // ============================================
  // RENDER MODE SELECTION
  // ============================================

  const renderModeSelection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-6">
        How would you like to find a partner?
      </h3>

      {/* Invite Option */}
      <button
        onClick={() => setSelectedMode('invite')}
        className={`w-full group relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all duration-300 ${
          selectedMode === 'invite'
            ? 'border-lime-500 bg-lime-500/10'
            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
        }`}
      >
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            selectedMode === 'invite' ? 'bg-lime-500 text-gray-900' : 'bg-gray-700 text-gray-300'
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white text-lg mb-1">Invite a Specific Partner</h4>
            <p className="text-gray-400 text-sm">
              Search for someone you know. They'll receive an invitation to join your team.
            </p>
          </div>
          {selectedMode === 'invite' && (
            <div className="absolute top-3 right-3">
              <div className="w-6 h-6 rounded-full bg-lime-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Open Team Option */}
      <button
        onClick={() => setSelectedMode('open_team')}
        className={`w-full group relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all duration-300 ${
          selectedMode === 'open_team'
            ? 'border-lime-500 bg-lime-500/10'
            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
        }`}
      >
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            selectedMode === 'open_team' ? 'bg-lime-500 text-gray-900' : 'bg-gray-700 text-gray-300'
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white text-lg mb-1">I Don't Have a Partner Yet</h4>
            <p className="text-gray-400 text-sm">
              Register now and be matched with the first eligible player who joins.
            </p>
            <p className="text-yellow-400 text-xs mt-1">
              Note: You will be automatically partnered with whoever joins first.
            </p>
          </div>
          {selectedMode === 'open_team' && (
            <div className="absolute top-3 right-3">
              <div className="w-6 h-6 rounded-full bg-lime-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Join Open Team Option */}
      <button
        onClick={() => setSelectedMode('join_open')}
        className={`w-full group relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all duration-300 ${
          selectedMode === 'join_open'
            ? 'border-lime-500 bg-lime-500/10'
            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
        }`}
      >
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            selectedMode === 'join_open' ? 'bg-lime-500 text-gray-900' : 'bg-gray-700 text-gray-300'
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white text-lg mb-1">Join a Player Looking for Partner</h4>
            <p className="text-gray-400 text-sm">
              Browse players who need a partner and request to join their team.
            </p>
          </div>
          {selectedMode === 'join_open' && (
            <div className="absolute top-3 right-3">
              <div className="w-6 h-6 rounded-full bg-lime-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </button>
    </div>
  );

  // ============================================
  // RENDER INVITE MODE
  // ============================================

  const renderInviteMode = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            setSelectedMode(null);
            setSelectedPartner(null);
            setSearchTerm('');
            setSearchResults([]);
          }}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-semibold text-white">Invite a Partner</h3>
      </div>

      {selectedPartner ? (
        // Selected partner card
        <div className="relative">
          <div className="bg-gradient-to-br from-lime-500/20 to-lime-600/10 rounded-xl border-2 border-lime-500 p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-lime-500/30 flex items-center justify-center text-lime-400 font-bold text-xl">
                {(selectedPartner.displayName || selectedPartner.email || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-white text-lg">
                  {selectedPartner.displayName || selectedPartner.email}
                </h4>
                <p className="text-gray-400 text-sm">{selectedPartner.email}</p>
                {selectedPartner.duprId && (
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-lime-500/20 text-lime-400 text-xs font-medium">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    DUPR Linked
                    {selectedPartner.duprDoublesRating && (
                      <span className="ml-1">• {selectedPartner.duprDoublesRating.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedPartner(null)}
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-yellow-200 text-sm">
                Your partner will receive an invitation. Your team will show as "Pending Partner" until they accept.
              </p>
            </div>
          </div>
        </div>
      ) : (
        // Search interface
        <>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 pl-11 rounded-xl focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 transition-all"
            />
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-700 bg-gray-800/50 divide-y divide-gray-700/50">
              {searchResults.map(user => {
                const { eligible, reasons } = getPartnerEligibility(user);
                const hasDupr = !!user.duprId;

                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectPartner(user)}
                    disabled={!eligible}
                    className={`w-full p-4 text-left transition-all ${
                      eligible
                        ? 'hover:bg-gray-700/50 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                        eligible ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500'
                      }`}>
                        {(user.displayName || user.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">
                          {user.displayName || user.email}
                        </div>
                        <div className="text-sm text-gray-400 truncate">{user.email}</div>
                        {reasons.length > 0 && (
                          <div className="text-xs text-red-400 mt-1">
                            {reasons.join(' • ')}
                          </div>
                        )}
                      </div>
                      {isDuprRequired && (
                        <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${
                          hasDupr
                            ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {hasDupr ? '✓ DUPR' : '✗ No DUPR'}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {searchTerm.length >= 2 && !searchLoading && searchResults.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p>No players found matching "{searchTerm}"</p>
            </div>
          )}

          {searchTerm.length < 2 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              Type at least 2 characters to search
            </div>
          )}
        </>
      )}
    </div>
  );

  // ============================================
  // RENDER OPEN TEAM MODE
  // ============================================

  const renderOpenTeamMode = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setSelectedMode(null)}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-semibold text-white">Create Open Team</h3>
      </div>

      <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/30 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white text-lg mb-2">Looking for Partner</h4>
            <p className="text-gray-300 text-sm mb-4">
              Your team will be visible to other eligible players. The first person who joins will automatically become your partner.
            </p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                First eligible player to join becomes your partner
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Matches generated once team is complete
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Can still invite specific partners anytime
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Important Warning */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h5 className="font-semibold text-yellow-400 mb-1">Important</h5>
            <p className="text-yellow-200/80 text-sm">
              By choosing this option, you agree to be partnered with whoever joins first.
              If you want to choose your partner, use the "Invite a Specific Partner" option instead.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================
  // RENDER JOIN OPEN MODE
  // ============================================

  const renderJoinOpenMode = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            setSelectedMode(null);
            setSelectedOpenTeam(null);
          }}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-semibold text-white">Join an Open Team</h3>
      </div>

      {selectedOpenTeam ? (
        <div className="relative">
          <div className="bg-gradient-to-br from-lime-500/20 to-lime-600/10 rounded-xl border-2 border-lime-500 p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-lime-500/30 flex items-center justify-center text-lime-400 font-bold text-xl">
                {selectedOpenTeam.member.displayName[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-white text-lg">
                  {selectedOpenTeam.member.displayName}
                </h4>
                <p className="text-gray-400 text-sm">Looking for partner</p>
                {selectedOpenTeam.member.duprId && (
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-lime-500/20 text-lime-400 text-xs font-medium">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    DUPR Linked
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedOpenTeam(null)}
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-4 p-4 bg-lime-500/10 border border-lime-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-lime-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-lime-200 text-sm">
                You will be automatically partnered with {selectedOpenTeam.member.displayName}. Open teams accept all eligible players.
              </p>
            </div>
          </div>
        </div>
      ) : openTeamsLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-2 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading available teams...</p>
        </div>
      ) : openTeams.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-700">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h4 className="text-white font-medium mb-2">No Open Teams Available</h4>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            There are no players currently looking for partners. Try inviting someone you know instead.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {openTeams.map(team => {
            const hasDupr = !!team.member.duprId;

            return (
              <button
                key={team.member.id}
                onClick={() => handleSelectOpenTeam(team)}
                className="w-full p-4 rounded-xl border border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold text-lg">
                    {team.member.displayName[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white">
                      {team.member.displayName}
                    </div>
                    <div className="text-sm text-gray-400">
                      Looking for partner
                    </div>
                  </div>
                  {isDuprRequired && (
                    <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${
                      hasDupr
                        ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {hasDupr ? '✓ DUPR' : '✗ No DUPR'}
                    </div>
                  )}
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ============================================
  // RENDER
  // ============================================

  const canConfirm =
    (selectedMode === 'invite' && selectedPartner) ||
    selectedMode === 'open_team' ||
    (selectedMode === 'join_open' && selectedOpenTeam);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {selectedMode === null && renderModeSelection()}
        {selectedMode === 'invite' && renderInviteMode()}
        {selectedMode === 'open_team' && renderOpenTeamMode()}
        {selectedMode === 'join_open' && renderJoinOpenMode()}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-6 border-t border-gray-700 bg-gray-900/50">
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 px-6 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
              canConfirm
                ? 'bg-lime-500 hover:bg-lime-400 text-gray-900'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {selectedMode === 'invite' && selectedPartner
              ? 'Send Invitation'
              : selectedMode === 'open_team'
              ? 'Create Open Team'
              : selectedMode === 'join_open' && selectedOpenTeam
              ? 'Join Team'
              : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoublesPartnerFlow;
