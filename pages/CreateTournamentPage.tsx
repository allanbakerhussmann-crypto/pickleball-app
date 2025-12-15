/**
 * CreateTournamentPage
 * 
 * FILE LOCATION: pages/CreateTournamentPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateTournament } from '../components/CreateTournament';
import { saveTournament } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES, getRoute } from '../router/routes';
import type { Tournament, Division } from '../types';

const CreateTournamentPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const handleCreateTournament = async (tournament: Tournament, divisions?: Division[]) => {
    const saved = await saveTournament(tournament, divisions);
    if (saved?.id) {
      navigate(getRoute.tournamentDetail(saved.id));
    } else {
      navigate(ROUTES.TOURNAMENTS);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <CreateTournament
      onCreateTournament={handleCreateTournament}
      onCancel={() => navigate(ROUTES.TOURNAMENTS)}
      onCreateClub={() => navigate(ROUTES.CLUB_CREATE)}
      userId={currentUser.uid}
    />
  );
};

export default CreateTournamentPage;