/**
 * TournamentDetailPage
 * 
 * Route wrapper for the tournament detail/manager view.
 * 
 * FILE LOCATION: pages/TournamentDetailPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { TournamentManager } from '../components/TournamentManager';
import { getTournament, saveTournament } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../router/routes';
import type { Tournament } from '../types';

const TournamentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'cancelled' | null; show: boolean }>({ type: null, show: false });

  // Check for wizard state passed via navigation
  const wizardState = location.state?.wizardState || null;

  // Handle payment return from Stripe
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const payment = searchParams.get('payment');

    if (payment === 'success') {
      setPaymentMessage({ type: 'success', show: true });
      // Clear query params from URL
      navigate(location.pathname, { replace: true });
      // Auto-hide after 5 seconds
      setTimeout(() => setPaymentMessage({ type: null, show: false }), 5000);
    } else if (payment === 'cancelled') {
      setPaymentMessage({ type: 'cancelled', show: true });
      navigate(location.pathname, { replace: true });
      setTimeout(() => setPaymentMessage({ type: null, show: false }), 5000);
    }
  }, [location.search, navigate, location.pathname]);

  useEffect(() => {
    const loadTournament = async () => {
      if (!id) {
        setError('Tournament ID is required');
        setLoading(false);
        return;
      }

      try {
        const data = await getTournament(id);
        if (data) {
          setTournament(data);
        } else {
          setError('Tournament not found');
        }
      } catch (err) {
        console.error('Failed to load tournament:', err);
        setError('Failed to load tournament');
      } finally {
        setLoading(false);
      }
    };

    loadTournament();
  }, [id]);

  const handleUpdateTournament = async (updated: Tournament) => {
    await saveTournament(updated);
    setTournament(updated);
  };

  const handleBack = () => {
    navigate(ROUTES.TOURNAMENTS);
  };

  const clearWizardState = () => {
    // Clear the wizard state from location
    navigate(location.pathname, { replace: true, state: {} });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-red-400 mb-4">{error || 'Tournament not found'}</h2>
        <button
          onClick={handleBack}
          className="text-green-400 hover:underline"
        >
          Back to Tournaments
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Payment Status Banner */}
      {paymentMessage.show && paymentMessage.type && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in ${
          paymentMessage.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-yellow-600 text-white'
        }`}>
          {paymentMessage.type === 'success' ? (
            <>
              <span className="text-xl">✓</span>
              <span className="font-medium">Payment successful! You are now registered.</span>
            </>
          ) : (
            <>
              <span className="text-xl">ℹ</span>
              <span className="font-medium">Payment cancelled. You can try again from the registration page.</span>
            </>
          )}
          <button
            onClick={() => setPaymentMessage({ type: null, show: false })}
            className="ml-2 text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <TournamentManager
        tournament={tournament}
        onUpdateTournament={handleUpdateTournament}
        isVerified={!!currentUser?.emailVerified}
        onBack={handleBack}
        initialWizardState={wizardState}
        clearWizardState={clearWizardState}
      />
    </>
  );
};

export default TournamentDetailPage;