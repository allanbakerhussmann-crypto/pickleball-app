
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../router/routes';
import type { UserRole } from '../../types';
import { isFirebaseConfigured } from '../../services/firebase';
import { PhoneInput } from '../shared/PhoneInput';
import { ModalShell } from '../shared/ModalShell';

interface LoginModalProps {
  onClose: () => void;
  onOpenConfig?: () => void;
}

const getFriendlyErrorMessage = (error: any): string => {
  const code = error?.code || '';
  const message = error?.message || '';

  // Detect API Key errors (often due to missing configuration)
  if (
      code.includes('api-key') || 
      code === 'auth/invalid-api-key' ||
      message.toLowerCase().includes('api-key') ||
      message.toLowerCase().includes('api key')
  ) {
      return 'CONFIGURATION_ERROR';
  }

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
    default:
      return error?.message || 'An unexpected error occurred. Please try again.';
  }
};

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onOpenConfig }) => {
  const navigate = useNavigate();
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleChoice, setRoleChoice] = useState<UserRole>('player');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [agreeToDataProcessing, setAgreeToDataProcessing] = useState(false);
  const [phone, setPhone] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isConfigError, setIsConfigError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, signup, resetPassword, updateUserExtendedProfile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsConfigError(false);
    setMessage(null);

    // Extra validation for sign-up view
    if (!isLoginView) {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      // Phone number is optional at signup
      // Will be required when joining leagues/tournaments
      if (!agreeToTerms) {
        setError('You must agree to the Privacy Policy and Terms of Service.');
        return;
      }
      if (!agreeToDataProcessing) {
        setError('You must consent to data processing to create an account.');
        return;
      }
    }

    setIsSubmitting(true);

    if (!isFirebaseConfigured()) {
      setError("Firebase is not configured. Please click Configure Database first.");
      setIsConfigError(true);
      setIsSubmitting(false);
      return;
    }

    try {

      if (isLoginView) {
        await login(email, password);
        onClose();
        navigate(ROUTES.DASHBOARD);
      } else {
        // Pass consent data to signup for Privacy Act 2020 compliance
        await signup(email, password, roleChoice, name, {
          privacyPolicy: agreeToTerms,
          termsOfService: agreeToTerms,
          dataProcessing: agreeToDataProcessing,
        });

        // Save phone if provided (optional at signup)
        // Phone will be required when joining leagues/tournaments
        if (phone && phone.startsWith('+') && phone.length >= 10) {
          await updateUserExtendedProfile({ phone, phoneVerified: false });
        }

        // Go straight to dashboard - no blocking verification
        onClose();
        navigate(ROUTES.DASHBOARD);
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      
      if (friendlyMsg === 'CONFIGURATION_ERROR') {
          setError('Firebase is not configured or the API key is invalid.');
          setIsConfigError(true);
      } else {
          setError(friendlyMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setIsConfigError(false);
    setMessage(null);

    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    if (!isFirebaseConfigured()) {
      setError("Firebase is not configured. Please click Configure Database first.");
      setIsConfigError(true);
      return;
    }


    try {
      await resetPassword(email);
      setMessage('Password reset email sent. Please check your inbox — and don’t forget to check your spam folder.');
    } catch (err: any) {
      console.error("Reset Password Error:", err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      if (friendlyMsg === 'CONFIGURATION_ERROR') {
          setError('Firebase is not configured or the API key is invalid.');
          setIsConfigError(true);
      } else {
          setError('Unable to send password reset email. Please try again.');
      }
    }
  };

  return (
    <ModalShell isOpen={true} onClose={onClose}>
        <div className="p-6 sm:p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl"
          aria-label="Close"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold text-center mb-6 text-green-400">
          {isLoginView ? 'Welcome Back' : 'Create Account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLoginView && (
            <div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                required
                className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email Address"
            required
            className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          {isLoginView && (
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-green-400 hover:text-green-300"
              >
                Forgot your password?
              </button>
            </div>
          )}

          {!isLoginView && (
            <>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                required
                className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Mobile Number <span className="text-gray-500">(optional)</span>
                </label>
                <PhoneInput
                  value={phone}
                  onChange={(e164Value) => setPhone(e164Value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required later when joining leagues or tournaments
                </p>
              </div>

              <div className="pt-2">
                <p className="text-sm text-gray-300 mb-2">I want to:</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRoleChoice('player')}
                    className={`text-sm py-2 px-3 rounded border transition-colors ${
                      roleChoice === 'player' 
                        ? 'bg-green-600/20 border-green-500 text-green-400 font-bold' 
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleChoice('organizer')}
                    className={`text-sm py-2 px-3 rounded border transition-colors ${
                      roleChoice === 'organizer' 
                        ? 'bg-green-600/20 border-green-500 text-green-400 font-bold' 
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    Organize
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {roleChoice === 'player'
                    ? 'Join tournaments and track your stats.'
                    : 'Create and manage your own tournaments.'}
                </p>
              </div>

              {/* Privacy Consent Checkboxes */}
              <div className="pt-4 space-y-3 border-t border-gray-700">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500 bg-gray-700"
                  />
                  <span className="text-sm text-gray-300">
                    I agree to the{' '}
                    <Link
                      to="/privacy-policy"
                      target="_blank"
                      className="text-green-400 hover:text-green-300 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </Link>
                    {' '}and{' '}
                    <Link
                      to="/terms"
                      target="_blank"
                      className="text-green-400 hover:text-green-300 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms of Service
                    </Link>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeToDataProcessing}
                    onChange={(e) => setAgreeToDataProcessing(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500 bg-gray-700"
                  />
                  <span className="text-sm text-gray-300">
                    I consent to my data being processed by third-party services (Firebase, Stripe, DUPR) located in the USA
                  </span>
                </label>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-900/20 p-3 rounded text-center">
                <p className="text-red-400 text-sm font-bold mb-2">{error}</p>
                {isConfigError && onOpenConfig && (
                    <button
                        type="button"
                        onClick={onOpenConfig}
                        className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded transition-colors"
                    >
                        Configure Database
                    </button>
                )}
            </div>
          )}
          {message && (
            <div className="text-green-400 text-sm text-center mt-1 leading-snug">
              {message}
            </div>
          )}


          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-500 mt-2"
          >
            {isSubmitting ? 'Loading...' : (isLoginView ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="text-center text-sm text-gray-400 mt-6">
          {isLoginView ? "Don't have an account?" : 'Already have an account?'}
          <button
            onClick={() => { 
              setIsLoginView(!isLoginView); 
              setError(null); 
              setIsConfigError(false);
              setMessage(null);
            }}
            className="font-semibold text-green-400 hover:text-green-300 ml-2"
          >
            {isLoginView ? 'Sign Up' : 'Login'}
          </button>
        </p>
        </div>
    </ModalShell>
  );
};
