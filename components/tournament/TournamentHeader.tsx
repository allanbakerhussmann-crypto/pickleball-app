/**
 * TournamentHeader Component
 * 
 * Displays tournament title, back button, and view mode toggle.
 */

import React from 'react';
import type { Tournament } from '../../types';

interface TournamentHeaderProps {
  tournament: Tournament;
  onBack: () => void;
  viewMode: 'public' | 'admin';
  onToggleViewMode: () => void;
  canAccessAdmin: boolean;
  hasCompletedRegistration: boolean;
  onOpenRegistrationWizard: () => void;
  isVerified: boolean;
}

export const TournamentHeader: React.FC<TournamentHeaderProps> = ({
  tournament,
  onBack,
  viewMode,
  onToggleViewMode,
  canAccessAdmin,
  hasCompletedRegistration,
  onOpenRegistrationWizard,
  isVerified,
}) => {
  return (
    <div className="mb-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4 pl-1 focus:outline-none"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        Back to Dashboard
      </button>

      {/* Title Row */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="text-gray-400 text-sm mt-1 max-w-2xl">
              {tournament.description}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Registration Button (for players) */}
          {isVerified && !hasCompletedRegistration && (
            <button
              onClick={onOpenRegistrationWizard}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-lg"
            >
              Register Now
            </button>
          )}

          {hasCompletedRegistration && (
            <span className="text-green-400 text-sm font-medium px-3 py-1.5 bg-green-900/30 rounded-lg border border-green-800">
              ✓ Registered
            </span>
          )}

          {/* Admin Toggle */}
          {canAccessAdmin && (
            <button
              onClick={onToggleViewMode}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                viewMode === 'admin'
                  ? 'bg-purple-600 hover:bg-purple-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {viewMode === 'admin' ? '← Public View' : 'Admin View →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};