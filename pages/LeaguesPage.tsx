/**
 * LeaguesPage
 * 
 * FILE LOCATION: pages/LeaguesPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LeaguesList } from '../components/leagues/LeaguesList';
import { CreateLeague } from '../components/leagues/CreateLeague';
import { LeagueDetail } from '../components/leagues/LeagueDetail';
import { ROUTES } from '../router/routes';

type LeagueView = 'list' | 'create' | 'detail';

const LeaguesPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [view, setView] = useState<LeagueView>(id ? 'detail' : 'list');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(id || null);

  // Sync with URL params
  useEffect(() => {
    if (id) {
      setSelectedLeagueId(id);
      setView('detail');
    }
  }, [id]);

  const handleSelectLeague = (leagueId: string) => {
    setSelectedLeagueId(leagueId);
    setView('detail');
    navigate(`/leagues/${leagueId}`);
  };

  const handleCreateLeague = () => {
    setView('create');
  };

  const handleLeagueCreated = (leagueId: string) => {
    setSelectedLeagueId(leagueId);
    setView('detail');
    navigate(`/leagues/${leagueId}`);
  };

  const handleBack = () => {
    setView('list');
    setSelectedLeagueId(null);
    navigate(ROUTES.LEAGUES);
  };

  if (view === 'create') {
    return <CreateLeague onBack={handleBack} onCreated={handleLeagueCreated} />;
  }

  if (view === 'detail' && selectedLeagueId) {
    return <LeagueDetail leagueId={selectedLeagueId} onBack={handleBack} />;
  }

  return (
    <LeaguesList
      onSelectLeague={handleSelectLeague}
      onCreateLeague={handleCreateLeague}
    />
  );
};

export default LeaguesPage;