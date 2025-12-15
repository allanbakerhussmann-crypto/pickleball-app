/**
 * AdminUsersPage (Route wrapper)
 * 
 * FILE LOCATION: pages/AdminUsersPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminUsersPage as AdminUsers } from '../components/AdminUsersPage';
import { ROUTES } from '../router/routes';

const AdminUsersPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AdminUsers onBack={() => navigate(ROUTES.DASHBOARD)} />
  );
};

export default AdminUsersPage;