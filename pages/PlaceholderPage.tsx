/**
 * PlaceholderPage
 * 
 * Generic placeholder for routes that aren't implemented yet.
 * 
 * FILE LOCATION: pages/PlaceholderPage.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';

interface PlaceholderPageProps {
  title: string;
  message: string;
  icon?: React.ReactNode;
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ 
  title, 
  message,
  icon 
}) => {
  const navigate = useNavigate();

  const defaultIcon = (
    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-gray-600 mb-4">
        {icon || defaultIcon}
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-gray-400 max-w-md mb-6">{message}</p>
      <button
        onClick={() => navigate(ROUTES.DASHBOARD)}
        className="text-green-400 hover:text-green-300 transition-colors"
      >
        ← Back to Dashboard
      </button>
    </div>
  );
};

export default PlaceholderPage;