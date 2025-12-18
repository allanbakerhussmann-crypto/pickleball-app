/**
 * AdminOrganizerRequestsPage
 * 
 * Route wrapper for the organizer requests admin page.
 * 
 * FILE LOCATION: pages/AdminOrganizerRequestsPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminOrganizerRequests } from '../components/admin/AdminOrganizerRequests';
import { ROUTES } from '../router/routes';

const AdminOrganizerRequestsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AdminOrganizerRequests
      onBack={() => navigate(ROUTES.DASHBOARD)}
    />
  );
};

export default AdminOrganizerRequestsPage;