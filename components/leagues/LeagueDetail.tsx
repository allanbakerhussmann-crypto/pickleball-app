/**
 * LeagueDetail Component
 * 
 * Shows league details, standings, matches, and allows joining/playing
 * 
 * FILE LOCATION: components/leagues/LeagueDetail.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLeague,
  subscribeToLeagueMembers,
  subscribeToLeagueMatches,
  joinLeague,
  leaveLeague,
  getLeagueMemberByUserId,
  createChallenge,
  getPendingChallenges,
} from '../../services/firebase/leagues';
import type { League, LeagueMember, LeagueMatch, LeagueChallenge } from '../../types/league';

interface LeagueDetailProps {
  leagueId: string;
  onBack: () => void;
}

export const LeagueDetail: React.FC<LeagueDetailProps> = ({ leagueId, onBack }) => {
  const { currentUser, userProfile } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [myMembership, setMyMembership] = useState<LeagueMember | null>(null);
  const [pendingChallenges, setPendingChallenges] = useState<LeagueChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'standings' | 'matches' | 'info'>('standings');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getLeague(leagueId).then((data) => {
      setLeague(data);
      setLoading(false);
    });
  }, [leagueId]);

  useEffect(() => {
    const unsubscribe = subscribeToLeagueMembers(leagueId, setMembers);
    return () => unsubscribe();
  }, [leagueId]);

  useEffect(() => {
    const unsubscribe = subscribeToLeagueMatches(leagueId, setMatches);
    return () => unsubscribe();
  }, [leagueId]);

  useEffect(() => {
    if (currentUser) {
      getLeagueMemberByUserId(leagueId, currentUser.uid).then(setMyMembership);
    }
  }, [leagueId, currentUser, members]);

  useEffect(() => {
    if (currentUser && myMembership) {
      getPendingChallenges(leagueId, currentUser.uid).then(setPendingChallenges);
    }
  }, [leagueId, currentUser, myMembership]);

  const handleJoin = async () => {
    if (!currentUser || !userProfile) return;
    setJoining(true);
    try {
      await joinLeague(leagueId, currentUser.uid, userProfile.displayName || 'Player');
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

  const handleChallenge = async (defender: LeagueMember) => {
    if (!myMembership || !currentUser) return;
    if (!confirm(`Challenge ${defender.displayName} (Rank #${defender.currentRank})?`)) return;
    try {
      await createChallenge(
        leagueId, myMembership.id, currentUser.uid, myMembership.currentRank,
        defender.id, defender.userId, defender.currentRank
      );
      alert('Challenge sent!');
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const canChallenge = (defender: LeagueMember): boolean => {
    if (!myMembership || !league || league.format !== 'ladder') return false;
    if (defender.userId === currentUser?.uid) return false;
    const range = league.settings.challengeRangeUp || 3;
    const diff = myMembership.currentRank - defender.currentRank;
    return diff > 0 && diff <= range;
  };

  const getFormBadges = (form: ('W' | 'L' | 'D')[]) => form.slice(-5).map((r, i) => (
    <span key={i} className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${r === 'W' ? 'bg-green-600' : r === 'L' ? 'bg-red-600' : 'bg-gray-600'} text-white`}>{r}</span>
  ));

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  if (!league) return <div className="text-center py-12 text-gray-400">League not found</div>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">{league.name}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded border border-blue-700">{league.type}</span>
              <span>{league.format === 'ladder' ? '🪜 Ladder' : league.format === 'round_robin' ? '🔄 Round Robin' : '🎯 Swiss'}</span>
              <span>•</span>
              <span>{league.memberCount} members</span>
            </div>
          </div>
          {currentUser && (
            myMembership ? (
              <div className="text-right">
                <div className="text-sm text-gray-400">Your Rank: <span className="text-white font-bold">#{myMembership.currentRank}</span></div>
                <button onClick={handleLeave} className="text-red-400 hover:text-red-300 text-sm">Leave</button>
              </div>
            ) : (league.status === 'registration' || league.status === 'active') && (
              <button onClick={handleJoin} disabled={joining} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold">
                {joining ? 'Joining...' : 'Join League'}
              </button>
            )
          )}
        </div>
        {league.description && <p className="text-gray-400 text-sm">{league.description}</p>}
        <div className="flex gap-4 mt-4 pt-4 border-t border-gray-700 text-sm text-gray-500">
          <span>Season: {formatDate(league.seasonStart)} - {formatDate(league.seasonEnd)}</span>
          {league.location && <span>📍 {league.location}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-700">
        {(['standings', 'matches', 'info'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 text-sm font-semibold border-b-2 ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Standings */}
      {activeTab === 'standings' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/50 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-3 px-4 text-center w-16">Rank</th>
                <th className="py-3 px-4 text-left">Player</th>
                <th className="py-3 px-4 text-center">P</th>
                <th className="py-3 px-4 text-center">W</th>
                <th className="py-3 px-4 text-center">L</th>
                <th className="py-3 px-4 text-center hidden sm:table-cell">Pts</th>
                <th className="py-3 px-4 text-center hidden md:table-cell">Form</th>
                {league.format === 'ladder' && myMembership && <th className="py-3 px-4 w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {members.map(member => {
                const isMe = member.userId === currentUser?.uid;
                return (
                  <tr key={member.id} className={isMe ? 'bg-blue-900/20' : 'hover:bg-gray-700/50'}>
                    <td className="py-3 px-4 text-center font-bold text-white">#{member.currentRank}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-white">{member.displayName}</span>
                      {isMe && <span className="text-blue-400 text-xs ml-2">(You)</span>}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-300">{member.stats.played}</td>
                    <td className="py-3 px-4 text-center text-green-400">{member.stats.wins}</td>
                    <td className="py-3 px-4 text-center text-red-400">{member.stats.losses}</td>
                    <td className="py-3 px-4 text-center text-white font-bold hidden sm:table-cell">{member.stats.points}</td>
                    <td className="py-3 px-4 hidden md:table-cell"><div className="flex gap-1 justify-center">{getFormBadges(member.stats.recentForm)}</div></td>
                    {league.format === 'ladder' && myMembership && (
                      <td className="py-3 px-4 text-center">
                        {canChallenge(member) && (
                          <button onClick={() => handleChallenge(member)} className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1 rounded font-semibold">
                            Challenge
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {members.length === 0 && <div className="text-center py-12 text-gray-400">No members yet</div>}
        </div>
      )}

      {/* Matches */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          {matches.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center text-gray-400">No matches yet</div>
          ) : matches.map(match => (
            <div key={match.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div className={`flex-1 font-semibold ${match.winnerMemberId === match.memberAId ? 'text-green-400' : 'text-white'}`}>{match.memberAName}</div>
                <div className="px-4 text-lg font-bold text-white">
                  {match.status === 'completed' ? `${match.scores.filter(g => g.scoreA > g.scoreB).length} - ${match.scores.filter(g => g.scoreB > g.scoreA).length}` : <span className="text-xs text-gray-400">{match.status}</span>}
                </div>
                <div className={`flex-1 text-right font-semibold ${match.winnerMemberId === match.memberBId ? 'text-green-400' : 'text-white'}`}>{match.memberBName}</div>
              </div>
              {match.playedAt && <div className="text-xs text-gray-500 text-center mt-2">{formatDate(match.playedAt)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      {activeTab === 'info' && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-3">Match Rules</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Format:</span> <span className="text-white">Best of {league.settings.gamesPerMatch}</span></div>
              <div><span className="text-gray-500">Points/Game:</span> <span className="text-white">{league.settings.pointsPerGame}</span></div>
              <div><span className="text-gray-500">Win By:</span> <span className="text-white">{league.settings.winBy}</span></div>
              <div><span className="text-gray-500">Win Points:</span> <span className="text-white">{league.settings.pointsForWin}</span></div>
            </div>
          </div>
          {league.format === 'ladder' && (
            <div>
              <h3 className="text-lg font-bold text-white mb-3">Ladder Rules</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Challenge up to {league.settings.challengeRangeUp || 3} positions above</li>
                <li>• Winner takes higher position if challenger wins</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeagueDetail;