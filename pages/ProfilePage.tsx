/**
 * ProfilePage
 * 
 * FILE LOCATION: pages/ProfilePage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Profile } from '../components/Profile';
import { ROUTES } from '../router/routes';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Profile onBack={() => navigate(ROUTES.DASHBOARD)} />
  );
};

export default ProfilePage;