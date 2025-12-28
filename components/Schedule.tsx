
import React, { useMemo } from 'react';
import { MatchCard, MatchDisplay } from './MatchCard';
import type { Court } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ScheduleProps {
  matches: MatchDisplay[];
  courts?: Court[];
  queue?: MatchDisplay[];
  waitTimes?: { [matchId: string]: number };
  onUpdateScore: (
    matchId: string,
    score1: number,
    score2: number,
    action: 'submit' | 'confirm' | 'dispute',
    reason?: string
  ) => void;
  isVerified: boolean;
}

export const Schedule: React.FC<ScheduleProps> = ({
  matches,
  courts = [],
  queue = [],
  waitTimes = {},
  onUpdateScore,
  isVerified,
}) => {
  const { currentUser } = useAuth();

  // Active Matches on Courts
  const matchesOnCourt = useMemo(() => {
    const active: Array<{ court: Court; match: MatchDisplay | null }> = [];
    (courts || [])
      .filter(c => c.active)
      .forEach(c => {
        // Any non-completed match assigned to this court (waiting or playing)
        const matchOnCourt = (matches || []).find(
          m =>
            m.status !== 'completed' &&
            (m as any).court === c.name
        );


        if (matchOnCourt) {
          active.push({ court: c, match: matchOnCourt });
        } else {
          active.push({ court: c, match: null });
        }
      });
    return active;
  }, [courts, matches]);

  // Court statistics for wait time estimation
  const courtStats = useMemo(() => {
    const activeCourts = (courts || []).filter(c => c.active);
    const inProgress = (matchesOnCourt || []).filter(({ match }) => match?.status === 'in_progress').length;
    const freeCourts = activeCourts.length - inProgress;
    return { total: activeCourts.length, inProgress, free: freeCourts };
  }, [courts, matchesOnCourt]);

  // Player Notification with enhanced queue position
  const myNextMatch = useMemo(() => {
    if (!currentUser) return null;

    // Check if user is in an active match on court
    const activeOnCourt = (matches || []).find(m => {
      const status = m.status ?? 'scheduled';
      return (
        status === 'in_progress' &&
        (m as any).court &&
        (
          (m.team1?.players || []).some(p => p.name === currentUser.displayName) ||
          (m.team2?.players || []).some(p => p.name === currentUser.displayName)
        )
      );
    });

    if (activeOnCourt) {
      return {
        type: 'playing' as const,
        match: activeOnCourt,
        court: (activeOnCourt as any).court,
        queuePosition: 0,
        matchesAhead: 0,
      };
    }

    // 1) Match assigned to a court for this player, but NOT started yet
    const assignedWaiting = (matches || []).find(m => {
      const status = m.status ?? 'scheduled';
      const isWaiting =
        status === 'scheduled' || status === 'not_started';

      return (
        isWaiting &&
        (m as any).court &&
        (
          (m.team1?.players || []).some(p => p.name === currentUser.displayName) ||
          (m.team2?.players || []).some(p => p.name === currentUser.displayName)
        )
      );
    });


    if (assignedWaiting) {
      return {
        type: 'now' as const,
        match: assignedWaiting,
        court: (assignedWaiting as any).court,
        queuePosition: 0,
        matchesAhead: 0,
      };
    }

    // 2) Otherwise, are they in the queue (no court yet)?
    const queueIndex = queue.findIndex(
      m =>
        (m.team1?.players || []).some(p => p.name === currentUser.displayName) ||
        (m.team2?.players || []).some(p => p.name === currentUser.displayName)
    );

    if (queueIndex >= 0) {
      const upNext = queue[queueIndex];
      const matchesAhead = queueIndex;
      const avgMatchDuration = 8; // minutes
      const estimatedWait = courtStats.total > 0
        ? Math.ceil(matchesAhead / courtStats.total) * avgMatchDuration
        : waitTimes[upNext.id] || 0;

      return {
        type: matchesAhead <= 2 ? 'almost' as const : 'queued' as const,
        match: upNext,
        wait: estimatedWait,
        queuePosition: queueIndex + 1,
        matchesAhead,
      };
    }

    return null;
  }, [currentUser, matches, queue, waitTimes, courtStats]);

  // Check if a match in queue is the current user's match
  const isUserMatch = (match: MatchDisplay) => {
    if (!currentUser) return false;
    return (
      (match.team1?.players || []).some(p => p.name === currentUser.displayName) ||
      (match.team2?.players || []).some(p => p.name === currentUser.displayName)
    );
  };



  return (
    <div className="space-y-6">
      {/* Enhanced Player Alert Banner */}
      {myNextMatch && (
        <div
          className={`relative overflow-hidden rounded-xl shadow-lg border ${
            myNextMatch.type === 'playing'
              ? 'bg-gradient-to-r from-green-900/80 to-green-800/60 border-green-500/50'
              : myNextMatch.type === 'now'
                ? 'bg-gradient-to-r from-amber-900/80 to-amber-800/60 border-amber-500/50'
                : myNextMatch.type === 'almost'
                  ? 'bg-gradient-to-r from-blue-900/80 to-blue-800/60 border-blue-500/50'
                  : 'bg-gradient-to-r from-gray-800 to-gray-700/80 border-indigo-500/30'
          }`}
        >
          {/* Animated background effect */}
          {(myNextMatch.type === 'playing' || myNextMatch.type === 'now') && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
          )}

          <div className="relative p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  myNextMatch.type === 'playing'
                    ? 'bg-green-500/20'
                    : myNextMatch.type === 'now'
                      ? 'bg-amber-500/20'
                      : myNextMatch.type === 'almost'
                        ? 'bg-blue-500/20'
                        : 'bg-indigo-500/20'
                }`}>
                  {myNextMatch.type === 'playing' ? (
                    <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : myNextMatch.type === 'now' ? (
                    <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">
                    {myNextMatch.type === 'playing'
                      ? 'NOW PLAYING'
                      : myNextMatch.type === 'now'
                        ? 'YOU ARE UP!'
                        : myNextMatch.type === 'almost'
                          ? 'ALMOST UP!'
                          : 'YOUR NEXT MATCH'}
                  </h3>
                  <p className="text-sm text-gray-300">
                    {myNextMatch.type === 'playing'
                      ? `Court ${myNextMatch.court}`
                      : myNextMatch.type === 'now'
                        ? `Go to Court ${myNextMatch.court}`
                        : `Position #${myNextMatch.queuePosition} in queue`}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {myNextMatch.type === 'playing' && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs font-semibold text-green-400 uppercase">Live</span>
                </span>
              )}
              {myNextMatch.type === 'now' && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 animate-pulse">
                  <span className="text-xs font-semibold text-amber-400 uppercase">Report Now</span>
                </span>
              )}
            </div>

            {/* Match Info */}
            <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="text-center flex-1">
                  <div className="text-white font-bold text-lg">
                    {(myNextMatch.match.team1?.players || []).some(p => p.name === currentUser?.displayName)
                      ? 'You'
                      : myNextMatch.match.team1?.name || 'TBD'}
                  </div>
                  {(myNextMatch.match.team1?.players || []).some(p => p.name === currentUser?.displayName) && (
                    <div className="text-xs text-gray-400">{myNextMatch.match.team1?.name || 'TBD'}</div>
                  )}
                </div>
                <div className="px-6 text-gray-500 text-sm font-medium">vs</div>
                <div className="text-center flex-1">
                  <div className="text-white font-bold text-lg">
                    {(myNextMatch.match.team2?.players || []).some(p => p.name === currentUser?.displayName)
                      ? 'You'
                      : myNextMatch.match.team2?.name || 'TBD'}
                  </div>
                  {(myNextMatch.match.team2?.players || []).some(p => p.name === currentUser?.displayName) && (
                    <div className="text-xs text-gray-400">{myNextMatch.match.team2?.name || 'TBD'}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Wait Time Info (for queued matches) */}
            {(myNextMatch.type === 'almost' || myNextMatch.type === 'queued') && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ~{myNextMatch.wait} min wait
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {myNextMatch.matchesAhead} match{myNextMatch.matchesAhead !== 1 ? 'es' : ''} ahead
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                    </svg>
                    {courtStats.total} court{courtStats.total !== 1 ? 's' : ''}
                  </div>
                </div>
                <p className="text-xs text-gray-500">Stay nearby!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Courts Panel */}
      {courts.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live Courts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active Courts */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase">
                On Court Now
              </h3>
              {(matchesOnCourt || []).map(({ court, match }) => (
                <div
                  key={court.id}
                  className={`p-3 rounded-lg border shadow-sm transition-all relative overflow-hidden ${
                    match
                      ? 'bg-gradient-to-br from-gray-900 to-gray-800 border-green-500/40'
                      : 'bg-gray-900 border-gray-800'
                  }`}
                >
                  {match && <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>}
                  
                  <div className="flex justify-between items-center mb-2 pl-2">
                    <span className="font-bold text-white text-lg">{court.name}</span>
                    {match && (
                      <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wide animate-pulse">
                        Live
                      </span>
                    )}
                  </div>
                  {match ? (
                    <div className="pl-2">
                      <div className="flex justify-between items-center bg-gray-800/50 p-2 rounded border border-gray-700/50">
                        <span className="font-bold text-white text-sm truncate w-1/3">{match.team1.name}</span>
                        <span className="text-gray-500 text-xs px-2">vs</span>
                        <span className="font-bold text-white text-sm truncate w-1/3 text-right">{match.team2.name}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-2 text-center">
                        {match.status === 'in_progress'
                          ? 'Playing Now'
                          : match.status === 'not_started' || match.status === 'scheduled'
                          ? 'Waiting to start'
                          : match.status === 'pending_confirmation'
                          ? <span className="text-yellow-400 font-bold">Verifying Score...</span>
                          : match.status === 'disputed'
                          ? <span className="text-red-400 font-bold">Disputed</span>
                          : 'Finishing...'}
                      </div>

                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic pl-2">Court is open</div>
                  )}
                </div>
              ))}
            </div>

            {/* Queue */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase">
                Up Next
              </h3>
              {(queue || []).length === 0 ? (
                <div className="text-gray-500 text-sm italic bg-gray-900/50 p-4 rounded border border-dashed border-gray-700 text-center">
                  Queue is empty
                </div>
              ) : (
                (queue || []).slice(0, 5).map((m, idx) => {
                  const isMyMatch = isUserMatch(m);
                  return (
                    <div
                      key={m.id}
                      className={`p-3 rounded border flex justify-between items-center relative overflow-hidden transition-all ${
                        isMyMatch
                          ? 'bg-indigo-900/30 border-indigo-500/50 ring-1 ring-indigo-500/30'
                          : 'bg-gray-900 border-gray-700'
                      }`}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        isMyMatch ? 'bg-indigo-500' : 'bg-gray-700'
                      }`}></div>
                      <div className="pl-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          {isMyMatch && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500 text-white uppercase">
                              You
                            </span>
                          )}
                          <span className="text-xs text-gray-400">#{idx + 1}</span>
                        </div>
                        <div className={`text-xs mb-0.5 font-medium ${
                          isMyMatch ? 'text-white' : 'text-gray-400'
                        }`}>
                          {m.team1.name} <span className="text-gray-600">vs</span> {m.team2.name}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase bg-gray-800 inline-block px-1.5 rounded">
                          {m.roundNumber ? `Round ${m.roundNumber}` : 'Pool'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-bold px-2 py-1 rounded border ${
                          isMyMatch
                            ? 'bg-indigo-900/50 text-indigo-300 border-indigo-500/30'
                            : 'bg-gray-800 text-white border-gray-700'
                        }`}>
                          ~{waitTimes[m.id] || Math.ceil((idx) / (courtStats.total || 1)) * 8}m
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Match List */}
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-green-400">Match List</h2>
        {(matches || []).length === 0 ? (
          <div className="text-center text-gray-400 italic py-10">
            <p>Generate a schedule after adding teams.</p>
          </div>
        ) : (
                    <div className="space-y-3">
            {(matches || []).map((match, index) => {
              // Is the logged-in user a player in this match?
              const isPlayerInThisMatch =
                !!currentUser &&
                (
                  (match.team1?.players || []).some(p => p.name === currentUser.displayName) ||
                  (match.team2?.players || []).some(p => p.name === currentUser.displayName)
                );

              return (
                <MatchCard
                  key={match.id}
                  match={match}
                  matchNumber={index + 1}
                  onUpdateScore={onUpdateScore}
                  isVerified={isVerified}
                  isWaitingOnYou={(match as any).isWaitingOnYou}
                  canCurrentUserConfirm={(match as any).canCurrentUserConfirm}
                  canCurrentUserEdit={isPlayerInThisMatch}
                />
              );
            })}
          </div>

        )}
      </div>
    </div>
  );
};
