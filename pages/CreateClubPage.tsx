/**
 * CreateClubPage
 * 
 * FILE LOCATION: pages/CreateClubPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateClub } from '../components/CreateClub';
import { ROUTES } from '../router/routes';

const CreateClubPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <CreateClub
      onClubCreated={() => navigate(ROUTES.CLUBS)}
      onCancel={() => navigate(ROUTES.CLUBS)}
    />
  );
};

export default CreateClubPage;