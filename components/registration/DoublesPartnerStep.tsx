
import React, { useEffect, useState } from 'react';
import type {
  Tournament,
  Division,
  Team,
  Registration,
  UserProfile,
} from '../../types';
import {
  getOpenTeamsForDivision,
  searchEligiblePartners,
  getUsersByIds,
  getTeamsForDivision,
  getPendingInvitesForDivision,
} from '../../services/firebase';

interface DoublesPartnerStepProps {
  tournament: Tournament;
  divisions: Division[];
  selectedDivisionIds: string[];
  userProfile: UserProfile;
  partnerDetails: Registration['partnerDetails'];
  setPartnerDetails: (
    updater:
      | Registration['partnerDetails']
      | ((prev: Registration['partnerDetails']) => Registration['partnerDetails'])
  ) => void;
  existingTeams: Record<string, Team>;
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
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
};

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

const checkGenderCompatibility = (
  division: Division,
  p1: UserProfile,
  p2: UserProfile
): { allowed: boolean; reason?: string } => {
  const g1 = p1.gender;
  const g2 = p2.gender;

  switch (division.gender) {
    case 'men':
      if (g1 === 'male' && g2 === 'male') return { allowed: true };
      return { allowed: false, reason: 'Must be Male' };
    case 'women':
      if (g1 === 'female' && g2 === 'female') return { allowed: true };
      return { allowed: false, reason: 'Must be Female' };
    case 'mixed':
      if (!g1 || !g2) return { allowed: false, reason: 'Unknown Gender' };
      if (g1 !== g2) return { allowed: true };
      return { allowed: false, reason: 'Must be Mixed Gender' };
    case 'open':
    default:
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
  existingTeams
}) => {
  const [openTeamsByDivision, setOpenTeamsByDivision] = useState<Record<string, OpenTeamWithOwner[]>>({});
  const [searchResults, setSearchResults] = useState<Record<string, UserProfile[]>>({});
  const [searchTerm, setSearchTerm] = useState<Record<string, string>>({});
  const [loadingOpenTeams, setLoadingOpenTeams] = useState(false);
  const [unavailableUsers, setUnavailableUsers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadUnavailable = async () => {
      const statusMap = new Map<string, string>();

      for (const divId of selectedDivisionIds) {
        const teams = await getTeamsForDivision(tournament.id, divId);
        teams.forEach(t => {
          const isWithdrawn = t.status === 'withdrawn' || t.status === 'cancelled';
          const isSoloPending = t.status === 'pending_partner' && Array.isArray(t.players) && t.players.length === 1;

          if (!isWithdrawn && !isSoloPending) {
            (t.players || []).forEach(p => statusMap.set(p, 'Already Registered'));
          }
        });

        const invites = await getPendingInvitesForDivision(tournament.id, divId);
        invites.forEach(inv => {
          if (!statusMap.has(inv.invitedUserId)) statusMap.set(inv.invitedUserId, 'Has Pending Invite');
        });
      }

      setUnavailableUsers(statusMap);
    };
    if (selectedDivisionIds.length > 0) loadUnavailable();
  }, [selectedDivisionIds, tournament.id]);

  useEffect(() => {
    const load = async () => {
      setLoadingOpenTeams(true);
      try {
        const result: Record<string, OpenTeamWithOwner[]> = {};

        for (const divId of selectedDivisionIds) {
          const div = divisions.find(d => d.id === divId);
          if (!div || div.type !== 'doubles') continue;

          // If user is already in a full team, we don't need to load open teams for them
          const existingTeam = existingTeams[div.id];
          if (existingTeam && existingTeam.players.length >= 2) continue;

          const teams = await getOpenTeamsForDivision(tournament.id, divId);

          const ownerIds = Array.from(new Set(teams.map(t => t.players?.[0]).filter(id => !!id)));
          let ownersById: Record<string, UserProfile> = {};
          if (ownerIds.length > 0) {
            const owners = await getUsersByIds(ownerIds);
            ownersById = owners.reduce<Record<string, UserProfile>>((acc, u) => { acc[u.id] = u; return acc; }, {});
          }

          const enriched: OpenTeamWithOwner[] = [];
          for (const t of teams) {
            const ownerId = t.players?.[0];
            const owner = ownerId ? ownersById[ownerId] ?? null : null;
            if (!owner) continue;
            const ownerCheck = checkPartnerEligibility(div, owner);
            if (!ownerCheck.eligible) continue;
            const userCheck = checkPartnerEligibility(div, userProfile);
            if (!userCheck.eligible) continue;
            const genderCheck = checkGenderCompatibility(div, owner, userProfile);
            if (!genderCheck.allowed) continue;
            enriched.push({ team: t, owner });
          }

          enriched.sort((a, b) => {
            const nameA = (a.owner.displayName || a.owner.email || '').toLowerCase();
            const nameB = (b.owner.displayName || b.owner.email || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
          });

          result[divId] = enriched;
        }

        setOpenTeamsByDivision(result);
      } finally {
        setLoadingOpenTeams(false);
      }
    };

    if (selectedDivisionIds.length > 0) load();
  }, [selectedDivisionIds.join(','), divisions.length, tournament.id, userProfile.id, existingTeams]);

  const handleModeChange = (divId: string, mode: 'invite' | 'open_team' | 'join_open') => {
    setPartnerDetails(prev => {
      const next = { ...(prev || {}) };
      // For invite mode, ensure we have a clean "invite" entry so UI shows search immediately
      if (mode === 'invite') {
        next[divId] = { mode: 'invite' };
      } else {
        next[divId] = { mode };
      }
      return next;
    });
  };

  const handleInviteSearch = async (divId: string, term: string) => {
    setSearchTerm(prev => ({ ...prev, [divId]: term }));
    if (!term || term.length < 2) {
      setSearchResults(prev => ({ ...prev, [divId]: [] }));
      return;
    }
    const division = divisions.find(d => d.id === divId);
    if (!division) {
      setSearchResults(prev => ({ ...prev, [divId]: [] }));
      return;
    }

    const results = await searchEligiblePartners(term, division.gender, userProfile);
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
      next[divId] = { mode: 'invite' };
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
          const existingTeam = existingTeams[div.id];
          const isFullTeam = existingTeam && existingTeam.players.length >= 2;

          if (isFullTeam) {
            return (
                <div key={div.id} className="bg-gray-800 p-4 rounded border border-gray-700 space-y-3">
                     <h3 className="text-white font-bold text-sm">{div.name} – Doubles Partner</h3>
                     <div className="text-sm text-green-400 p-3 bg-green-900/20 border border-green-800 rounded">
                         You are currently registered with a partner.
                         <br/>
                         <span className="text-xs text-gray-400">To change partners, please go back and withdraw from this division.</span>
                     </div>
                </div>
            );
          }

          const partnerInfo = partnerDetails?.[div.id];
          const mode = partnerInfo?.mode || 'invite';
          const openTeams = openTeamsByDivision[div.id] || [];

          return (
            <div key={div.id} className="bg-gray-800 p-4 rounded border border-gray-700 space-y-3">
              <h3 className="text-white font-bold text-sm">{div.name} – Doubles Partner</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                {/* Invite Option */}
                <label 
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'invite' 
                      ? 'bg-green-600/20 border-green-500 text-white' 
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${mode === 'invite' ? 'border-green-400' : 'border-gray-500'}`}>
                      {mode === 'invite' && <div className="w-2 h-2 rounded-full bg-green-400" />}
                  </div>
                  <input type="radio" className="hidden" checked={mode === 'invite'} onChange={() => handleModeChange(div.id, 'invite')} />
                  <span className="font-semibold text-sm">Invite a specific partner</span>
                </label>

                {/* Open Team Option */}
                <label 
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'open_team' 
                      ? 'bg-green-600/20 border-green-500 text-white' 
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${mode === 'open_team' ? 'border-green-400' : 'border-gray-500'}`}>
                      {mode === 'open_team' && <div className="w-2 h-2 rounded-full bg-green-400" />}
                  </div>
                  <input type="radio" className="hidden" checked={mode === 'open_team'} onChange={() => handleModeChange(div.id, 'open_team')} />
                  <span className="font-semibold text-sm">I don&apos;t have a partner yet</span>
                </label>

                {/* Join Open Option */}
                <label 
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'join_open' 
                      ? 'bg-green-600/20 border-green-500 text-white' 
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${mode === 'join_open' ? 'border-green-400' : 'border-gray-500'}`}>
                      {mode === 'join_open' && <div className="w-2 h-2 rounded-full bg-green-400" />}
                  </div>
                  <input type="radio" className="hidden" checked={mode === 'join_open'} onChange={() => handleModeChange(div.id, 'join_open')} />
                  <span className="font-semibold text-sm">Join a player looking</span>
                </label>
              </div>

              {/* Invite mode */}
              {mode === 'invite' && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-gray-400">
                    Search for your partner by name or email. <br />
                    <span className="italic">Note: Players who do not meet division criteria or are already registered will be shown but disabled.</span>
                  </p>

                  {/* Show search box if invite mode AND partner not already chosen (or if we allow changing) */}
                  {( !partnerInfo?.partnerUserId && !partnerInfo?.teamId ) ? (
                    <>
                      <input
                        value={searchTerm[div.id] || ''}
                        onChange={(e) => handleInviteSearch(div.id, e.target.value)}
                        placeholder="Search for partner..."
                        className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                      />

                      <div className="max-h-44 overflow-auto border border-gray-700 rounded bg-gray-900 p-2">
                        {(searchResults[div.id] || []).map(u => {
                          const unavailableReason = unavailableUsers.get(u.id);
                          const disabled = !!unavailableReason;
                          return (
                            <div key={u.id} className={`p-2 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-gray-800'}`} onClick={() => !disabled && handleSelectInvitePartner(div.id, u)}>
                              <div className="font-semibold text-white">{u.displayName || u.email}</div>
                              <div className="text-xs text-gray-400">{u.email} {disabled && <span className="text-red-400">· {unavailableReason}</span>}</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-green-400">
                      {partnerInfo?.partnerUserId ? (
                        <>
                          Selected: {partnerInfo.partnerName} <button onClick={() => handleClearInvitePartner(div.id)} className="ml-3 text-sm text-gray-300">Change</button>
                        </>
                      ) : partnerInfo?.teamId ? (
                        <div className="text-gray-200">Selected team: {partnerInfo.teamId}</div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {/* Open team (looking for partner) text */}
              {mode === 'open_team' && (
                <div className="text-xs text-gray-400">
                  When you complete registration, your team will be listed as "looking for partner".
                </div>
              )}

              {/* Join open teams */}
              {mode === 'join_open' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Available open teams:</p>
                  {openTeams.length === 0 ? <div className="text-gray-500">No open teams</div> : openTeams.map(ot => {
                    const isSelected = partnerInfo?.openTeamId === ot.team.id;
                    return (
                      <div 
                        key={ot.team.id} 
                        className={`p-3 border rounded-lg cursor-pointer transition-all flex justify-between items-center ${
                          isSelected 
                            ? 'bg-green-900/30 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.1)]' 
                            : 'bg-gray-900 border-gray-700 hover:bg-gray-800'
                        }`}
                        onClick={() => handleSelectOpenTeam(div.id, ot.team)}
                      >
                        <div>
                          <div className={`font-semibold ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                            {ot.owner.displayName || ot.owner.email}
                          </div>
                          <div className="text-xs text-gray-400">{ot.team.teamName}</div>
                        </div>
                        {isSelected && (
                          <div className="text-green-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};
