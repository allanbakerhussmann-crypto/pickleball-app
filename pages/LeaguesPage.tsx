/**
 * LeaguesPage
 * 
 * Route wrapper for the leagues feature.
 * Handles routing between list view, detail view, and create view.
 * 
 * FILE LOCATION: pages/LeaguesPage.tsx
 * VERSION: V05.17
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES, getRoute } from '../router/routes';

// Import league components
import { LeaguesList } from '../components/leagues/LeaguesList';
import { LeagueDetail } from '../components/leagues/LeagueDetail';
import { CreateLeague } from '../components/leagues/CreateLeague';

type ViewMode = 'list' | 'detail' | 'create';

const LeaguesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOrganizer } = useAuth();
  
  // Determine view mode based on route
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);

  useEffect(() => {
    // Check the current path to determine view mode
    if (location.pathname.includes('/leagues/create')) {
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
    navigate(getRoute.leagueDetail(leagueId));
  };

  const handleCreateLeague = () => {
    navigate('/leagues/create');
  };

  const handleBackToList = () => {
    navigate(ROUTES.LEAGUES);
  };

  const handleLeagueCreated = (leagueId: string) => {
    // Navigate to the newly created league
    navigate(getRoute.leagueDetail(leagueId));
  };

  // ============================================
  // RENDER
  // ============================================

  // Create League View
  if (viewMode === 'create') {
    return (
      <CreateLeague
        onBack={handleBackToList}
        onCreated={handleLeagueCreated}
      />
    );
  }

  // League Detail View
  if (viewMode === 'detail' && selectedLeagueId) {
    return (
      <LeagueDetail
        leagueId={selectedLeagueId}
        onBack={handleBackToList}
      />
    );
  }

  // League List View (default)
  return (
    <LeaguesList
      onSelectLeague={handleSelectLeague}
      onCreateLeague={isOrganizer ? handleCreateLeague : undefined}
    />
  );
};

export default LeaguesPage;