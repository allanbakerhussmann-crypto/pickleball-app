/**
 * TournamentsPage
 * 
 * Route wrapper for the tournaments list view.
 * 
 * FILE LOCATION: pages/TournamentsPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TournamentDashboard } from '../components/TournamentDashboard';
import { subscribeToTournaments } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getRoute } from '../router/routes';
import type { Tournament } from '../types';

const TournamentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isOrganizer } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToTournaments((data) => {
      setTournaments(data);
    });
    return () => unsubscribe();
  }, []);

  return (
    <TournamentDashboard
      tournaments={tournaments}
      onSelectTournament={(id) => navigate(getRoute.tournamentDetail(id))}
      onCreateTournamentClick={() => {
        if (isOrganizer) {
          navigate('/tournaments/create');
        }
      }}
      onlyMyEvents={false}
      onBack={() => navigate('/dashboard')}
    />
  );
};

export default TournamentsPage;