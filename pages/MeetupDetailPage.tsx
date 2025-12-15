/**
 * MeetupDetailPage
 * 
 * FILE LOCATION: pages/MeetupDetailPage.tsx
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MeetupDetail } from '../components/meetups/MeetupDetail';
import { ROUTES } from '../router/routes';

const MeetupDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Meetup ID required</h2>
        <button
          onClick={() => navigate(ROUTES.MEETUPS)}
          className="text-green-400 hover:underline"
        >
          Back to Meetups
        </button>
      </div>
    );
  }

  return (
    <MeetupDetail
      meetupId={id}
      onBack={() => navigate(ROUTES.MEETUPS)}
    />
  );
};

export default MeetupDetailPage;