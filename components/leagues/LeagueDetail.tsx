/**
 * LeagueDetail Component
 * 
 * Shows league details, standings, matches, and allows joining/playing.
 * Updated for V05.17 with divisions, partner support, improved UI.
 * 
 * FILE LOCATION: components/leagues/LeagueDetail.tsx
 * VERSION: V05.17
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLeague,
  getLeagueDivisions,
  subscribeToLeagueMembers,
  subscribeToLeagueMatches,
  joinLeague,
  leaveLeague,
  getLeagueMemberByUserId,
  createChallenge,
  getPendingChallenges,
  respondToChallenge,
  subscribeToUserChallenges,
} from '../../services/firebase';
import type { 
  League, 
  LeagueMember, 
  LeagueMatch, 
  LeagueChallenge,
  LeagueDivision,
} from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueDetailProps {
  leagueId: string;
  onBack: () => void;
}

type TabType = 'standings' | 'matches' | 'challenges' | 'info';

// ============================================
// COMPONENT
// ============================================

export const LeagueDetail: React.FC<LeagueDetailProps> = ({ leagueId, onBack }) => {
  const { currentUser, userProfile } = useAuth();
  
  // Data state
  const [league, setLeague] = useState<League | null>(null);
  const [divisions, setDivisions] = useState<LeagueDivision[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [myMembership, setMyMembership] = useState<LeagueMember | null>(null);
  const [pendingChallenges, setPendingChallenges] = useState<LeagueChallenge[]>([]);
  const [myChallenges, setMyChallenges] = useState<LeagueChallenge[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [challengingMemberId, setChallengingMemberId] = useState<string | null>(null);

  // ============================================
  // DATA LOADING
  // ============================================

  // Load league
  useEffect(() => {
    getLeague(leagueId).then((data) => {
      setLeague(data);
      setLoading(false);
    });
  }, [leagueId]);

  // Load divisions
  useEffect(() => {
    if (league?.hasDivisions) {
      getLeagueDivisions(leagueId).then(setDivisions);
    }
  }, [leagueId, league?.hasDivisions]);

  // Subscribe to members
  useEffect(() => {
    const unsubscribe = subscribeToLeagueMembers(leagueId, setMembers);
    return () => unsubscribe();
  }, [leagueId]);

  // Subscribe to matches
  useEffect(() => {
    const unsubscribe = subscribeToLeagueMatches(leagueId, setMatches);
    return () => unsubscribe();
  }, [leagueId]);

  // Get my membership
  useEffect(() => {
    if (currentUser) {
      getLeagueMemberByUserId(leagueId, currentUser.uid).then(setMyMembership);
    }
  }, [leagueId, currentUser, members]);

  // Subscribe to my challenges (for ladder)
  useEffect(() => {
    if (currentUser && myMembership && league?.format === 'ladder') {
      const unsubscribe = subscribeToUserChallenges(leagueId, currentUser.uid, setMyChallenges);
      return () => unsubscribe();
    }
  }, [leagueId, currentUser, myMembership, league?.format]);

  // Get pending challenges
  useEffect(() => {
    if (currentUser && myMembership) {
      getPendingChallenges(leagueId, currentUser.uid).then(setPendingChallenges);
    }
  }, [leagueId, currentUser, myMembership]);

  // ============================================
  // HELPERS
  // ============================================

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-600 text-gray-200',
      registration: 'bg-blue-600 text-blue-100',
      active: 'bg-green-600 text-green-100',
      playoffs: 'bg-yellow-600 text-yellow-100',
      completed: 'bg-purple-600 text-purple-100',
      cancelled: 'bg-red-600 text-red-100',
    };
    const labels: Record<string, string> = {
      draft: 'Draft',
      registration: 'Registration Open',
      active: 'In Progress',
      playoffs: 'Playoffs',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${styles[status] || 'bg-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getFormatLabel = (format: string) => {
    const labels: Record<string, string> = {
      ladder: '🪜 Ladder',
      round_robin: '🔄 Round Robin',
      swiss: '🎯 Swiss',
      box_league: '📦 Box League',
    };
    return labels[format] || format;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      singles: 'Singles',
      doubles: 'Doubles',
      mixed_doubles: 'Mixed Doubles',
      team: 'Team',
    };
    return labels[type] || type;
  };

  const getFormBadges = (form: string[]) => {
    if (!form || form.length === 0) return <span className="text-gray-600">-</span>;
    return form.slice(-5).map((result, i) => (
      <span
        key={i}
        className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
          result === 'W' ? 'bg-green-600 text-white' :
          result === 'L' ? 'bg-red-600 text-white' :
          'bg-gray-600 text-gray-300'
        }`}
      >
        {result}
      </span>
    ));
  };

  // Filter members by division
  const filteredMembers = selectedDivisionId
    ? members.filter(m => m.divisionId === selectedDivisionId)
    : members;

  // Filter matches by division
  const filteredMatches = selectedDivisionId
    ? matches.filter(m => m.divisionId === selectedDivisionId)
    : matches;

  // ============================================
  // ACTIONS
  // ============================================

  const handleJoin = async () => {
    if (!currentUser || !userProfile) return;
    setJoining(true);
    try {
      // TODO: For doubles/mixed, show partner selection modal
      await joinLeague(
        leagueId, 
        currentUser.uid, 
        userProfile.displayName || 'Player',
        selectedDivisionId
      );
      const membership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
      setMyMembership(membership);
    } catch (e: any) {
      alert('Failed to join: ' + e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!myMembership) return;
    if (!confirm('Are you sure you want to leave this league?')) return;
    try {
      await leaveLeague(leagueId, myMembership.id);
      setMyMembership(null);
    } catch (e: any) {
      alert('Failed to leave: ' + e.message);
    }
  };

  const canChallenge = (member: LeagueMember): boolean => {
    if (!myMembership || !league) return false;
    if (member.userId === currentUser?.uid) return false;
    if (league.format !== 'ladder') return false;
    
    const challengeRange = league.settings?.challengeRules?.challengeRange || 3;
    const rankDiff = myMembership.currentRank - member.currentRank;
    
    // Can only challenge players ranked above you (lower number)
    if (rankDiff <= 0) return false;
    if (rankDiff > challengeRange) return false;
    
    // Check if already has pending challenge with this member
    const hasExisting = myChallenges.some(
      c => (c.challengedId === member.id || c.challengerId === member.id) &&
           (c.status === 'pending' || c.status === 'accepted')
    );
    if (hasExisting) return false;
    
    return true;
  };

  const handleChallenge = async (member: LeagueMember) => {
    if (!currentUser || !myMembership) return;
    setChallengingMemberId(member.id);
    try {
      await createChallenge(leagueId, {
        challengerId: myMembership.id,
        challengerUserId: currentUser.uid,
        challengerName: myMembership.displayName,
        challengerRank: myMembership.currentRank,
        challengedId: member.id,
        challengedUserId: member.userId,
        challengedName: member.displayName,
        challengedRank: member.currentRank,
        status: 'pending',
        divisionId: member.divisionId || null,
        responseDeadline: Date.now() + (48 * 60 * 60 * 1000), // 48 hours
      });
      // Refresh challenges
      const updated = await getPendingChallenges(leagueId, currentUser.uid);
      setPendingChallenges(updated);
    } catch (e: any) {
      alert('Failed to send challenge: ' + e.message);
    } finally {
      setChallengingMemberId(null);
    }
  };

  const handleRespondToChallenge = async (challengeId: string, response: 'accepted' | 'declined') => {
    try {
      await respondToChallenge(leagueId, challengeId, response);
      // Refresh challenges
      if (currentUser) {
        const updated = await getPendingChallenges(leagueId, currentUser.uid);
        setPendingChallenges(updated);
      }
    } catch (e: any) {
      alert('Failed to respond: ' + e.message);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Loading league...</div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-white mb-2">League not found</h2>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">
          ← Back to leagues
        </button>
      </div>
    );
  }

  const isDoublesOrMixed = league.type === 'doubles' || league.type === 'mixed_doubles';
  const canJoin = !myMembership && (league.status === 'registration' || league.status === 'active');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Leagues
      </button>

      {/* Header Card */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{league.name}</h1>
              {getStatusBadge(league.status)}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="bg-gray-700 px-2 py-0.5 rounded">{getTypeLabel(league.type)}</span>
              <span>{getFormatLabel(league.format)}</span>
              <span>•</span>
              <span>{league.memberCount || members.length} {isDoublesOrMixed ? 'teams' : 'players'}</span>
            </div>
          </div>
          
          {/* Join/Leave/Manage */}
          {currentUser && (
            myMembership ? (
              <div className="text-right">
                <div className="text-sm text-gray-400 mb-1">
                  Your Rank: <span className="text-white font-bold text-lg">#{myMembership.currentRank}</span>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {myMembership.stats.wins}W - {myMembership.stats.losses}L
                </div>
                <button
                  onClick={handleLeave}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Leave League
                </button>
              </div>
            ) : canJoin && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {joining ? 'Joining...' : isDoublesOrMixed ? 'Register Team' : 'Join League'}
              </button>
            )
          )}
        </div>

        {league.description && (
          <p className="text-gray-400 text-sm mb-4">{league.description}</p>
        )}

        <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-700 text-sm text-gray-500">
          <span>📅 {formatDate(league.seasonStart)} - {formatDate(league.seasonEnd)}</span>
          {league.location && <span>📍 {league.location}</span>}
          {league.clubName && <span>🏢 {league.clubName}</span>}
          {league.pricing?.enabled && (
            <span className="text-green-400">
              💰 ${(league.pricing.entryFee / 100).toFixed(2)} entry
            </span>
          )}
        </div>
      </div>

      {/* Pending Challenges Alert */}
      {pendingChallenges.length > 0 && pendingChallenges.some(c => c.challengedUserId === currentUser?.uid && c.status === 'pending') && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-yellow-400 mb-3">⚔️ You've Been Challenged!</h3>
          {pendingChallenges
            .filter(c => c.challengedUserId === currentUser?.uid && c.status === 'pending')
            .map(challenge => (
              <div key={challenge.id} className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg mb-2">
                <div>
                  <span className="font-semibold text-white">{challenge.challengerName}</span>
                  <span className="text-gray-400 text-sm ml-2">(Rank #{challenge.challengerRank})</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespondToChallenge(challenge.id, 'accepted')}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded font-semibold text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondToChallenge(challenge.id, 'declined')}
                    className="bg-red-600 hover:bg-red-500 text-white px-4 py-1 rounded font-semibold text-sm"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Division Selector (if applicable) */}
      {league.hasDivisions && divisions.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedDivisionId(null)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                !selectedDivisionId
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All Divisions
            </button>
            {divisions.map(div => (
              <button
                key={div.id}
                onClick={() => setSelectedDivisionId(div.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  selectedDivisionId === div.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {div.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700 overflow-x-auto">
        {(['standings', 'matches', ...(league.format === 'ladder' ? ['challenges'] : []), 'info'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'standings' && '🏆 '}
            {tab === 'matches' && '🎾 '}
            {tab === 'challenges' && '⚔️ '}
            {tab === 'info' && 'ℹ️ '}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'challenges' && myChallenges.filter(c => c.status === 'pending' || c.status === 'accepted').length > 0 && (
              <span className="ml-1 bg-yellow-500 text-black text-xs px-1.5 rounded-full">
                {myChallenges.filter(c => c.status === 'pending' || c.status === 'accepted').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* STANDINGS TAB */}
      {activeTab === 'standings' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/50 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-3 px-4 text-center w-16">Rank</th>
                <th className="py-3 px-4 text-left">{isDoublesOrMixed ? 'Team' : 'Player'}</th>
                <th className="py-3 px-4 text-center">P</th>
                <th className="py-3 px-4 text-center">W</th>
                <th className="py-3 px-4 text-center">L</th>
                <th className="py-3 px-4 text-center hidden sm:table-cell">GD</th>
                <th className="py-3 px-4 text-center hidden sm:table-cell">Pts</th>
                <th className="py-3 px-4 text-center hidden md:table-cell">Form</th>
                {league.format === 'ladder' && myMembership && <th className="py-3 px-4 w-28" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    No {isDoublesOrMixed ? 'teams' : 'players'} yet. Be the first to join!
                  </td>
                </tr>
              ) : (
                filteredMembers.map(member => {
                  const isMe = member.userId === currentUser?.uid;
                  const gameDiff = (member.stats.gamesWon || 0) - (member.stats.gamesLost || 0);
                  
                  return (
                    <tr
                      key={member.id}
                      className={`${isMe ? 'bg-blue-900/20' : 'hover:bg-gray-700/50'} transition-colors`}
                    >
                      <td className="py-3 px-4 text-center">
                        <span className={`font-bold ${
                          member.currentRank === 1 ? 'text-yellow-400' :
                          member.currentRank === 2 ? 'text-gray-300' :
                          member.currentRank === 3 ? 'text-orange-400' :
                          'text-white'
                        }`}>
                          {member.currentRank === 1 && '🥇 '}
                          {member.currentRank === 2 && '🥈 '}
                          {member.currentRank === 3 && '🥉 '}
                          #{member.currentRank}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{member.displayName}</span>
                          {member.partnerDisplayName && (
                            <span className="text-gray-400">/ {member.partnerDisplayName}</span>
                          )}
                          {isMe && <span className="text-blue-400 text-xs">(You)</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-300">{member.stats.played}</td>
                      <td className="py-3 px-4 text-center text-green-400 font-semibold">{member.stats.wins}</td>
                      <td className="py-3 px-4 text-center text-red-400">{member.stats.losses}</td>
                      <td className="py-3 px-4 text-center hidden sm:table-cell">
                        <span className={gameDiff > 0 ? 'text-green-400' : gameDiff < 0 ? 'text-red-400' : 'text-gray-400'}>
                          {gameDiff > 0 ? '+' : ''}{gameDiff}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-white font-bold hidden sm:table-cell">
                        {member.stats.points}
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <div className="flex gap-1 justify-center">
                          {getFormBadges(member.stats.recentForm || [])}
                        </div>
                      </td>
                      {league.format === 'ladder' && myMembership && (
                        <td className="py-3 px-4 text-center">
                          {canChallenge(member) && (
                            <button
                              onClick={() => handleChallenge(member)}
                              disabled={challengingMemberId === member.id}
                              className="text-xs bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white px-3 py-1 rounded font-semibold transition-colors"
                            >
                              {challengingMemberId === member.id ? '...' : '⚔️ Challenge'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MATCHES TAB */}
      {activeTab === 'matches' && (
        <div className="space-y-3">
          {filteredMatches.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center text-gray-400">
              No matches played yet
            </div>
          ) : (
            filteredMatches.map(match => {
              const isMyMatch = match.memberAId === myMembership?.id || match.memberBId === myMembership?.id;
              const gamesA = match.scores?.filter(g => g.scoreA > g.scoreB).length || 0;
              const gamesB = match.scores?.filter(g => g.scoreB > g.scoreA).length || 0;
              
              return (
                <div
                  key={match.id}
                  className={`bg-gray-800 rounded-xl p-4 border ${
                    isMyMatch ? 'border-blue-500/50' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex-1 font-semibold ${
                      match.winnerMemberId === match.memberAId ? 'text-green-400' : 'text-white'
                    }`}>
                      {match.memberAName}
                      {match.winnerMemberId === match.memberAId && ' ✓'}
                    </div>
                    
                    <div className="px-6 text-center">
                      {match.status === 'completed' ? (
                        <div className="text-xl font-bold text-white">
                          {gamesA} - {gamesB}
                        </div>
                      ) : match.status === 'pending_confirmation' ? (
                        <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                          Awaiting Confirmation
                        </span>
                      ) : match.status === 'disputed' ? (
                        <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded">
                          Disputed
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">vs</span>
                      )}
                    </div>
                    
                    <div className={`flex-1 text-right font-semibold ${
                      match.winnerMemberId === match.memberBId ? 'text-green-400' : 'text-white'
                    }`}>
                      {match.winnerMemberId === match.memberBId && '✓ '}
                      {match.memberBName}
                    </div>
                  </div>
                  
                  {/* Game scores */}
                  {match.scores && match.scores.length > 0 && (
                    <div className="flex justify-center gap-3 mt-2 text-sm">
                      {match.scores.map((score, i) => (
                        <span key={i} className="text-gray-400">
                          {score.scoreA}-{score.scoreB}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {match.playedAt && (
                    <div className="text-xs text-gray-500 text-center mt-2">
                      {formatDate(match.playedAt)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* CHALLENGES TAB (Ladder only) */}
      {activeTab === 'challenges' && league.format === 'ladder' && (
        <div className="space-y-4">
          {/* My Active Challenges */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-semibold text-white mb-3">Your Active Challenges</h3>
            {myChallenges.filter(c => c.status === 'pending' || c.status === 'accepted').length === 0 ? (
              <p className="text-gray-400 text-sm">No active challenges. Challenge someone from the standings!</p>
            ) : (
              <div className="space-y-2">
                {myChallenges
                  .filter(c => c.status === 'pending' || c.status === 'accepted')
                  .map(challenge => {
                    const isChallenger = challenge.challengerUserId === currentUser?.uid;
                    const opponent = isChallenger ? challenge.challengedName : challenge.challengerName;
                    const opponentRank = isChallenger ? challenge.challengedRank : challenge.challengerRank;
                    
                    return (
                      <div key={challenge.id} className="flex items-center justify-between bg-gray-900/50 p-3 rounded-lg">
                        <div>
                          <span className={isChallenger ? 'text-yellow-400' : 'text-blue-400'}>
                            {isChallenger ? '→ You challenged' : '← Challenged by'}
                          </span>
                          <span className="font-semibold text-white ml-2">{opponent}</span>
                          <span className="text-gray-400 text-sm ml-1">(#{opponentRank})</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          challenge.status === 'accepted' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'
                        }`}>
                          {challenge.status === 'accepted' ? 'Play Match!' : 'Pending Response'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Challenge Rules */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-semibold text-white mb-3">Challenge Rules</h3>
            <ul className="text-sm text-gray-400 space-y-2">
              <li>• You can challenge players up to <span className="text-white font-semibold">{league.settings?.challengeRules?.challengeRange || 3} positions</span> above you</li>
              <li>• Challenged player has <span className="text-white font-semibold">{league.settings?.challengeRules?.responseDeadlineHours || 48} hours</span> to respond</li>
              <li>• Match must be completed within <span className="text-white font-semibold">{league.settings?.challengeRules?.completionDeadlineDays || 7} days</span> of acceptance</li>
              <li>• If you win against a higher-ranked player, you take their position</li>
            </ul>
          </div>
        </div>
      )}

      {/* INFO TAB */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          {/* Match Rules */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Match Rules</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Format:</span>
                <span className="text-white ml-2">Best of {league.settings?.matchFormat?.bestOf || 3}</span>
              </div>
              <div>
                <span className="text-gray-500">Points/Game:</span>
                <span className="text-white ml-2">{league.settings?.matchFormat?.gamesTo || 11}</span>
              </div>
              <div>
                <span className="text-gray-500">Win By:</span>
                <span className="text-white ml-2">{league.settings?.matchFormat?.winBy || 2}</span>
              </div>
              <div>
                <span className="text-gray-500">Win Points:</span>
                <span className="text-white ml-2">{league.settings?.pointsForWin || 3}</span>
              </div>
              <div>
                <span className="text-gray-500">Draw Points:</span>
                <span className="text-white ml-2">{league.settings?.pointsForDraw || 1}</span>
              </div>
              <div>
                <span className="text-gray-500">Loss Points:</span>
                <span className="text-white ml-2">{league.settings?.pointsForLoss || 0}</span>
              </div>
            </div>
          </div>

          {/* Partner Settings (for doubles) */}
          {isDoublesOrMixed && league.settings?.partnerSettings && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">Partner Rules</h3>
              <ul className="text-sm text-gray-400 space-y-2">
                {league.settings.partnerSettings.allowSubstitutes && (
                  <li>• Substitutes allowed when partner unavailable</li>
                )}
                <li>
                  • Partners lock: {
                    league.settings.partnerSettings.partnerLockRule === 'registration_close' ? 'When registration closes' :
                    league.settings.partnerSettings.partnerLockRule === 'anytime' ? 'Can change anytime' :
                    `After week ${league.settings.partnerSettings.partnerLockWeek}`
                  }
                </li>
              </ul>
            </div>
          )}

          {/* Pricing */}
          {league.pricing?.enabled && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">Entry Fee</h3>
              <div className="text-2xl font-bold text-green-400 mb-2">
                ${(league.pricing.entryFee / 100).toFixed(2)} NZD
              </div>
              <p className="text-sm text-gray-400">
                {league.pricing.entryFeeType === 'per_team' ? 'Per team' : 'Per player'}
              </p>
              {league.pricing.earlyBirdEnabled && league.pricing.earlyBirdFee && (
                <p className="text-sm text-green-400 mt-2">
                  Early bird: ${(league.pricing.earlyBirdFee / 100).toFixed(2)}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Refund policy: {league.pricing.refundPolicy === 'full' ? 'Full refund before start' : 
                               league.pricing.refundPolicy === 'partial' ? '50% refund before start' : 'No refunds'}
              </p>
            </div>
          )}

          {/* Organizer */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Organizer</h3>
            <p className="text-white">{league.organizerName}</p>
            {league.clubName && (
              <p className="text-sm text-gray-400 mt-1">Hosted by {league.clubName}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeagueDetail;