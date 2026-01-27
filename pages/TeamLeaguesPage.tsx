/**
 * TeamLeaguesPage
 *
 * Route wrapper for the team leagues feature.
 * Handles routing between list view, detail view, and create view.
 *
 * FILE LOCATION: pages/TeamLeaguesPage.tsx
 * VERSION: V07.54
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../router/routes';

// Import team league components
import { TeamLeaguesList } from '../components/teamLeague/TeamLeaguesList';
import { TeamLeagueDetail } from '../components/teamLeague/TeamLeagueDetail';
import { CreateTeamLeagueWizard } from '../components/teamLeague/wizard/CreateTeamLeagueWizard';

type ViewMode = 'list' | 'detail' | 'create';

const TeamLeaguesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOrganizer } = useAuth();

  // Determine view mode based on route
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);

  useEffect(() => {
    // Check the current path to determine view mode
    if (location.pathname.includes('/team-leagues/create')) {
      setViewMode('create');
      setSelectedLeagueId(null);
    } else if (id) {
      setViewMode('detail');
      setSelectedLeagueId(id);
    } else {
      setViewMode('list');
      setSelectedLeagueId(null);
    }
  }, [id, location.pathname]);

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================

  const handleSelectLeague = (leagueId: string) => {
    navigate(`/team-leagues/${leagueId}`);
  };

  const handleCreateLeague = () => {
    navigate('/team-leagues/create');
  };

  const handleBackToList = () => {
    navigate(ROUTES.TEAM_LEAGUES);
  };

  const handleLeagueCreated = (leagueId: string) => {
    // Navigate to the newly created league
    navigate(`/team-leagues/${leagueId}`);
  };

  // ============================================
  // RENDER
  // ============================================

  // Create League View
  if (viewMode === 'create') {
    return (
      <CreateTeamLeagueWizard
        onBack={handleBackToList}
        onCreated={handleLeagueCreated}
      />
    );
  }

  // League Detail View
  if (viewMode === 'detail' && selectedLeagueId) {
    return (
      <TeamLeagueDetail
        teamLeagueId={selectedLeagueId}
        onBack={handleBackToList}
      />
    );
  }

  // League List View (default)
  return (
    <TeamLeaguesList
      onSelectLeague={handleSelectLeague}
      onCreateLeague={isOrganizer ? handleCreateLeague : undefined}
    />
  );
};

export default TeamLeaguesPage;
