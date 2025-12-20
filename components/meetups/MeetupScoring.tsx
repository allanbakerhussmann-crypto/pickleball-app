/**
 * MeetupScoring Component
 * 
 * Main scoring interface for competitive meetups.
 * Shows matches list, standings table, and allows score entry.
 * 
 * FILE LOCATION: components/meetups/MeetupScoring.tsx
 * VERSION: V05.17
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToMeetupMatches,
  createMeetupMatch,
  submitMeetupMatchScore,
  confirmMeetupMatchScore,
  disputeMeetupMatchScore,
  resolveMeetupMatchDispute,
  deleteMeetupMatch,
  generateRoundRobinMatches,
  clearMeetupMatches,
  type MeetupMatch,
  type GameScore,
} from '../../services/firebase/meetupMatches';

// ============================================
// TYPES
// ============================================

// Flexible attendee type to handle both old and new field names
interface AttendeeInfo {
  odUserId?: string;
  userId?: string;
  odUserName?: string;
  userName?: string;
  status: string;
  [key: string]: any;
}

interface MeetupScoringProps {
  meetupId: string;
  competitionType: string;
  competitionSettings: {
    pointsToWin?: number;
    winBy?: number;
    gamesPerMatch?: number;
    scoringSystem?: string;
    pointsPerWin?: number;
    pointsPerDraw?: number;
    pointsPerLoss?: number;
  };
  attendees: AttendeeInfo[];
  isOrganizer: boolean;
}

interface PlayerStanding {
  odUserId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

type ScoringTab = 'matches' | 'standings';

// ============================================
// COMPONENT
// ============================================

export const MeetupScoring: React.FC<MeetupScoringProps> = ({
  meetupId,
  competitionType,
  competitionSettings,
  attendees,
  isOrganizer,
}) => {
  const { currentUser, userProfile } = useAuth();

  // State
  const [matches, setMatches] = useState<MeetupMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ScoringTab>('matches');

  // Modals
  const [showNewMatchModal, setShowNewMatchModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MeetupMatch | null>(null);

  // New match form
  const [newPlayer1, setNewPlayer1] = useState('');
  const [newPlayer2, setNewPlayer2] = useState('');

  // Score entry form
  const [scoreGames, setScoreGames] = useState<GameScore[]>([]);

  // Dispute form
  const [disputeReason, setDisputeReason] = useState('');

  // Loading states
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Settings
  const gamesPerMatch = competitionSettings?.gamesPerMatch || 1;
  const pointsToWin = competitionSettings?.pointsToWin || 11;
  const pointsPerWin = competitionSettings?.pointsPerWin ?? 2;
  const pointsPerDraw = competitionSettings?.pointsPerDraw ?? 1;
  const pointsPerLoss = competitionSettings?.pointsPerLoss ?? 0;

  // Helper to get user ID from attendee (handles both old and new field names)
  const getAttendeeId = (attendee: AttendeeInfo): string => {
    return attendee.odUserId || attendee.userId || '';
  };

  // Helper to get user name from attendee
  const getAttendeeName = (attendee: AttendeeInfo): string => {
    return attendee.odUserName || attendee.userName || 'Player';
  };

  // Get confirmed attendees only
  const confirmedAttendees = useMemo(() => 
    attendees.filter(a => a.status === 'going'),
    [attendees]
  );

  // ============================================
  // LOAD MATCHES (Real-time)
  // ============================================

  useEffect(() => {
    if (!meetupId) return;

    const unsubscribe = subscribeToMeetupMatches(meetupId, (matchList) => {
      setMatches(matchList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [meetupId]);

  // ============================================
  // CALCULATE STANDINGS
  // ============================================

  const standings = useMemo(() => {
    const standingsMap: Record<string, PlayerStanding> = {};

    // Initialize all confirmed attendees
    confirmedAttendees.forEach((attendee) => {
      const odUserId = getAttendeeId(attendee);
      if (!odUserId) return;
      
      standingsMap[odUserId] = {
        odUserId,
        name: getAttendeeName(attendee),
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDiff: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      };
    });

    // Process completed matches
    matches
      .filter((m) => m.status === 'completed')
      .forEach((match) => {
        const p1 = standingsMap[match.player1Id];
        const p2 = standingsMap[match.player2Id];

        if (!p1 || !p2) return;

        // Count games and points
        let p1GamesWon = 0;
        let p2GamesWon = 0;
        let p1PointsFor = 0;
        let p2PointsFor = 0;

        match.games.forEach((game) => {
          if (game.player1 > game.player2) p1GamesWon++;
          else if (game.player2 > game.player1) p2GamesWon++;
          p1PointsFor += game.player1;
          p2PointsFor += game.player2;
        });

        // Update stats
        p1.played++;
        p2.played++;
        p1.gamesWon += p1GamesWon;
        p1.gamesLost += p2GamesWon;
        p2.gamesWon += p2GamesWon;
        p2.gamesLost += p1GamesWon;
        p1.pointsFor += p1PointsFor;
        p1.pointsAgainst += p2PointsFor;
        p2.pointsFor += p2PointsFor;
        p2.pointsAgainst += p1PointsFor;

        // Assign standings points
        if (match.isDraw) {
          p1.draws++;
          p2.draws++;
          p1.points += pointsPerDraw;
          p2.points += pointsPerDraw;
        } else if (match.winnerId === match.player1Id) {
          p1.wins++;
          p1.points += pointsPerWin;
          p2.losses++;
          p2.points += pointsPerLoss;
        } else if (match.winnerId === match.player2Id) {
          p2.wins++;
          p2.points += pointsPerWin;
          p1.losses++;
          p1.points += pointsPerLoss;
        }
      });

    // Calculate diffs and sort
    return Object.values(standingsMap)
      .map((s) => ({
        ...s,
        gameDiff: s.gamesWon - s.gamesLost,
        pointDiff: s.pointsFor - s.pointsAgainst,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
        return b.pointDiff - a.pointDiff;
      });
  }, [matches, confirmedAttendees, pointsPerWin, pointsPerDraw, pointsPerLoss]);

  // ============================================
  // HELPERS
  // ============================================

  const canUserSubmitScore = (match: MeetupMatch): boolean => {
    if (!currentUser) return false;
    if (isOrganizer) return true;
    if (match.status !== 'scheduled' && match.status !== 'in_progress') return false;
    return match.player1Id === currentUser.uid || match.player2Id === currentUser.uid;
  };

  const canUserConfirmScore = (match: MeetupMatch): boolean => {
    if (!currentUser) return false;
    if (match.status !== 'pending_confirmation') return false;
    if (isOrganizer) return true;
    // Must be opponent of submitter
    return (
      (match.player1Id === currentUser.uid && match.submittedBy === match.player2Id) ||
      (match.player2Id === currentUser.uid && match.submittedBy === match.player1Id)
    );
  };

  const canUserDisputeScore = (match: MeetupMatch): boolean => {
    if (!currentUser) return false;
    if (match.status !== 'pending_confirmation') return false;
    // Must be opponent of submitter
    return (
      (match.player1Id === currentUser.uid && match.submittedBy === match.player2Id) ||
      (match.player2Id === currentUser.uid && match.submittedBy === match.player1Id)
    );
  };

  const getMatchStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600 text-gray-200">Scheduled</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-600 text-blue-100">In Progress</span>;
      case 'pending_confirmation':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-600 text-yellow-100">Pending Confirm</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-600 text-green-100">Completed</span>;
      case 'disputed':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-600 text-red-100">Disputed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400">Cancelled</span>;
      default:
        return null;
    }
  };

  const formatGameScore = (games: GameScore[]): string => {
    if (!games || games.length === 0) return '-';
    return games.map((g) => `${g.player1}-${g.player2}`).join(', ');
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleCreateMatch = async () => {
    if (!newPlayer1 || !newPlayer2 || newPlayer1 === newPlayer2) {
      alert('Please select two different players');
      return;
    }

    const player1 = confirmedAttendees.find((a) => getAttendeeId(a) === newPlayer1);
    const player2 = confirmedAttendees.find((a) => getAttendeeId(a) === newPlayer2);

    if (!player1 || !player2) return;

    setSubmitting(true);
    try {
      await createMeetupMatch({
        meetupId,
        player1Id: getAttendeeId(player1),
        player1Name: getAttendeeName(player1),
        player2Id: getAttendeeId(player2),
        player2Name: getAttendeeName(player2),
      });
      setShowNewMatchModal(false);
      setNewPlayer1('');
      setNewPlayer2('');
    } catch (err: any) {
      alert('Failed to create match: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateRoundRobin = async () => {
    if (confirmedAttendees.length < 2) {
      alert('Need at least 2 players to generate matches');
      return;
    }

    const confirmMsg = matches.length > 0
      ? 'This will clear existing matches and generate new ones. Continue?'
      : `Generate round robin for ${confirmedAttendees.length} players?`;

    if (!confirm(confirmMsg)) return;

    setGenerating(true);
    try {
      if (matches.length > 0) {
        await clearMeetupMatches(meetupId);
      }
      await generateRoundRobinMatches(
        meetupId,
        confirmedAttendees.map((a) => ({ 
          odUserId: getAttendeeId(a), 
          odUserName: getAttendeeName(a) 
        }))
      );
    } catch (err: any) {
      alert('Failed to generate matches: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const openScoreModal = (match: MeetupMatch) => {
    setSelectedMatch(match);
    // Initialize score entry
    if (match.games && match.games.length > 0) {
      setScoreGames([...match.games]);
    } else {
      setScoreGames(Array(gamesPerMatch).fill({ player1: 0, player2: 0 }));
    }
    setShowScoreModal(true);
  };

  const handleSubmitScore = async () => {
    if (!selectedMatch || !currentUser || !userProfile) return;

    // Validate scores
    for (const game of scoreGames) {
      if (game.player1 < 0 || game.player2 < 0) {
        alert('Scores cannot be negative');
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitMeetupMatchScore(
        meetupId,
        selectedMatch.id,
        {
          odUserId: currentUser.uid,
          odUserName: userProfile.displayName || 'Player',
          games: scoreGames,
        },
        isOrganizer,
        gamesPerMatch
      );
      setShowScoreModal(false);
      setSelectedMatch(null);
    } catch (err: any) {
      alert('Failed to submit score: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmScore = async (match: MeetupMatch) => {
    if (!currentUser) return;

    setSubmitting(true);
    try {
      await confirmMeetupMatchScore(meetupId, match.id, currentUser.uid, isOrganizer);
    } catch (err: any) {
      alert('Failed to confirm score: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openDisputeModal = (match: MeetupMatch) => {
    setSelectedMatch(match);
    setDisputeReason('');
    setShowDisputeModal(true);
  };

  const handleDisputeScore = async () => {
    if (!selectedMatch || !currentUser) return;

    setSubmitting(true);
    try {
      await disputeMeetupMatchScore(meetupId, selectedMatch.id, currentUser.uid, disputeReason);
      setShowDisputeModal(false);
      setSelectedMatch(null);
    } catch (err: any) {
      alert('Failed to dispute score: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveDispute = async (match: MeetupMatch) => {
    if (!currentUser) return;

    // Open score modal for organizer to enter correct score
    openScoreModal(match);
  };

  const handleResolveDisputeSubmit = async () => {
    if (!selectedMatch || !currentUser) return;

    setSubmitting(true);
    try {
      await resolveMeetupMatchDispute(
        meetupId,
        selectedMatch.id,
        currentUser.uid,
        scoreGames,
        gamesPerMatch
      );
      setShowScoreModal(false);
      setSelectedMatch(null);
    } catch (err: any) {
      alert('Failed to resolve dispute: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMatch = async (match: MeetupMatch) => {
    if (!confirm('Delete this match?')) return;

    try {
      await deleteMeetupMatch(meetupId, match.id);
    } catch (err: any) {
      alert('Failed to delete match: ' + err.message);
    }
  };

  const updateGameScore = (gameIndex: number, player: 'player1' | 'player2', value: number) => {
    setScoreGames((prev) => {
      const updated = [...prev];
      updated[gameIndex] = { ...updated[gameIndex], [player]: value };
      return updated;
    });
  };

  // ============================================
  // RENDER - LOADING
  // ============================================

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 mt-2">Loading matches...</p>
      </div>
    );
  }

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('matches')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'matches'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🎾 Matches ({matches.length})
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'standings'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🏆 Standings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          {/* Action Buttons */}
          {isOrganizer && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowNewMatchModal(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium"
              >
                + Add Match
              </button>
              {competitionType === 'round_robin' && (
                <button
                  onClick={handleGenerateRoundRobin}
                  disabled={generating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium"
                >
                  {generating ? 'Generating...' : '🔄 Generate Round Robin'}
                </button>
              )}
            </div>
          )}

          {/* Matches List */}
          {matches.length === 0 ? (
            <div className="text-center py-8 bg-gray-800/50 rounded-lg">
              <p className="text-gray-400">No matches yet</p>
              {isOrganizer && (
                <p className="text-gray-500 text-sm mt-1">
                  Add matches manually or generate a round robin schedule
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className={`bg-gray-800 rounded-lg p-4 border ${
                    match.status === 'disputed'
                      ? 'border-red-500'
                      : match.status === 'pending_confirmation'
                      ? 'border-yellow-500'
                      : 'border-gray-700'
                  }`}
                >
                  {/* Match Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {match.round && (
                        <span className="text-xs text-gray-500">R{match.round}</span>
                      )}
                      {getMatchStatusBadge(match.status)}
                    </div>
                    {isOrganizer && match.status !== 'completed' && (
                      <button
                        onClick={() => handleDeleteMatch(match)}
                        className="text-gray-500 hover:text-red-400 text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Players & Score */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className={`font-medium ${match.winnerId === match.player1Id ? 'text-green-400' : 'text-white'}`}>
                        {match.player1Name}
                        {match.winnerId === match.player1Id && ' 🏆'}
                      </div>
                      <div className={`font-medium ${match.winnerId === match.player2Id ? 'text-green-400' : 'text-white'}`}>
                        {match.player2Name}
                        {match.winnerId === match.player2Id && ' 🏆'}
                      </div>
                    </div>

                    {/* Scores */}
                    <div className="text-right">
                      {match.games && match.games.length > 0 ? (
                        <div className="text-lg font-mono">
                          {match.games.map((g, i) => (
                            <span key={i} className="ml-2">
                              <span className={match.winnerId === match.player1Id ? 'text-green-400' : 'text-white'}>
                                {g.player1}
                              </span>
                              <span className="text-gray-500">-</span>
                              <span className={match.winnerId === match.player2Id ? 'text-green-400' : 'text-white'}>
                                {g.player2}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </div>
                  </div>

                  {/* Pending Confirmation Info */}
                  {match.status === 'pending_confirmation' && (
                    <p className="text-xs text-yellow-400 mt-2">
                      ⏳ Submitted by {match.submittedByName}, awaiting confirmation
                    </p>
                  )}

                  {/* Disputed Info */}
                  {match.status === 'disputed' && (
                    <p className="text-xs text-red-400 mt-2">
                      ⚠️ Score disputed{match.disputeReason && `: ${match.disputeReason}`}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {/* Enter Score */}
                    {canUserSubmitScore(match) && (
                      <button
                        onClick={() => openScoreModal(match)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                      >
                        Enter Score
                      </button>
                    )}

                    {/* Confirm Score */}
                    {canUserConfirmScore(match) && (
                      <button
                        onClick={() => handleConfirmScore(match)}
                        disabled={submitting}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
                      >
                        ✓ Confirm
                      </button>
                    )}

                    {/* Dispute Score */}
                    {canUserDisputeScore(match) && (
                      <button
                        onClick={() => openDisputeModal(match)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                      >
                        ✗ Dispute
                      </button>
                    )}

                    {/* Resolve Dispute (Organizer) */}
                    {isOrganizer && match.status === 'disputed' && (
                      <button
                        onClick={() => handleResolveDispute(match)}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'standings' && (
        <div className="overflow-x-auto">
          {standings.length === 0 ? (
            <div className="text-center py-8 bg-gray-800/50 rounded-lg">
              <p className="text-gray-400">No standings yet</p>
              <p className="text-gray-500 text-sm mt-1">Complete matches to see standings</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Player</th>
                  <th className="py-2 px-2 text-center">P</th>
                  <th className="py-2 px-2 text-center">W</th>
                  <th className="py-2 px-2 text-center">L</th>
                  <th className="py-2 px-2 text-center">GD</th>
                  <th className="py-2 px-2 text-center font-bold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((player, index) => (
                  <tr
                    key={player.odUserId}
                    className={`border-b border-gray-800 ${
                      currentUser?.uid === player.odUserId ? 'bg-green-900/20' : ''
                    }`}
                  >
                    <td className="py-2 px-2 text-gray-500">
                      {index + 1}
                      {index === 0 && standings[0].played > 0 && ' 🥇'}
                      {index === 1 && standings[1].played > 0 && ' 🥈'}
                      {index === 2 && standings[2].played > 0 && ' 🥉'}
                    </td>
                    <td className="py-2 px-2 font-medium text-white">{player.name}</td>
                    <td className="py-2 px-2 text-center text-gray-400">{player.played}</td>
                    <td className="py-2 px-2 text-center text-green-400">{player.wins}</td>
                    <td className="py-2 px-2 text-center text-red-400">{player.losses}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={player.gameDiff > 0 ? 'text-green-400' : player.gameDiff < 0 ? 'text-red-400' : 'text-gray-400'}>
                        {player.gameDiff > 0 ? '+' : ''}{player.gameDiff}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-white">{player.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Standings Legend */}
          <div className="mt-4 text-xs text-gray-500">
            <p>P = Played, W = Wins, L = Losses, GD = Game Diff, Pts = Points</p>
            <p>Win = {pointsPerWin} pts | Draw = {pointsPerDraw} pts | Loss = {pointsPerLoss} pts</p>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* NEW MATCH MODAL */}
      {/* ============================================ */}
      {showNewMatchModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Add Match</h3>
              <button onClick={() => setShowNewMatchModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Player 1</label>
                <select
                  value={newPlayer1}
                  onChange={(e) => setNewPlayer1(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg"
                >
                  <option value="">Select player...</option>
                  {confirmedAttendees.map((a) => {
                    const odUserId = getAttendeeId(a);
                    return (
                      <option key={odUserId} value={odUserId} disabled={odUserId === newPlayer2}>
                        {getAttendeeName(a)}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="text-center text-gray-500">vs</div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Player 2</label>
                <select
                  value={newPlayer2}
                  onChange={(e) => setNewPlayer2(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg"
                >
                  <option value="">Select player...</option>
                  {confirmedAttendees.map((a) => {
                    const odUserId = getAttendeeId(a);
                    return (
                      <option key={odUserId} value={odUserId} disabled={odUserId === newPlayer1}>
                        {getAttendeeName(a)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => setShowNewMatchModal(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateMatch}
                disabled={submitting || !newPlayer1 || !newPlayer2}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {submitting ? 'Creating...' : 'Create Match'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* SCORE ENTRY MODAL */}
      {/* ============================================ */}
      {showScoreModal && selectedMatch && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">
                {selectedMatch.status === 'disputed' ? 'Resolve Dispute' : 'Enter Score'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {selectedMatch.player1Name} vs {selectedMatch.player2Name}
              </p>
            </div>
            <div className="p-4 space-y-4">
              {/* Game format info */}
              <p className="text-xs text-gray-500">
                {gamesPerMatch === 1 ? 'Single game' : `Best of ${gamesPerMatch}`} to {pointsToWin} points
              </p>

              {/* Score inputs for each game */}
              {scoreGames.map((game, index) => (
                <div key={index} className="bg-gray-900 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-2">
                    {gamesPerMatch > 1 ? `Game ${index + 1}` : 'Score'}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">{selectedMatch.player1Name}</label>
                      <input
                        type="number"
                        value={game.player1}
                        onChange={(e) => updateGameScore(index, 'player1', parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-800 border border-gray-600 text-white p-2 rounded text-center text-lg font-mono"
                        min="0"
                      />
                    </div>
                    <span className="text-gray-500 text-xl">-</span>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">{selectedMatch.player2Name}</label>
                      <input
                        type="number"
                        value={game.player2}
                        onChange={(e) => updateGameScore(index, 'player2', parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-800 border border-gray-600 text-white p-2 rounded text-center text-lg font-mono"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Info about confirmation */}
              {!isOrganizer && selectedMatch.status !== 'disputed' && (
                <p className="text-xs text-yellow-400 bg-yellow-900/20 p-2 rounded">
                  ⚠️ Your opponent will need to confirm this score
                </p>
              )}
            </div>
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => { setShowScoreModal(false); setSelectedMatch(null); }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={selectedMatch.status === 'disputed' ? handleResolveDisputeSubmit : handleSubmitScore}
                disabled={submitting}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {submitting ? 'Submitting...' : selectedMatch.status === 'disputed' ? 'Resolve & Save' : 'Submit Score'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* DISPUTE MODAL */}
      {/* ============================================ */}
      {showDisputeModal && selectedMatch && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">Dispute Score</h3>
              <p className="text-sm text-gray-400 mt-1">
                {selectedMatch.player1Name} vs {selectedMatch.player2Name}
              </p>
              <p className="text-sm text-gray-400">
                Submitted score: {formatGameScore(selectedMatch.games)}
              </p>
            </div>
            <div className="p-4">
              <label className="block text-sm text-gray-400 mb-1">Reason (optional)</label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg min-h-[80px] resize-none"
                placeholder="Why is the score incorrect?"
              />
            </div>
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => { setShowDisputeModal(false); setSelectedMatch(null); }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDisputeScore}
                disabled={submitting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {submitting ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetupScoring;