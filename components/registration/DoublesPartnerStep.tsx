import React, { useEffect, useState } from 'react';
import type {
  Tournament,
  Division,
  Team,
  TournamentRegistration,
  UserProfile,
} from '../../types';
import {
  getOpenTeamsForDivision,
  searchUsers,
  getUsersByIds,
  getTeamsForDivision,
  getPendingInvitesForDivision,
} from '../../services/firebase';

interface DoublesPartnerStepProps {
  tournament: Tournament;
  divisions: Division[];
  selectedDivisionIds: string[];
  userProfile: UserProfile;
  partnerDetails: TournamentRegistration['partnerDetails'];
  setPartnerDetails: (
    updater:
      | TournamentRegistration['partnerDetails']
      | ((prev: TournamentRegistration['partnerDetails']) => TournamentRegistration['partnerDetails'])
  ) => void;
}

interface OpenTeamWithOwner {
  team: Team;
  owner: UserProfile | null;
}

const getAge = (birthDate?: string | null): number | null => {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age;
};

// Rating / age rules
const checkPartnerEligibility = (division: Division, player: UserProfile): { eligible: boolean; reason?: string } => {
  const rating =
    player.duprDoublesRating ??
    player.ratingDoubles ??
    player.duprSinglesRating ??
    player.ratingSingles ??
    0;

  if (division.minRating != null && rating < division.minRating) return { eligible: false, reason: `Rating too low (${rating.toFixed(2)} < ${division.minRating})` };
  if (division.maxRating != null && rating > division.maxRating) return { eligible: false, reason: `Rating too high (${rating.toFixed(2)} > ${division.maxRating})` };

  const age = getAge(player.birthDate);
  if (division.minAge != null && (age == null || age < division.minAge)) return { eligible: false, reason: `Too young (${age ?? '?'} < ${division.minAge})` };
  if (division.maxAge != null && (age == null || age > division.maxAge)) return { eligible: false, reason: `Too old (${age ?? '?'} > ${division.maxAge})` };

  return { eligible: true };
};

// Gender rules per division
const checkGenderCompatibility = (
  division: Division,
  p1: UserProfile,
  p2: UserProfile
): { allowed: boolean; reason?: string } => {
  const g1 = p1.gender;
  const g2 = p2.gender;

  switch (division.gender) {
    case 'men':
      // both must be male
      if (g1 === 'male' && g2 === 'male') return { allowed: true };
      return { allowed: false, reason: 'Must be Male' };
    case 'women':
      // both must be female
      if (g1 === 'female' && g2 === 'female') return { allowed: true };
      return { allowed: false, reason: 'Must be Female' };
    case 'mixed':
      // must be opposite genders and both known
      if (!g1 || !g2) return { allowed: false, reason: 'Unknown Gender' };
      if (g1 !== g2) return { allowed: true };
      return { allowed: false, reason: 'Must be Mixed Gender' };
    case 'open':
    default:
      // no gender restriction
      return { allowed: true };
  }
};

export const DoublesPartnerStep: React.FC<DoublesPartnerStepProps> = ({
  tournament,
  divisions,
  selectedDivisionIds,
  userProfile,
  partnerDetails,
  setPartnerDetails,
}) => {
  const [openTeamsByDivision, setOpenTeamsByDivision] = useState<
    Record<string, OpenTeamWithOwner[]>
  >({});
  const [searchResults, setSearchResults] = useState<
    Record<string, UserProfile[]>
  >({});
  const [searchTerm, setSearchTerm] = useState<Record<string, string>>({});
  const [loadingOpenTeams, setLoadingOpenTeams] = useState(false);
  
  // Map of userId -> reason why they are unavailable
  const [unavailableUsers, setUnavailableUsers] = useState<Map<string, string>>(new Map());

  // Load unavailable players (already registered in teams OR have pending invite)
  useEffect(() => {
    const loadUnavailable = async () => {
        const statusMap = new Map<string, string>();
        
        for (const divId of selectedDivisionIds) {
            // 1. Check existing teams
            const teams = await getTeamsForDivision(tournament.id, divId);
            teams.forEach(t => {
                if (t.status !== 'withdrawn' && t.status !== 'cancelled') {
                    t.players.forEach(p => statusMap.set(p, 'Already Registered'));
                }
            });

            // 2. Check pending invites
            const invites = await getPendingInvitesForDivision(tournament.id, divId);
            invites.forEach(inv => {
                // If the user already has a status (e.g. Registered), keep it. Registered > Invited.
                if (!statusMap.has(inv.invitedUserId)) {
                     statusMap.set(inv.invitedUserId, 'Has Pending Invite');
                }
            });
        }
        setUnavailableUsers(statusMap);
    };
    if (selectedDivisionIds.length > 0) {
        loadUnavailable();
    }
  }, [selectedDivisionIds, tournament.id]);

  // Load open teams + owner profiles and apply constraints
  useEffect(() => {
    const load = async () => {
      setLoadingOpenTeams(true);
      try {
        const result: Record<string, OpenTeamWithOwner[]> = {};

        for (const divId of selectedDivisionIds) {
          const div = divisions.find(d => d.id === divId);
          if (!div || div.type !== 'doubles') continue;

          const teams = await getOpenTeamsForDivision(tournament.id, divId);

          // get owner IDs (player[0]) and fetch their profiles
          const ownerIds = Array.from(
            new Set(
              teams
                .map(t => t.players?.[0])
                .filter((id): id is string => !!id)
            )
          );

          let ownersById: Record<string, UserProfile> = {};
          if (ownerIds.length > 0) {
            const owners = await getUsersByIds(ownerIds);
            ownersById = owners.reduce<Record<string, UserProfile>>((acc, u) => {
              acc[u.id] = u;
              return acc;
            }, {});
          }

          const enriched: OpenTeamWithOwner[] = [];

          for (const t of teams) {
            const ownerId = t.players?.[0];
            const owner = ownerId ? ownersById[ownerId] ?? null : null;

            // We can only apply gender rules if we know owner + current user
            if (!owner) continue;

            // rating/age constraints on both owner and joining player
            const ownerCheck = checkPartnerEligibility(div, owner);
            if (!ownerCheck.eligible) continue;
            
            const userCheck = checkPartnerEligibility(div, userProfile);
            if (!userCheck.eligible) continue;

            // gender rules (men / women / mixed / open)
            const genderCheck = checkGenderCompatibility(div, owner, userProfile);
            if (!genderCheck.allowed) continue;

            enriched.push({ team: t, owner });
          }

          result[divId] = enriched;
        }

        setOpenTeamsByDivision(result);
      } finally {
        setLoadingOpenTeams(false);
      }
    };

    if (selectedDivisionIds.length > 0) {
      load();
    }
  }, [selectedDivisionIds.join(','), divisions.length, tournament.id, userProfile.id]);

  const handleModeChange = (
    divId: string,
    mode: 'invite' | 'open_team' | 'join_open'
  ) => {
    setPartnerDetails(prev => {
      const next = { ...(prev || {}) };
      // IMPORTANT: Do not set properties to `undefined`, as Firestore rejects them.
      // We simply overwrite the object for this key with only the fields needed.
      next[divId] = {
        mode,
      };
      return next;
    });
  };

  const handleInviteSearch = async (divId: string, term: string) => {
    setSearchTerm(prev => ({ ...prev, [divId]: term }));
    if (!term || term.length < 2) {
      setSearchResults(prev => ({ ...prev, [divId]: [] }));
      return;
    }
    const results = await searchUsers(term);
    setSearchResults(prev => ({ ...prev, [divId]: results }));
  };

  const handleSelectInvitePartner = (divId: string, user: UserProfile) => {
    setPartnerDetails(prev => {
      const next = { ...(prev || {}) };
      next[divId] = {
        mode: 'invite',
        partnerUserId: user.id,
        partnerName: user.displayName || user.email,
      };
      return next;
    });
    setSearchTerm(prev => ({ ...prev, [divId]: '' }));
    setSearchResults(prev => ({ ...prev, [divId]: [] }));
  };

  const handleClearInvitePartner = (divId: string) => {
    setPartnerDetails(prev => {
      const next = { ...(prev || {}) };
      next[divId] = {
        mode: 'invite',
      };
      return next;
    });
  };

  const handleSelectOpenTeam = (divId: string, team: Team) => {
    setPartnerDetails(prev => {
      const next = { ...(prev || {}) };
      next[divId] = {
        mode: 'join_open',
        openTeamId: team.id,
      };
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {selectedDivisionIds
        .map(id => divisions.find(d => d.id === id))
        .filter((d): d is Division => !!d && d.type === 'doubles')
        .map(div => {
          const partnerInfo = partnerDetails?.[div.id];
          const mode = partnerInfo?.mode || 'invite';
          const openTeams = openTeamsByDivision[div.id] || [];

          return (
            <div
              key={div.id}
              className="bg-gray-800 p-4 rounded border border-gray-700 space-y-3"
            >
              <h3 className="text-white font-bold text-sm">
                {div.name} – Doubles Partner
              </h3>

              {/* Mode selection */}
              <div className="flex flex-col md:flex-row gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === 'invite'}
                    onChange={() => handleModeChange(div.id, 'invite')}
                  />
                  <span>Invite a specific partner</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === 'open_team'}
                    onChange={() => handleModeChange(div.id, 'open_team')}
                  />
                  <span>I don&apos;t have a partner yet</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === 'join_open'}
                    onChange={() => handleModeChange(div.id, 'join_open')}
                  />
                  <span>Join a player looking for a partner</span>
                </label>
              </div>

              {/* Invite mode */}
              {mode === 'invite' && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-gray-400">
                    Search for your partner by name or email. <br/>
                    <span className="italic">Note: Players who do not meet division criteria or are already registered will be shown but disabled.</span>
                  </p>

                  {!partnerInfo?.partnerUserId && (
                    <>
                      <input
                        className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                        placeholder="Start typing a name or email..."
                        value={searchTerm[div.id] || ''}
                        onChange={e => handleInviteSearch(div.id, e.target.value)}
                      />
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {(searchResults[div.id] || [])
                          // exclude self from list always
                          .filter(u => u.id !== userProfile.id)
                          .map(u => {
                            const unavailabilityReason = unavailableUsers.get(u.id);
                            const isUnavailable = !!unavailabilityReason;
                            
                            const eligibility = checkPartnerEligibility(div, u);
                            const genderComp = checkGenderCompatibility(div, userProfile, u);
                            
                            const isDisabled = isUnavailable || !eligibility.eligible || !genderComp.allowed;
                            let disableReason = '';
                            if (isUnavailable) disableReason = unavailabilityReason!;
                            else if (!eligibility.eligible) disableReason = eligibility.reason || 'Not eligible';
                            else if (!genderComp.allowed) disableReason = genderComp.reason || 'Gender mismatch';

                            const g =
                              u.gender === 'male'
                                ? 'M'
                                : u.gender === 'female'
                                ? 'F'
                                : '?';

                            return (
                              <button
                                key={u.id}
                                type="button"
                                disabled={isDisabled}
                                className={`w-full text-left text-xs p-2 rounded flex justify-between items-center ${
                                    isDisabled 
                                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                                    : 'bg-gray-900 hover:bg-gray-700 text-white cursor-pointer'
                                }`}
                                onClick={() => !isDisabled && handleSelectInvitePartner(div.id, u)}
                              >
                                <div>
                                    {u.displayName || u.email}{' '}
                                    <span className={`text-[10px] ${isDisabled ? 'text-gray-600' : 'text-gray-400'}`}>
                                    ({u.email}) [{g}]
                                    </span>
                                </div>
                                {isDisabled && (
                                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                        {disableReason}
                                    </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                      
                      {/* Help text for non-existing users */}
                      <p className="text-[10px] text-gray-500 italic mt-2 border-t border-gray-700 pt-2">
                        Partner not listed? If they don't have an account yet, select <strong>"I don't have a partner yet"</strong> below. 
                        They can sign up later and join your team.
                      </p>
                    </>
                  )}

                  {partnerInfo?.partnerName && (
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-xs text-green-400">
                        Selected: {partnerInfo.partnerName}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClearInvitePartner(div.id)}
                        className="text-[10px] px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-500"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Open team mode */}
              {mode === 'open_team' && (
                <div className="mt-2 text-xs text-gray-400 bg-gray-900/50 p-3 rounded border border-gray-700">
                  <p className="mb-2">
                      When you complete registration, your team <strong>{userProfile.displayName}</strong> will be listed as &quot;looking for partner&quot;.
                  </p>
                  <p>
                      When your partner registers later, they can select <strong>"Join a player looking for a partner"</strong> to find you. 
                      Once they join, the team name will automatically update to include both of you (e.g. &quot;{userProfile.displayName} & Partner&quot;).
                  </p>
                </div>
              )}

              {/* Join open team */}
              {mode === 'join_open' && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-gray-400">
                    Choose a player who is already registered in this division
                    and is looking for a partner. Only teams compatible with
                    your gender / age / rating are shown.
                  </p>
                  {loadingOpenTeams ? (
                    <div className="text-xs text-gray-400">
                      Loading open teams…
                    </div>
                  ) : openTeams.length === 0 ? (
                    <div className="text-xs text-gray-500 italic">
                      No open teams available right now.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {openTeams.map(({ team, owner }) => {
                        const ownerName =
                          owner?.displayName || owner?.email || 'Unknown';
                        const g =
                          owner?.gender === 'male'
                            ? 'M'
                            : owner?.gender === 'female'
                            ? 'F'
                            : '?';
                        const selected = partnerInfo?.openTeamId === team.id;

                        return (
                          <button
                            key={team.id}
                            type="button"
                            className={`w-full text-left text-xs p-2 rounded border ${
                              selected
                                ? 'bg-gray-900 border-green-500'
                                : 'bg-gray-900 border-gray-800 hover:bg-gray-800'
                            }`}
                            onClick={() => handleSelectOpenTeam(div.id, team)}
                          >
                            {ownerName}{' '}
                            <span className="text-[10px] text-gray-400">
                              [{g}] – looking for partner
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};