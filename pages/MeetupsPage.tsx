/**
 * MeetupsPage
 * 
 * FILE LOCATION: pages/MeetupsPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MeetupsList } from '../components/meetups/MeetupsList';
import { ROUTES, getRoute } from '../router/routes';

const MeetupsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <MeetupsList
      onCreateClick={() => navigate(ROUTES.MEETUP_CREATE)}
      onSelectMeetup={(id) => navigate(getRoute.meetupDetail(id))}
    />
  );
};

export default MeetupsPage;