/**
 * InvitesPage
 * 
 * FILE LOCATION: pages/InvitesPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PartnerInvites } from '../components/PartnerInvites';
import { ROUTES, getRoute } from '../router/routes';

const InvitesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PartnerInvites
      onAcceptInvites={(tournamentId, divisionIds) => {
        // Navigate to tournament with wizard state
        navigate(getRoute.tournamentDetail(tournamentId), {
          state: {
            wizardState: {
              isOpen: true,
              mode: 'full',
              divisionId: divisionIds[0],
            },
          },
        });
      }}
      onCompleteWithoutSelection={() => navigate(ROUTES.DASHBOARD)}
    />
  );
};

export default InvitesPage;