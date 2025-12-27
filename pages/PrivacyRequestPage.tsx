/**
 * PrivacyRequestPage - Privacy Rights Request Form
 *
 * Allows users to submit requests for:
 * - Data access (view all their data)
 * - Data correction
 * - Account deletion
 * - Contact privacy officer
 *
 * Required for Privacy Act 2020 compliance.
 *
 * FILE LOCATION: pages/PrivacyRequestPage.tsx
 * VERSION: V06.04
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createPrivacyRequest } from '../services/firebase/privacyRequests';

type RequestType = 'access' | 'correction' | 'deletion' | 'question';

interface FormData {
  requestType: RequestType;
  email: string;
  name: string;
  details: string;
}

const REQUEST_TYPES: { value: RequestType; label: string; description: string }[] = [
  {
    value: 'access',
    label: 'Data Access Request',
    description: 'Request a copy of all personal information we hold about you',
  },
  {
    value: 'correction',
    label: 'Data Correction Request',
    description: 'Request correction of inaccurate personal information',
  },
  {
    value: 'deletion',
    label: 'Account Deletion Request',
    description: 'Request deletion of your account and personal data',
  },
  {
    value: 'question',
    label: 'Privacy Question',
    description: 'Ask a question or raise a concern about your privacy',
  },
];

const PrivacyRequestPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const [formData, setFormData] = useState<FormData>({
    requestType: 'access',
    email: currentUser?.email || '',
    name: userProfile?.displayName || '',
    details: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!formData.details.trim()) {
      setError('Please provide details about your request');
      return;
    }

    setIsSubmitting(true);

    try {
      // Store the request in Firestore
      await createPrivacyRequest({
        requestType: formData.requestType,
        name: formData.name,
        email: formData.email,
        details: formData.details,
        userId: currentUser?.uid,
      });

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedType = REQUEST_TYPES.find((t) => t.value === formData.requestType);

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
          <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Request Submitted</h1>
          <p className="text-gray-400 mb-6">
            Your privacy request has been received. We will respond to your request
            within 20 working days as required by the Privacy Act 2020.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            A confirmation will be sent to: <span className="text-green-400">{formData.email}</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors"
            >
              Return Home
            </Link>
            <button
              onClick={() => {
                setSubmitted(false);
                setFormData((prev) => ({ ...prev, details: '' }));
              }}
              className="px-6 py-2 border border-gray-600 hover:border-gray-500 text-gray-300 rounded-lg transition-colors"
            >
              Submit Another Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white mb-2">Privacy Request</h1>
        <p className="text-gray-400 mb-6">
          Submit a request regarding your personal information. We will respond within
          20 working days as required by the Privacy Act 2020.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Request Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              What would you like to do?
            </label>
            <div className="space-y-2">
              {REQUEST_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    formData.requestType === type.value
                      ? 'border-green-500 bg-green-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="requestType"
                    value={type.value}
                    checked={formData.requestType === type.value}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        requestType: e.target.value as RequestType,
                      }))
                    }
                    className="mt-1"
                  />
                  <div>
                    <span className="text-white font-medium">{type.label}</span>
                    <p className="text-gray-500 text-sm">{type.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="your@email.com"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Details */}
          <div>
            <label htmlFor="details" className="block text-sm font-medium text-gray-300 mb-2">
              {selectedType?.value === 'access' && 'What specific information are you requesting?'}
              {selectedType?.value === 'correction' && 'What information needs to be corrected?'}
              {selectedType?.value === 'deletion' && 'Please confirm your deletion request'}
              {selectedType?.value === 'question' && 'Your question or concern'}
            </label>
            <textarea
              id="details"
              value={formData.details}
              onChange={(e) => setFormData((prev) => ({ ...prev, details: e.target.value }))}
              rows={5}
              placeholder={
                selectedType?.value === 'access'
                  ? 'E.g., "I would like a copy of all my profile data, tournament registrations, and match history."'
                  : selectedType?.value === 'correction'
                  ? 'E.g., "My DUPR rating is showing incorrectly. It should be 4.5 but displays as 3.5."'
                  : selectedType?.value === 'deletion'
                  ? 'E.g., "I confirm I want to delete my account and all associated data."'
                  : 'Describe your question or concern...'
              }
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          {/* Logged In Notice */}
          {currentUser && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <p className="text-green-400 text-sm">
                <svg
                  className="w-4 h-4 inline-block mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                You are logged in as {currentUser.email}. Your request will be linked to your account.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        {/* Alternative Contact */}
        <div className="mt-8 pt-6 border-t border-gray-700">
          <p className="text-gray-400 text-sm text-center">
            You can also contact our Privacy Officer directly at{' '}
            <a
              href="mailto:privacy@pickleballdirector.com"
              className="text-green-400 hover:text-green-300"
            >
              privacy@pickleballdirector.com
            </a>
          </p>
        </div>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <Link to="/privacy-policy" className="text-gray-400 hover:text-gray-300 text-sm">
            ← Back to Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyRequestPage;
