/**
 * TeamLeagueDetail Component
 *
 * Main detail view for Team League (Interclub) format.
 * Shows standings, fixtures, teams, and management tools.
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueDetail.tsx
 * VERSION: V07.57
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  getTeamLeague,
  getUserProfile,
  subscribeToInterclubTeams,
  subscribeToFixtures,
  calculateTeamLeagueStandings,
  deleteTeamLeague,
  createInterclubTeam,
} from '../../services/firebase';
import type {
  TeamLeague,
  InterclubTeam,
  TeamLeagueFixture,
  TeamLeagueStanding,
  TeamLeagueSettings,
} from '../../types/teamLeague';
import { TeamLeagueStandings } from './TeamLeagueStandings';
import { TeamLeagueFixtureList } from './TeamLeagueFixtureList';
import { TeamLeagueTeamsList } from './TeamLeagueTeamsList';
import { TeamLeagueCaptainPanel } from './TeamLeagueCaptainPanel';
import { TeamLeagueOrganizerPanel } from './TeamLeagueOrganizerPanel';
import { TeamLeagueDuprPanel } from './TeamLeagueDuprPanel';
import { TeamLeagueInfoTab } from './TeamLeagueInfoTab';
import { TeamRegistrationModal, type TeamRegistrationData } from './TeamRegistrationModal';

// ============================================
// TYPES
// ============================================

interface TeamLeagueDetailProps {
  teamLeagueId: string;
  onBack: () => void;
}

type TabType = 'standings' | 'fixtures' | 'teams' | 'captain' | 'organizer' | 'dupr' | 'info';

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueDetail: React.FC<TeamLeagueDetailProps> = ({
  teamLeagueId,
  onBack,
}) => {
  const { currentUser, isAppAdmin, userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data state
  const [teamLeague, setTeamLeague] = useState<TeamLeague | null>(null);
  const [teams, setTeams] = useState<InterclubTeam[]>([]);
  const [fixtures, setFixtures] = useState<TeamLeagueFixture[]>([]);
  const [standings, setStandings] = useState<TeamLeagueStanding[]>([]);
  const [organizerProfile, setOrganizerProfile] = useState<any>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [error, setError] = useState<string | null>(null);
  const [recalculatingStandings, setRecalculatingStandings] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Derived state
  const isOrganizer = useMemo(() => {
    if (!teamLeague || !currentUser) return false;
    return teamLeague.createdByUserId === currentUser.uid || isAppAdmin;
  }, [teamLeague, currentUser, isAppAdmin]);

  // Find user's team (any team where they're captain or on roster)
  const myTeam = useMemo(() => {
    if (!currentUser) return null;
    return teams.find(team =>
      team.captainId === currentUser.uid ||
      team.roster.some(p => p.playerId === currentUser.uid)
    );
  }, [teams, currentUser]);

  // Check if user is captain of an approved team (for Captain tab visibility)
  const isCaptainOfApprovedTeam = useMemo(() => {
    if (!myTeam || !currentUser) return false;
    const isApproved = myTeam.status === 'approved' || myTeam.status === 'approved_paid';
    return myTeam.captainId === currentUser.uid && isApproved;
  }, [myTeam, currentUser]);

  // Can user register a team? (logged in, no team, registration open)
  const canRegisterTeam = useMemo(() => {
    if (!currentUser || !teamLeague) return false;
    if (myTeam) return false; // Already has a team
    return teamLeague.status === 'registration';
  }, [currentUser, teamLeague, myTeam]);

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    const loadTeamLeague = async () => {
      try {
        const data = await getTeamLeague(teamLeagueId);
        if (data) {
          setTeamLeague(data);
          // Fetch organizer profile
          if (data.createdByUserId) {
            const profile = await getUserProfile(data.createdByUserId);
            setOrganizerProfile(profile);
          }
        } else {
          setError('Team League not found');
        }
      } catch (err) {
        console.error('Error loading team league:', err);
        setError('Failed to load team league');
      }
    };
    loadTeamLeague();
  }, [teamLeagueId]);

  // Subscribe to teams
  useEffect(() => {
    const unsubscribe = subscribeToInterclubTeams(teamLeagueId, (teamData: InterclubTeam[]) => {
      setTeams(teamData);
    });
    return () => unsubscribe();
  }, [teamLeagueId]);

  // Subscribe to fixtures
  useEffect(() => {
    const unsubscribe = subscribeToFixtures(teamLeagueId, (fixtureData) => {
      setFixtures(fixtureData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [teamLeagueId]);

  // Calculate standings when teams or fixtures change
  useEffect(() => {
    const updateStandings = async () => {
      if (!teamLeague) return;
      try {
        const standingsData = await calculateTeamLeagueStandings(teamLeagueId);
        setStandings(standingsData);
      } catch (err) {
        console.error('Error calculating standings:', err);
      }
    };
    updateStandings();
  }, [teamLeagueId, fixtures, teamLeague]);

  // Handle tab from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['standings', 'fixtures', 'teams', 'captain', 'organizer', 'dupr', 'info'].includes(tabParam)) {
      setActiveTab(tabParam as TabType);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // ============================================
  // RENDER HELPERS
  // ============================================

  const renderTabs = () => {
    const tabs: { id: TabType; label: string; icon: string; visible: boolean }[] = [
      { id: 'standings', label: 'Standings', icon: '🏆', visible: true },
      { id: 'fixtures', label: 'Fixtures', icon: '📅', visible: true },
      { id: 'teams', label: 'Teams', icon: '👥', visible: true },
      { id: 'captain', label: 'Captain', icon: '👑', visible: isCaptainOfApprovedTeam },
      { id: 'organizer', label: 'Organizer', icon: '⚙️', visible: isOrganizer },
      { id: 'dupr', label: 'DUPR', icon: '📊', visible: isOrganizer && teamLeague?.duprMode !== 'none' },
      { id: 'info', label: 'Info', icon: 'ℹ️', visible: true },
    ];

    return (
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-gray-700/50 mb-4">
        {tabs.filter(t => t.visible).map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap
              transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-lime-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }
            `}
          >
            <span>{tab.icon}</span>
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    );
  };

  // Create a legacy settings object for child components that still expect it
  const legacySettings: TeamLeagueSettings | null = teamLeague ? {
    boards: teamLeague.boards,
    maxTeams: teamLeague.maxTeams,
    numberOfWeeks: teamLeague.numberOfWeeks,
    scheduleType: teamLeague.scheduleType,
    defaultMatchDay: teamLeague.defaultMatchDay,
    defaultMatchTime: teamLeague.defaultMatchTime,
    minPlayersPerTeam: teamLeague.minPlayersPerTeam,
    maxPlayersPerTeam: teamLeague.maxPlayersPerTeam,
    lineupLockMinutesBeforeMatch: teamLeague.lineupLockMinutesBeforeMatch,
    pointsPerBoardWin: teamLeague.pointsPerBoardWin,
    pointsPerMatchWin: teamLeague.pointsPerMatchWin,
    tieBreakerOrder: teamLeague.tieBreakerOrder,
    duprMode: teamLeague.duprMode,
    allowMultiTeamPlayers: teamLeague.allowMultiTeamPlayers,
    // Additional required properties
    playerSeeding: teamLeague.playerSeeding,
    substituteRules: teamLeague.substituteRules,
    venues: teamLeague.venues,
    byeBoardWins: teamLeague.byeBoardWins,
    defaultWithdrawalHandling: teamLeague.defaultWithdrawalHandling,
    standingsUpdateMode: teamLeague.standingsUpdateMode,
    // Optional properties
    rosterGenderRequirements: teamLeague.rosterGenderRequirements,
    duprRestrictions: teamLeague.duprRestrictions,
    ageRestrictions: teamLeague.ageRestrictions,
    grandfatheredPlayerIds: teamLeague.grandfatheredPlayerIds,
    boardAssignmentRules: teamLeague.boardAssignmentRules,
    playoffs: teamLeague.playoffs,
    // Construct fees from flattened TeamLeague properties
    fees: teamLeague.entryFeeType !== 'none' || teamLeague.venueFeeEnabled
      ? {
          entryFeeType: teamLeague.entryFeeType,
          entryFeeAmount: teamLeague.entryFeeAmount,
          venueFeeEnabled: teamLeague.venueFeeEnabled,
          venueFeeAmount: teamLeague.venueFeeAmount,
          requirePaymentBeforeApproval: teamLeague.requirePaymentBeforeApproval,
          currency: teamLeague.feeCurrency,
        }
      : undefined,
  } : null;

  // Create a legacy league object for child components that still expect it
  const legacyLeague = teamLeague ? {
    id: teamLeague.id,
    name: teamLeague.name,
    status: teamLeague.status,
    createdByUserId: teamLeague.createdByUserId,
    seasonStart: teamLeague.seasonStart,
    seasonEnd: teamLeague.seasonEnd,
    settings: { teamLeague: legacySettings },
  } : null;

  const renderTabContent = () => {
    if (!teamLeague || !legacySettings) return null;

    switch (activeTab) {
      case 'standings':
        return (
          <TeamLeagueStandings
            standings={standings}
            teams={teams}
            settings={legacySettings}
            isOrganizer={isOrganizer}
            onRecalculate={async () => {
              setRecalculatingStandings(true);
              try {
                const newStandings = await calculateTeamLeagueStandings(teamLeagueId);
                setStandings(newStandings);
              } finally {
                setRecalculatingStandings(false);
              }
            }}
            recalculating={recalculatingStandings}
          />
        );

      case 'fixtures':
        return (
          <TeamLeagueFixtureList
            fixtures={fixtures}
            teams={teams}
            settings={legacySettings}
            leagueId={teamLeagueId}
            isOrganizer={isOrganizer}
            myTeam={myTeam}
          />
        );

      case 'teams':
        return (
          <TeamLeagueTeamsList
            teams={teams}
            settings={legacySettings}
            leagueId={teamLeagueId}
            isOrganizer={isOrganizer}
          />
        );

      case 'captain':
        return isCaptainOfApprovedTeam && myTeam ? (
          <TeamLeagueCaptainPanel
            team={myTeam}
            fixtures={fixtures.filter(f =>
              f.homeTeamId === myTeam.id || f.awayTeamId === myTeam.id
            )}
            settings={legacySettings}
            leagueId={teamLeagueId}
            league={legacyLeague as any}
          />
        ) : null;

      case 'organizer':
        return isOrganizer ? (
          <TeamLeagueOrganizerPanel
            league={legacyLeague as any}
            teams={teams}
            fixtures={fixtures}
            settings={legacySettings}
            onRefresh={async () => {
              // Re-fetch team league data to get updated status
              try {
                const data = await getTeamLeague(teamLeagueId);
                if (data) {
                  setTeamLeague(data);
                }
              } catch (err) {
                console.error('Error refreshing team league:', err);
              }
              // Also recalculate standings
              calculateTeamLeagueStandings(teamLeagueId).then(setStandings);
            }}
            onDelete={async () => {
              await deleteTeamLeague(teamLeagueId);
              onBack();
            }}
          />
        ) : null;

      case 'dupr':
        return isOrganizer && teamLeague.duprMode !== 'none' ? (
          <TeamLeagueDuprPanel
            fixtures={fixtures}
            settings={legacySettings}
          />
        ) : null;

      case 'info':
        return (
          <TeamLeagueInfoTab
            league={legacyLeague as any}
            settings={legacySettings}
            organizerProfile={organizerProfile}
            teams={teams}
          />
        );

      default:
        return null;
    }
  };

  // ============================================
  // LOADING AND ERROR STATES
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-lime-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-400 text-lg">{error}</div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!teamLeague) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-gray-400 text-lg">Team League not found</div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
        >
          Go Back
        </button>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-950 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Back button and title */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏢</span>
                <h1 className="text-2xl font-bold text-white">{teamLeague.name}</h1>
                <span className="px-2 py-1 bg-cyan-600/20 text-cyan-400 text-xs rounded-full">
                  Team League
                </span>
              </div>
              {teamLeague.venue && (
                <p className="text-gray-400 text-sm mt-1">{teamLeague.venue}</p>
              )}
            </div>
          </div>

          {/* Season dates */}
          {(teamLeague.seasonStart || teamLeague.seasonEnd) && (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>
                {teamLeague.seasonStart && new Date(teamLeague.seasonStart).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric', year: 'numeric' })}
                {teamLeague.seasonStart && teamLeague.seasonEnd && ' - '}
                {teamLeague.seasonEnd && new Date(teamLeague.seasonEnd).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric', year: 'numeric' })}
                {teamLeague?.numberOfWeeks && ` (${teamLeague.numberOfWeeks} weeks)`}
              </span>
            </div>
          )}

          {/* Organizer contact */}
          {organizerProfile && (
            <div className="flex items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <svg className="w-4 h-4 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Organizer: <span className="text-white font-medium">{organizerProfile.displayName || organizerProfile.name || 'Unknown'}</span></span>
              </div>
              {organizerProfile.email && (
                <a
                  href={`mailto:${organizerProfile.email}`}
                  className="flex items-center gap-2 text-gray-400 hover:text-lime-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{organizerProfile.email}</span>
                </a>
              )}
              {organizerProfile.phone && (
                <a
                  href={`tel:${organizerProfile.phone}`}
                  className="flex items-center gap-2 text-gray-400 hover:text-lime-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{organizerProfile.phone}</span>
                </a>
              )}
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Teams</div>
              <div className="text-xl font-bold text-white">{teams.filter(t => t.status === 'approved_paid' || t.status === 'approved').length}{teamLeague?.maxTeams ? `/${teamLeague.maxTeams}` : ''}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Fixtures</div>
              <div className="text-xl font-bold text-white">{fixtures.length}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Completed</div>
              <div className="text-xl font-bold text-lime-400">
                {fixtures.filter(f => f.status === 'completed').length}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Boards</div>
              <div className="text-xl font-bold text-white">{teamLeague?.boards?.length || 0}</div>
            </div>
          </div>

          {/* Register Team Button */}
          {canRegisterTeam && (
            <div className="mt-4">
              <button
                onClick={() => setShowRegistrationModal(true)}
                disabled={registering}
                className="w-full sm:w-auto px-6 py-3 bg-lime-600 hover:bg-lime-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Register Your Team
              </button>
            </div>
          )}

          {/* Registration pending message */}
          {myTeam && myTeam.status === 'pending_approval' && (
            <div className="mt-4 p-4 bg-amber-900/30 border border-amber-700 rounded-lg">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-amber-200 font-medium">Team Registration Pending</p>
                  <p className="text-amber-300/70 text-sm">
                    Your team "{myTeam.name}" is awaiting approval from the league organizer.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs and Content */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        {renderTabs()}
        <div className="mt-4">
          {renderTabContent()}
        </div>
      </div>

      {/* Registration Modal */}
      {teamLeague && (
        <TeamRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onRegister={async (data: TeamRegistrationData) => {
            if (!currentUser || !userProfile) return;
            setRegistering(true);
            try {
              await createInterclubTeam(teamLeagueId, {
                name: data.name,
                captainId: currentUser.uid,
                captainName: userProfile.displayName || currentUser.displayName || 'Unknown',
                captainEmail: currentUser.email || undefined,
                captainPhone: data.contactPhone,
                clubId: data.clubId,
                clubName: data.clubName,
                captainIsPlaying: data.captainIsPlaying,
                captainAgreementAccepted: true,
              });
              setShowRegistrationModal(false);
            } finally {
              setRegistering(false);
            }
          }}
          teamLeagueId={teamLeagueId}
          teamLeagueName={teamLeague.name}
          teamLeague={teamLeague}
        />
      )}
    </div>
  );
};

export default TeamLeagueDetail;
