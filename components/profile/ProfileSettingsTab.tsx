/**
 * ProfileSettingsTab - Settings tab for user profile
 *
 * Contains:
 * - Privacy links (Privacy Policy, Terms, etc.)
 * - Data export
 * - Password change
 * - Account deletion
 *
 * @version 07.53
 * @file components/profile/ProfileSettingsTab.tsx
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { DataExportButton } from './DataExportButton';
import { DeleteAccountModal } from './DeleteAccountModal';

export const ProfileSettingsTab: React.FC = () => {
  const { currentUser, userProfile, resetPassword } = useAuth();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!userProfile?.email) return;

    setPasswordResetError(null);
    setPasswordResetLoading(true);

    try {
      await resetPassword(userProfile.email);
      setPasswordResetSent(true);
    } catch (err: any) {
      setPasswordResetError(err.message || 'Failed to send password reset email');
    } finally {
      setPasswordResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white">Privacy & Account</h3>

      {/* Privacy Links */}
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
        <h4 className="text-gray-300 font-medium mb-4">Legal & Support</h4>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            to="/privacy-policy"
            className="text-lime-500 hover:text-lime-400 underline"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            className="text-lime-500 hover:text-lime-400 underline"
          >
            Terms of Service
          </Link>
          <Link
            to="/privacy-request"
            className="text-lime-500 hover:text-lime-400 underline"
          >
            Privacy Request
          </Link>
          <a
            href="mailto:support@pickleballdirector.co.nz"
            className="text-lime-500 hover:text-lime-400 underline"
          >
            Contact Support
          </a>
        </div>
      </div>

      {/* Data Export */}
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
        <h4 className="text-gray-300 font-medium mb-4">Your Data</h4>
        <p className="text-sm text-gray-400 mb-4">
          Download a copy of your personal data, including your profile information,
          registrations, and match history.
        </p>
        <DataExportButton />
      </div>

      {/* Change Password */}
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
        <h4 className="text-gray-300 font-medium mb-2">Password</h4>
        {passwordResetSent ? (
          <div>
            <p className="text-sm text-green-400 mb-2">
              Password reset email sent. Check your inbox (and spam folder).
            </p>
            <button
              onClick={() => {
                setPasswordResetSent(false);
                setPasswordResetError(null);
              }}
              className="text-sm text-gray-400 hover:text-gray-300"
            >
              Send Again
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-3">
              We'll send you an email with a link to reset your password.
            </p>
            <button
              onClick={handleChangePassword}
              disabled={passwordResetLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {passwordResetLoading ? 'Sending...' : 'Change Password'}
            </button>
            {passwordResetError && (
              <p className="text-sm text-red-400 mt-2">{passwordResetError}</p>
            )}
          </>
        )}
      </div>

      {/* Delete Account */}
      <div className="bg-red-900/10 border border-red-900/30 rounded-xl p-6">
        <h4 className="text-red-400 font-medium mb-2">Delete Account</h4>
        <p className="text-gray-400 text-sm mb-4">
          Permanently delete your account and all associated data.
          This action cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Delete My Account
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          userEmail={currentUser?.email || ''}
        />
      )}
    </div>
  );
};

export default ProfileSettingsTab;
