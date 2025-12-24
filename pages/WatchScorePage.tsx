/**
 * Watch Score Page
 *
 * Route: /score/watch/:id
 * Spectator view for a single match.
 *
 * FILE: pages/WatchScorePage.tsx
 * VERSION: V06.03
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { LiveScoreDisplay } from '../components/scoring';
import { subscribeToLiveScore, subscribeToStandaloneGame, getGameByShareCode } from '../services/firebase/liveScores';
import type { LiveScore } from '../types/scoring';

const WatchScorePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [scoreId, setScoreId] = useState<string | null>(null);

  // Try to find the score
  useEffect(() => {
    if (!id) {
      setError('No match ID provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Check if it's a share code (6 chars alphanumeric)
    const isShareCode = /^[A-Z0-9]{6}$/i.test(id);

    if (isShareCode) {
      // Look up by share code
      getGameByShareCode(id).then((game) => {
        if (game) {
          setScoreId(game.id);
          setIsStandalone(true);
        } else {
          setError('Game not found');
        }
        setLoading(false);
      });
    } else {
      // Try regular live score first
      const unsubscribe = subscribeToLiveScore(id, (liveScore) => {
        if (liveScore) {
          setScoreId(id);
          setIsStandalone(false);
          setLoading(false);
        } else {
          // Try standalone game
          const unsubStandalone = subscribeToStandaloneGame(id, (game) => {
            if (game) {
              setScoreId(id);
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
    }
  }, [id]);

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
  if (error || !scoreId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🏓</div>
          <div className="text-xl font-bold text-white mb-2">Match Not Found</div>
          <div className="text-gray-400 mb-6">{error || 'This match does not exist or has ended.'}</div>
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

  // Spectator view
  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
        >
          <span>←</span>
          <span>Back to Home</span>
        </Link>
        <h1 className="text-2xl font-bold text-white">Live Score</h1>
        <p className="text-gray-400 text-sm">Watching in real-time</p>
      </div>

      {/* Score Display */}
      <LiveScoreDisplay
        scoreId={scoreId}
        isStandalone={isStandalone}
        showHistory={true}
        className="max-w-2xl mx-auto"
      />

      {/* Footer */}
      <div className="max-w-2xl mx-auto mt-6 text-center text-sm text-gray-500">
        <p>Score updates automatically</p>
      </div>
    </div>
  );
};

export default WatchScorePage;
