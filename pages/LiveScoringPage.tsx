/**
 * Live Scoring Page
 *
 * Route: /score/live/:id
 * Full-screen court-tap interface for scorers.
 *
 * FILE: pages/LiveScoringPage.tsx
 * VERSION: V06.03
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LiveScoringInterface } from '../components/scoring';
import type { LiveScore } from '../types/scoring';
import {
  subscribeToLiveScore,
  subscribeToStandaloneGame,
  syncLiveScoreState,
  canUserScore,
} from '../services/firebase/liveScores';

const LiveScoringPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [score, setScore] = useState<LiveScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // Subscribe to score updates
  useEffect(() => {
    if (!id) {
      setError('No match ID provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Try regular live score first
    const unsubscribe = subscribeToLiveScore(id, (liveScore) => {
      if (liveScore) {
        setScore(liveScore);
        setIsStandalone(false);
        setLoading(false);
      } else {
        // Try standalone game
        const unsubStandalone = subscribeToStandaloneGame(id, (game) => {
          if (game) {
            setScore(game);
            setIsStandalone(true);
          } else {
            setError('Match not found');
          }
          setLoading(false);
        });

        return () => unsubStandalone();
      }
    });

    return () => unsubscribe();
  }, [id]);

  // Handle score changes
  const handleScoreChange = useCallback(async (state: LiveScore) => {
    if (!id) return;

    try {
      await syncLiveScoreState(id, state, isStandalone);
    } catch (err) {
      console.error('Error syncing score:', err);
    }
  }, [id, isStandalone]);

  // Handle match complete
  const handleMatchComplete = useCallback(async (state: LiveScore) => {
    if (!id) return;

    try {
      await syncLiveScoreState(id, state, isStandalone);
    } catch (err) {
      console.error('Error syncing final score:', err);
    }
  }, [id, isStandalone]);

  // Check permissions
  const canScore = score && user ? canUserScore(user.uid, score) : false;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-gray-400">Loading match...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !score) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🏓</div>
          <div className="text-xl font-bold text-white mb-2">Match Not Found</div>
          <div className="text-gray-400 mb-6">{error || 'This match does not exist or has been deleted.'}</div>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!canScore) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <div className="text-xl font-bold text-white mb-2">Not Authorized</div>
          <div className="text-gray-400 mb-6">
            You don't have permission to score this match.
          </div>
          <div className="space-x-4">
            <button
              onClick={() => navigate(`/score/watch/${id}`)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white"
            >
              Watch Instead
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Scoring interface
  return (
    <LiveScoringInterface
      initialState={score}
      onScoreChange={handleScoreChange}
      onMatchComplete={handleMatchComplete}
      fullscreen={true}
    />
  );
};

export default LiveScoringPage;
