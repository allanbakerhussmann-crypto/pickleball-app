/**
 * Standalone Scoring Dashboard Tab
 *
 * Independent scoring app for casual/practice games.
 * Not tied to any event - just quick game scoring.
 *
 * FILE: components/scoring/StandaloneScoring.tsx
 * VERSION: V06.03
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { ScoringSettings, ScoringTeam, StandaloneGame, PlayType, PointsPerGame, BestOf } from '../../types/scoring';
import { DEFAULT_SCORING_SETTINGS } from '../../types/scoring';
import { createStandaloneGame, getUserStandaloneGames, deleteStandaloneGame } from '../../services/firebase/liveScores';
import { createInitialLiveScore } from '../../services/scoring/scoringLogic';
import { LiveScoringInterface } from './LiveScoringInterface';
import { syncLiveScoreState } from '../../services/firebase/liveScores';

// =============================================================================
// QUICK START FORM
// =============================================================================

interface QuickStartFormProps {
  onStart: (teamA: ScoringTeam, teamB: ScoringTeam, settings: ScoringSettings) => void;
  loading: boolean;
}

const QuickStartForm: React.FC<QuickStartFormProps> = ({ onStart, loading }) => {
  const { user, profile } = useAuth();

  // Team setup
  const [teamAName, setTeamAName] = useState('Team A');
  const [teamBName, setTeamBName] = useState('Team B');
  const [teamAPlayers, setTeamAPlayers] = useState<string[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<string[]>([]);

  // Game settings
  const [playType, setPlayType] = useState<PlayType>('doubles');
  const [pointsPerGame, setPointsPerGame] = useState<PointsPerGame>(11);
  const [bestOf, setBestOf] = useState<BestOf>(1);
  const [sideOutScoring, setSideOutScoring] = useState(true);

  // Pre-fill user as first player
  useEffect(() => {
    if (profile?.displayName) {
      setTeamAPlayers([profile.displayName]);
      setTeamAName(profile.displayName);
    }
  }, [profile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const teamA: ScoringTeam = {
      name: teamAName || 'Team A',
      color: '#3B82F6', // Blue
      players: teamAPlayers.filter(Boolean),
      playerIds: user ? [user.uid] : [],
    };

    const teamB: ScoringTeam = {
      name: teamBName || 'Team B',
      color: '#F97316', // Orange
      players: teamBPlayers.filter(Boolean),
    };

    const settings: ScoringSettings = {
      playType,
      pointsPerGame,
      winBy: 2,
      bestOf,
      sideOutScoring,
    };

    onStart(teamA, teamB, settings);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6">
      <h2 className="text-xl font-bold text-white mb-6">Quick Start Game</h2>

      {/* Teams */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Team A */}
        <div className="space-y-3">
          <label className="block text-sm text-gray-400">Team 1</label>
          <input
            type="text"
            value={teamAName}
            onChange={(e) => setTeamAName(e.target.value)}
            placeholder="Team name"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
          />
          {playType === 'doubles' && (
            <>
              <input
                type="text"
                value={teamAPlayers[0] || ''}
                onChange={(e) => setTeamAPlayers([e.target.value, teamAPlayers[1] || ''])}
                placeholder="Player 1"
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
              <input
                type="text"
                value={teamAPlayers[1] || ''}
                onChange={(e) => setTeamAPlayers([teamAPlayers[0] || '', e.target.value])}
                placeholder="Player 2"
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </>
          )}
          {playType === 'singles' && (
            <input
              type="text"
              value={teamAPlayers[0] || ''}
              onChange={(e) => setTeamAPlayers([e.target.value])}
              placeholder="Player name"
              className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          )}
        </div>

        {/* Team B */}
        <div className="space-y-3">
          <label className="block text-sm text-gray-400">Team 2</label>
          <input
            type="text"
            value={teamBName}
            onChange={(e) => setTeamBName(e.target.value)}
            placeholder="Team name"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
          />
          {playType === 'doubles' && (
            <>
              <input
                type="text"
                value={teamBPlayers[0] || ''}
                onChange={(e) => setTeamBPlayers([e.target.value, teamBPlayers[1] || ''])}
                placeholder="Player 1"
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
              <input
                type="text"
                value={teamBPlayers[1] || ''}
                onChange={(e) => setTeamBPlayers([teamBPlayers[0] || '', e.target.value])}
                placeholder="Player 2"
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </>
          )}
          {playType === 'singles' && (
            <input
              type="text"
              value={teamBPlayers[0] || ''}
              onChange={(e) => setTeamBPlayers([e.target.value])}
              placeholder="Player name"
              className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          )}
        </div>
      </div>

      {/* Game Settings */}
      <div className="space-y-4 mb-6">
        {/* Play Type */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Format</label>
          <div className="flex gap-2">
            {(['singles', 'doubles'] as PlayType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPlayType(type)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  playType === type
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Points Per Game */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Points per Game</label>
          <div className="flex gap-2">
            {([11, 15, 21] as PointsPerGame[]).map((pts) => (
              <button
                key={pts}
                type="button"
                onClick={() => setPointsPerGame(pts)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  pointsPerGame === pts
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {pts}
              </button>
            ))}
          </div>
        </div>

        {/* Best Of */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Games</label>
          <div className="flex gap-2">
            {([1, 3, 5] as BestOf[]).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setBestOf(num)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  bestOf === num
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Best of {num}
              </button>
            ))}
          </div>
        </div>

        {/* Side-Out Scoring Toggle */}
        <div className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
          <div>
            <div className="text-white font-medium">Traditional Scoring</div>
            <div className="text-xs text-gray-400">Only serving team scores</div>
          </div>
          <button
            type="button"
            onClick={() => setSideOutScoring(!sideOutScoring)}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              sideOutScoring ? 'bg-green-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                sideOutScoring ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-lg transition-colors"
      >
        {loading ? 'Starting...' : 'Start Scoring'}
      </button>
    </form>
  );
};

// =============================================================================
// RECENT GAMES LIST
// =============================================================================

interface RecentGamesListProps {
  games: StandaloneGame[];
  onSelectGame: (game: StandaloneGame) => void;
  onDeleteGame: (gameId: string) => void;
}

const RecentGamesList: React.FC<RecentGamesListProps> = ({ games, onSelectGame, onDeleteGame }) => {
  if (games.length === 0) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-4">Recent Games</h2>
      <div className="space-y-2">
        {games.map((game) => (
          <div
            key={game.id}
            className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3 hover:bg-gray-700 transition-colors cursor-pointer"
            onClick={() => game.status !== 'completed' && onSelectGame(game)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: game.teamA.color }}
                />
                <span className="text-white font-medium truncate">
                  {game.teamA.name} vs {game.teamB.name}
                </span>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {game.status === 'completed' ? (
                  <>
                    {game.winnerId === 'A' ? game.teamA.name : game.teamB.name} won •{' '}
                    {game.completedGames.map((g) => `${g.scoreA}-${g.scoreB}`).join(', ')}
                  </>
                ) : (
                  <>
                    {game.scoreA}-{game.scoreB} • Game {game.currentGame}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 ml-4">
              <span className="text-xs text-gray-500">
                {formatDate(game.createdAt)}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                game.status === 'completed' ? 'bg-purple-600' :
                game.status === 'in_progress' ? 'bg-green-600' :
                'bg-gray-600'
              }`}>
                {game.status === 'completed' ? 'Done' :
                 game.status === 'in_progress' ? 'Live' :
                 'Paused'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteGame(game.id);
                }}
                className="text-gray-400 hover:text-red-400 transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const StandaloneScoring: React.FC = () => {
  const { user } = useAuth();

  // State
  const [mode, setMode] = useState<'menu' | 'scoring'>('menu');
  const [activeGame, setActiveGame] = useState<StandaloneGame | null>(null);
  const [recentGames, setRecentGames] = useState<StandaloneGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Load recent games
  useEffect(() => {
    if (!user) {
      setRecentGames([]);
      setLoadingRecent(false);
      return;
    }

    const loadRecent = async () => {
      try {
        const games = await getUserStandaloneGames(user.uid, 10);
        setRecentGames(games);
      } catch (err) {
        console.error('Error loading recent games:', err);
      } finally {
        setLoadingRecent(false);
      }
    };

    loadRecent();
  }, [user]);

  // Start new game
  const handleStartGame = useCallback(async (
    teamA: ScoringTeam,
    teamB: ScoringTeam,
    settings: ScoringSettings
  ) => {
    if (!user) {
      alert('Please sign in to score games');
      return;
    }

    setLoading(true);
    try {
      const gameId = await createStandaloneGame(user.uid, teamA, teamB, settings, {
        saveToHistory: true,
        shareEnabled: false,
      });

      // Create initial state
      const initialState = createInitialLiveScore(teamA, teamB, settings, {
        eventType: 'standalone',
        scorerId: user.uid,
      });

      setActiveGame({
        ...initialState,
        id: gameId,
        eventType: 'standalone',
        ownerId: user.uid,
        saveToHistory: true,
        submitToDupr: false,
        shareEnabled: false,
      } as StandaloneGame);
      setMode('scoring');
    } catch (err) {
      console.error('Error creating game:', err);
      alert('Failed to create game');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Resume existing game
  const handleResumeGame = useCallback((game: StandaloneGame) => {
    setActiveGame(game);
    setMode('scoring');
  }, []);

  // Delete game
  const handleDeleteGame = useCallback(async (gameId: string) => {
    if (!confirm('Delete this game?')) return;

    try {
      await deleteStandaloneGame(gameId);
      setRecentGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch (err) {
      console.error('Error deleting game:', err);
    }
  }, []);

  // Handle score changes
  const handleScoreChange = useCallback(async (state: any) => {
    if (!activeGame) return;

    // Sync to Firebase
    try {
      await syncLiveScoreState(activeGame.id, state, true);
    } catch (err) {
      console.error('Error syncing score:', err);
    }
  }, [activeGame]);

  // Handle match complete
  const handleMatchComplete = useCallback(async (state: any) => {
    if (!activeGame) return;

    // Sync final state
    try {
      await syncLiveScoreState(activeGame.id, state, true);
    } catch (err) {
      console.error('Error syncing final score:', err);
    }

    // Go back to menu after a delay
    setTimeout(() => {
      setMode('menu');
      setActiveGame(null);
      // Reload recent games
      if (user) {
        getUserStandaloneGames(user.uid, 10).then(setRecentGames);
      }
    }, 3000);
  }, [activeGame, user]);

  // Exit scoring
  const handleExitScoring = useCallback(() => {
    if (activeGame?.status === 'in_progress') {
      if (!confirm('Exit scoring? Game will be saved and can be resumed.')) {
        return;
      }
    }
    setMode('menu');
    setActiveGame(null);
  }, [activeGame]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Not signed in
  if (!user) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏓</div>
          <h2 className="text-xl font-bold text-white mb-2">Score Your Games</h2>
          <p className="text-gray-400 mb-4">
            Sign in to use the standalone scoring app
          </p>
        </div>
      </div>
    );
  }

  // Scoring mode
  if (mode === 'scoring' && activeGame) {
    return (
      <div className="relative">
        {/* Exit button */}
        <button
          onClick={handleExitScoring}
          className="absolute top-2 left-2 z-10 px-3 py-1 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-sm text-white transition-colors"
        >
          ← Exit
        </button>

        <LiveScoringInterface
          initialState={activeGame}
          onScoreChange={handleScoreChange}
          onMatchComplete={handleMatchComplete}
          fullscreen={false}
        />
      </div>
    );
  }

  // Menu mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Score a Game</h1>
        <p className="text-gray-400">
          Quick scoring for practice games and casual play
        </p>
      </div>

      {/* Quick Start Form */}
      <QuickStartForm onStart={handleStartGame} loading={loading} />

      {/* Recent Games */}
      {loadingRecent ? (
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="animate-pulse text-gray-400 text-center">
            Loading recent games...
          </div>
        </div>
      ) : (
        <RecentGamesList
          games={recentGames}
          onSelectGame={handleResumeGame}
          onDeleteGame={handleDeleteGame}
        />
      )}
    </div>
  );
};

export default StandaloneScoring;
