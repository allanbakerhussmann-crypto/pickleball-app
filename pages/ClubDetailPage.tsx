/**
 * ClubDetailPage
 * 
 * FILE LOCATION: pages/ClubDetailPage.tsx
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClubDetailPage as ClubDetail } from '../components/ClubDetailPage';
import { ROUTES } from '../router/routes';

const ClubDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Club ID required</h2>
        <button
          onClick={() => navigate(ROUTES.CLUBS)}
          className="text-green-400 hover:underline"
        >
          Back to Clubs
        </button>
      </div>
    );
  }

  return (
    <ClubDetail
      clubId={id}
      onBack={() => navigate(ROUTES.CLUBS)}
    />
  );
};

export default ClubDetailPage;