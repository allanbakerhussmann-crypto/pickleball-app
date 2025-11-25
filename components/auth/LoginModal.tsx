
import React, { useState } from 'react';
import { FirebaseError } from '@firebase/app';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types';

interface LoginModalProps {
  onClose: () => void;
}

const getFriendlyErrorMessage = (error: FirebaseError): string => {
  switch (error.code) {
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
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

export const LoginModal: React.FC<LoginModalProps> = ({ onClose }) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleChoice, setRoleChoice] = useState<UserRole>('player');
  
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLoginView) {
        if (!name.trim()) {
            setError('Please enter your name.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
    }

    setIsSubmitting(true);
    try {
      if (isLoginView) {
        await login(email, password);
      } else {
        await signup(email, password, roleChoice, name);
      }
      onClose();
    } catch (err: any) {
      if (err instanceof FirebaseError) {
        setError(getFriendlyErrorMessage(err));
      } else {
        setError('An unexpected error occurred.');
        console.error(err);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md m-4 relative border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
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
                            ? "Join tournaments and track your stats." 
                            : "Create and manage your own tournaments."}
                    </p>
                </div>
            </>
          )}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
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
            onClick={() => { setIsLoginView(!isLoginView); setError(null); }}
            className="font-semibold text-green-400 hover:text-green-300 ml-2"
          >
            {isLoginView ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
};
