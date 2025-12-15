/**
 * ClubsPage
 * 
 * FILE LOCATION: pages/ClubsPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClubsList } from '../components/ClubsList';
import { ROUTES, getRoute } from '../router/routes';

const ClubsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ClubsList
      onCreateClub={() => navigate(ROUTES.CLUB_CREATE)}
      onViewClub={(id) => navigate(getRoute.clubDetail(id))}
      onBack={() => navigate(ROUTES.DASHBOARD)}
    />
  );
};

export default ClubsPage;