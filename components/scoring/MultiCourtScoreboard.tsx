/**
 * Multi-Court Scoreboard
 *
 * Venue display showing multiple live matches at once.
 * Supports grid, carousel, and list layouts.
 * Designed for large screens in tournament venues.
 *
 * FILE: components/scoring/MultiCourtScoreboard.tsx
 * VERSION: V06.03
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { LiveScore, ScoreboardConfig, ScoreboardLayout } from '../../types/scoring';
import type { TournamentSponsor } from '../../types';
import { subscribeToEventLiveScores, subscribeToScoreboardConfig } from '../../services/firebase/liveScores';
import { LiveScoreDisplay } from './LiveScoreDisplay';
import { SponsorLogoStrip } from '../shared/SponsorLogoStrip';
import { ClubBrandingSection } from '../shared/ClubBrandingSection';

// =============================================================================
// PROPS
// =============================================================================

interface MultiCourtScoreboardProps {
  /** Event ID to display scores for */
  eventId: string;
  /** Event type */
  eventType: 'tournament' | 'league' | 'meetup';
  /** Event name for header */
  eventName?: string;
  /** Optional logo URL */
  logoUrl?: string;
  /** Layout mode */
  layout?: ScoreboardLayout;
  /** Courts to display (or 'all') */
  courts?: number[] | 'all';
  /** Theme */
  theme?: 'dark' | 'light';
  /** Show header */
  showHeader?: boolean;
  /** Auto-rotate interval for carousel (seconds) */
  autoRotateSeconds?: number;
  /** Is organizer mode (shows controls) */
  isOrganizer?: boolean;
  /** Callback when config changes */
  onConfigChange?: (config: Partial<ScoreboardConfig>) => void;
  /** Event sponsors to display */
  sponsors?: TournamentSponsor[];
  /** Club ID for branding display */
  clubId?: string;
  /** Club name (fallback if club not loaded) */
  clubName?: string;
}

// =============================================================================
// MINI SCORE CARD (for grid view)
// =============================================================================

interface MiniScoreCardProps {
  score: LiveScore;
  onClick?: () => void;
}

const MiniScoreCard: React.FC<MiniScoreCardProps> = ({ score, onClick }) => {
  const { teamA, teamB, scoreA, scoreB, servingTeam, serverNumber, status, gamesWon, currentGame, settings, winnerId } = score;
  const isLive = status === 'in_progress';
  const isCompleted = status === 'completed';

  return (
    <div
      className={`bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors ${
        isLive ? 'ring-2 ring-green-500/50' : ''
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-300">
          Court {score.courtNumber || '?'}
        </div>
        <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          isLive ? 'bg-green-600' :
          isCompleted ? 'bg-purple-600' :
          status === 'paused' ? 'bg-yellow-600' :
          'bg-gray-600'
        }`}>
          {isLive ? 'LIVE' :
           isCompleted ? 'FINAL' :
           status === 'paused' ? 'PAUSED' :
           status === 'between_games' ? 'BREAK' :
           'WAITING'}
        </div>
      </div>

      {/* Score Display */}
      <div className="space-y-2">
        {/* Team A Row */}
        <div className={`flex items-center gap-2 ${
          isCompleted && winnerId === 'A' ? 'font-bold' : ''
        }`}>
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: teamA.color }}
          />
          <span className="text-white truncate flex-1">{teamA.name}</span>
          {servingTeam === 'A' && !isCompleted && (
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
          )}
          <span className="text-gray-400 text-sm w-4">{gamesWon.A}</span>
          <span className="text-3xl font-bold text-white w-10 text-right">{scoreA}</span>
        </div>

        {/* Team B Row */}
        <div className={`flex items-center gap-2 ${
          isCompleted && winnerId === 'B' ? 'font-bold' : ''
        }`}>
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: teamB.color }}
          />
          <span className="text-white truncate flex-1">{teamB.name}</span>
          {servingTeam === 'B' && !isCompleted && (
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
          )}
          <span className="text-gray-400 text-sm w-4">{gamesWon.B}</span>
          <span className="text-3xl font-bold text-white w-10 text-right">{scoreB}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
        <span>Game {currentGame}/{settings.bestOf}</span>
        {settings.sideOutScoring && settings.playType === 'doubles' && !isCompleted && (
          <span>Server {serverNumber}</span>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const MultiCourtScoreboard: React.FC<MultiCourtScoreboardProps> = ({
  eventId,
  eventType,
  eventName = 'Live Scoreboard',
  logoUrl,
  layout = 'grid',
  courts = 'all',
  theme = 'dark',
  showHeader = true,
  autoRotateSeconds = 10,
  isOrganizer = false,
  onConfigChange,
  sponsors,
  clubId,
  clubName,
}) => {
  const [scores, setScores] = useState<LiveScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScore, setSelectedScore] = useState<LiveScore | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [currentLayout, setCurrentLayout] = useState<ScoreboardLayout>(layout);

  // Subscribe to live scores
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToEventLiveScores(eventId, eventType, (liveScores) => {
      // Filter by courts if specified
      let filtered = liveScores;
      if (courts !== 'all') {
        filtered = liveScores.filter(s => s.courtNumber && courts.includes(s.courtNumber));
      }
      setScores(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [eventId, eventType, courts]);

  // Auto-rotate for carousel mode
  useEffect(() => {
    if (currentLayout !== 'carousel' || scores.length <= 1) return;

    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % scores.length);
    }, autoRotateSeconds * 1000);

    return () => clearInterval(interval);
  }, [currentLayout, scores.length, autoRotateSeconds]);

  // Handle layout change
  const handleLayoutChange = useCallback((newLayout: ScoreboardLayout) => {
    setCurrentLayout(newLayout);
    onConfigChange?.({ layout: newLayout });
  }, [onConfigChange]);

  // Theme classes
  const themeClasses = theme === 'dark'
    ? 'bg-gray-900 text-white'
    : 'bg-gray-100 text-gray-900';

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================

  if (loading) {
    return (
      <div className={`min-h-screen ${themeClasses} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-gray-400">Loading scoreboard...</div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // EMPTY STATE
  // ==========================================================================

  if (scores.length === 0) {
    return (
      <div className={`min-h-screen ${themeClasses} flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-6xl mb-4">🏓</div>
          <div className="text-2xl font-bold mb-2">No Active Matches</div>
          <div className="text-gray-400">
            Live scores will appear here when matches start
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // SINGLE MATCH VIEW (when selected)
  // ==========================================================================

  if (selectedScore) {
    return (
      <div className={`min-h-screen ${themeClasses} p-6`}>
        <button
          onClick={() => setSelectedScore(null)}
          className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <span>←</span>
          <span>Back to all courts</span>
        </button>
        <LiveScoreDisplay
          scoreId={selectedScore.id}
          showHistory={true}
          className="max-w-2xl mx-auto"
        />
      </div>
    );
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className={`min-h-screen ${themeClasses}`}>
      {/* Header */}
      {showHeader && (
        <header className="bg-gray-800/50 px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-10" />
            ) : (
              <span className="text-3xl">🏓</span>
            )}
            <div>
              <h1 className="text-xl font-bold">{eventName}</h1>
              <p className="text-sm text-gray-400">
                {scores.length} active match{scores.length !== 1 ? 'es' : ''}
              </p>
            </div>
          </div>

          {/* Layout Controls (Organizer only) */}
          {isOrganizer && (
            <div className="flex items-center gap-2">
              {(['grid', 'carousel', 'list'] as ScoreboardLayout[]).map((l) => (
                <button
                  key={l}
                  onClick={() => handleLayoutChange(l)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    currentLayout === l
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Club Branding */}
          {(clubId || clubName) && (
            <ClubBrandingSection
              clubId={clubId}
              clubName={clubName}
              variant="scoreboard"
            />
          )}

          {/* Sponsors */}
          {sponsors && sponsors.filter(s => s.isActive).length > 0 && (
            <div className="flex items-center">
              <SponsorLogoStrip
                sponsors={sponsors.filter(s => s.isActive)}
                variant="scoreboard"
              />
            </div>
          )}

          {/* Timestamp */}
          <div className="text-sm text-gray-500">
            Updated: {new Date().toLocaleTimeString()}
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="p-6">
        {/* GRID LAYOUT */}
        {currentLayout === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scores.map((score) => (
              <MiniScoreCard
                key={score.id}
                score={score}
                onClick={() => setSelectedScore(score)}
              />
            ))}
          </div>
        )}

        {/* CAROUSEL LAYOUT */}
        {currentLayout === 'carousel' && (
          <div className="max-w-3xl mx-auto">
            {/* Current Score */}
            <LiveScoreDisplay
              scoreId={scores[carouselIndex]?.id}
              showHistory={true}
            />

            {/* Navigation Dots */}
            <div className="flex justify-center gap-2 mt-6">
              {scores.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCarouselIndex(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === carouselIndex
                      ? 'bg-green-500'
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}
                />
              ))}
            </div>

            {/* Court List */}
            <div className="mt-6 flex justify-center gap-2 flex-wrap">
              {scores.map((score, index) => (
                <button
                  key={score.id}
                  onClick={() => setCarouselIndex(index)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    index === carouselIndex
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Court {score.courtNumber || index + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LIST LAYOUT */}
        {currentLayout === 'list' && (
          <div className="max-w-4xl mx-auto space-y-4">
            {scores.map((score) => (
              <LiveScoreDisplay
                key={score.id}
                scoreId={score.id}
                compact={true}
                className="cursor-pointer hover:ring-2 hover:ring-green-500/50"
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-gray-800/80 backdrop-blur-sm px-6 py-2 flex items-center justify-between text-xs text-gray-500 border-t border-gray-700">
        <div>Pickleball Scoring System</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Live</span>
        </div>
      </footer>
    </div>
  );
};

export default MultiCourtScoreboard;
