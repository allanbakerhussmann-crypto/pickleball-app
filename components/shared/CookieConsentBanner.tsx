/**
 * CookieConsentBanner - Storage Consent for Privacy Act 2020 Compliance
 *
 * Informs users about localStorage/sessionStorage usage and obtains consent.
 * Required for transparency under the Privacy Act 2020.
 *
 * FILE LOCATION: components/shared/CookieConsentBanner.tsx
 * VERSION: V06.04
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'pd_storage_consent';
const CONSENT_VERSION = '1'; // Increment if policy changes require new consent

interface ConsentState {
  consented: boolean;
  version: string;
  timestamp: number;
}

export const CookieConsentBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const consent: ConsentState = JSON.parse(stored);
        // Show banner if consent version is outdated
        if (consent.consented && consent.version === CONSENT_VERSION) {
          return; // Already consented to current version
        }
      }
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    } catch {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    const consent: ConsentState = {
      consented: true,
      version: CONSENT_VERSION,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // Storage might be disabled, continue anyway
    }
    setShowBanner(false);
  };

  const handleDecline = () => {
    // Even if declined, we need to store the preference
    // But we inform them that essential storage is still used
    const consent: ConsentState = {
      consented: false,
      version: CONSENT_VERSION,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // Storage might be disabled
    }
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-gray-900 border-t border-gray-700 shadow-lg">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          {/* Icon */}
          <div className="hidden md:flex w-12 h-12 bg-green-600/20 rounded-full items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-grow">
            <h3 className="text-white font-semibold mb-1">
              We value your privacy
            </h3>
            <p className="text-gray-400 text-sm">
              We use browser storage to keep you logged in and remember your preferences.
              We do not use tracking cookies for advertising. By continuing, you agree to our{' '}
              <Link
                to="/privacy-policy"
                className="text-green-400 hover:text-green-300 underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 flex-shrink-0 w-full md:w-auto">
            <button
              onClick={handleDecline}
              className="flex-1 md:flex-none px-4 py-2 text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg text-sm transition-colors"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 md:flex-none px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Accept
            </button>
          </div>
        </div>

        {/* Details (collapsible could be added later) */}
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-gray-500 text-xs">
            <strong className="text-gray-400">What we store:</strong>{' '}
            Authentication tokens (to keep you logged in), user preferences, and consent choices.
            Your data is stored on Firebase servers in the USA.{' '}
            <Link
              to="/privacy-policy"
              className="text-green-400 hover:text-green-300 underline"
            >
              Learn more
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to check if user has consented to storage
 */
export const useStorageConsent = (): boolean => {
  const [hasConsent, setHasConsent] = useState(true); // Default true for functionality

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const consent: ConsentState = JSON.parse(stored);
        setHasConsent(consent.consented);
      }
    } catch {
      setHasConsent(true); // Assume consent if storage fails
    }
  }, []);

  return hasConsent;
};
