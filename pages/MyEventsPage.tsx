/**
 * MyEventsPage
 * 
 * FILE LOCATION: pages/MyEventsPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TournamentDashboard } from '../components/TournamentDashboard';
import { subscribeToTournaments } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES, getRoute } from '../router/routes';
import type { Tournament } from '../types';

const MyEventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, isOrganizer } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    // subscribeToTournaments requires userId as first param
    const userId = currentUser?.uid || '';
    const unsubscribe = subscribeToTournaments(userId, (data) => {
      setTournaments(data);
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  return (
    <TournamentDashboard
      tournaments={tournaments}
      onSelectTournament={(id) => navigate(getRoute.tournamentDetail(id))}
      onCreateTournamentClick={() => {
        if (isOrganizer) {
          navigate(ROUTES.TOURNAMENT_CREATE);
        }
      }}
      onlyMyEvents={true}
      onBack={() => navigate(ROUTES.DASHBOARD)}
    />
  );
};

export default MyEventsPage;