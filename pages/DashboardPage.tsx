/**
 * DashboardPage
 * 
 * FILE LOCATION: pages/DashboardPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserDashboard } from '../components/UserDashboard';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES, getRoute } from '../router/routes';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  if (!currentUser || !userProfile) {
    return null;
  }

  const handleNavigate = (view: string, id?: string) => {
    switch (view) {
      case 'tournament':
        if (id) navigate(getRoute.tournamentDetail(id));
        break;
      case 'club':
        if (id) navigate(getRoute.clubDetail(id));
        break;
      case 'meetup':
        if (id) navigate(getRoute.meetupDetail(id));
        break;
      case 'profile':
        navigate(ROUTES.PROFILE);
        break;
      case 'tournaments':
        navigate(ROUTES.TOURNAMENTS);
        break;
      case 'myTournaments':
        navigate(ROUTES.MY_EVENTS);
        break;
      case 'clubs':
        navigate(ROUTES.CLUBS);
        break;
      case 'meetups':
        navigate(ROUTES.MEETUPS);
        break;
      default:
        navigate(ROUTES.DASHBOARD);
    }
  };

  return (
    <UserDashboard
      userProfile={userProfile}
      onEditProfile={() => navigate(ROUTES.PROFILE)}
      onNavigate={handleNavigate}
    />
  );
};

export default DashboardPage;