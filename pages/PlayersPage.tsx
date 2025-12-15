/**
 * PlayersPage
 * 
 * FILE LOCATION: pages/PlayersPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayerDirectory } from '../components/PlayerDirectory';
import { ROUTES } from '../router/routes';

const PlayersPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PlayerDirectory onBack={() => navigate(ROUTES.DASHBOARD)} />
  );
};

export default PlayersPage;