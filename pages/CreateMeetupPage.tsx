/**
 * CreateMeetupPage
 * 
 * FILE LOCATION: pages/CreateMeetupPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateMeetup } from '../components/meetups/CreateMeetup';
import { ROUTES } from '../router/routes';

const CreateMeetupPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <CreateMeetup
      onBack={() => navigate(ROUTES.MEETUPS)}
      onCreated={() => navigate(ROUTES.MEETUPS)}
    />
  );
};

export default CreateMeetupPage;