/**
 * DataExportButton - Export User Data for Privacy Act 2020 Compliance
 *
 * Allows users to download all their personal data as JSON.
 * Required for data portability under the Privacy Act 2020.
 *
 * FILE LOCATION: components/profile/DataExportButton.tsx
 * VERSION: V06.04
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { exportUserData } from '../../services/firebase/accountDeletion';

export const DataExportButton: React.FC = () => {
  const { currentUser } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    if (!currentUser) {
      setError('You must be logged in to export your data');
      return;
    }

    setIsExporting(true);
    setError(null);
    setSuccess(false);

    try {
      const data = await exportUserData(currentUser.uid);

      // Create a downloadable JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);

      // Create download link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `pickleball-director-data-${currentUser.uid.slice(0, 8)}-${
        new Date().toISOString().split('T')[0]
      }.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      URL.revokeObjectURL(url);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error('Error exporting data:', err);
      setError(err.message || 'Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </div>
        <div className="flex-grow">
          <h4 className="text-white font-medium mb-1">Export Your Data</h4>
          <p className="text-gray-400 text-sm mb-3">
            Download a copy of all your personal information stored on Pickleball Director.
            The export includes your profile, registrations, and activity data.
          </p>

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 mb-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-900/20 border border-green-800 rounded px-3 py-2 mb-3">
              <p className="text-green-400 text-sm">
                Data exported successfully! Check your downloads folder.
              </p>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isExporting ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Exporting...
              </>
            ) : (
              <>
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download My Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
