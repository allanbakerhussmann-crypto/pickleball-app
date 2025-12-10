
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
  const { currentUser, isOrganizer } = useAuth();

  // Active Matches on Courts
  const matchesOnCourt = useMemo(() => {
    const active: Array<{ court: Court; match: MatchDisplay | null }> = [];
    courts
      .filter(c => c.active)
      .forEach(c => {
        // Any non-completed match assigned to this court (waiting or playing)
        const matchOnCourt = matches.find(
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

      // Player Notification
  const myNextMatch = useMemo(() => {
    if (!currentUser) return null;

    // 1) Match assigned to a court for this player, but NOT started yet
    const assignedWaiting = matches.find(m => {
      const status = m.status ?? 'scheduled';
      const isWaiting =
        status === 'scheduled' || status === 'not_started';

      return (
        isWaiting &&
        (m as any).court &&
        (
          m.team1.players.some(p => p.name === currentUser.displayName) ||
          m.team2.players.some(p => p.name === currentUser.displayName)
        )
      );
    });


    if (assignedWaiting) {
      return {
        type: 'now' as const,
        match: assignedWaiting,
        court: (assignedWaiting as any).court,
      };
    }

    // 2) Otherwise, are they in the queue (no court yet)?
    const upNext = queue.find(
      m =>
        m.team1.players.some(p => p.name === currentUser.displayName) ||
        m.team2.players.some(p => p.name === currentUser.displayName)
    );
    if (upNext) {
      return {
        type: 'next' as const,
        match: upNext,
        wait: waitTimes[upNext.id] || 0,
      };
    }

    return null;
  }, [currentUser, matches, queue, waitTimes]);



  return (
    <div className="space-y-6">
      {/* Player Alert Banner */}
      {myNextMatch && (
        <div
          className={`p-4 rounded-lg shadow-lg border-l-4 ${
            myNextMatch.type === 'now'
              ? 'bg-green-900/50 border-green-500'
              : 'bg-blue-900/50 border-blue-500'
          } animate-fade-in`}
        >
          <h3 className="font-bold text-white text-lg flex items-center gap-2">
            {myNextMatch.type === 'now' ? '🎾 YOU ARE UP!' : '⏳ COMING UP'}
          </h3>
          <p className="text-gray-200">
            {myNextMatch.type === 'now'
              ? `Go to Court ${
                  myNextMatch.court || 'Assigned Court'
                } immediately vs ${
                  myNextMatch.match.team1.players.some(
                    p => p.name === currentUser?.displayName
                  )
                    ? myNextMatch.match.team2.name
                    : myNextMatch.match.team1.name
                }`
              : `Estimated wait: ~${myNextMatch.wait} mins vs ${
                  myNextMatch.match.team1.players.some(
                    p => p.name === currentUser?.displayName
                  )
                    ? myNextMatch.match.team2.name
                    : myNextMatch.match.team1.name
                }`}
          </p>

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
              {matchesOnCourt.map(({ court, match }) => (
                <div
                  key={court.id}
                  className={`p-3 rounded border ${
                    match
                      ? 'bg-green-900/20 border-green-900'
                      : 'bg-gray-900 border-gray-800'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">{court.name}</span>
                    {match && (
                      <span className="text-xs bg-green-900 text-green-300 px-1.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  {match ? (
                    <div className="text-sm">
                      <div className="flex justify-between font-medium text-gray-200">
                        <span>{match.team1.name}</span>
                        <span className="text-gray-500">vs</span>
                        <span>{match.team2.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {match.status === 'in_progress'
                          ? 'Playing'
                          : match.status === 'not_started' || match.status === 'scheduled'
                          ? 'Waiting to start'
                          : match.status === 'pending_confirmation'
                          ? 'Awaiting score confirmation'
                          : match.status === 'disputed'
                          ? 'Score disputed'
                          : 'Finishing...'}
                      </div>

                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic">Open</div>
                  )}
                </div>
              ))}
            </div>

            {/* Queue */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase">
                Up Next
              </h3>
              {queue.length === 0 ? (
                <div className="text-gray-500 text-sm italic">
                  Queue is empty
                </div>
              ) : (
                queue.slice(0, 5).map(m => (
                  <div
                    key={m.id}
                    className="p-3 rounded bg-gray-900 border border-gray-700 flex justify-between items-center"
                  >
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">
                        {m.team1.name} vs {m.team2.name}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">
                        {m.roundNumber ? `Round ${m.roundNumber}` : 'Pool'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-white">
                        ~{waitTimes[m.id]}m
                      </div>
                      <div className="text-[10px] text-gray-500">Wait</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Match List */}
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-green-400">Match List</h2>
        {matches.length === 0 ? (
          <div className="text-center text-gray-400 italic py-10">
            <p>Generate a schedule after adding teams.</p>
          </div>
        ) : (
                    <div className="space-y-3">
            {matches.map((match, index) => {
              // Is the logged-in user a player in this match?
              const isPlayerInThisMatch =
                !!currentUser &&
                (
                  match.team1.players.some(p => p.name === currentUser.displayName) ||
                  match.team2.players.some(p => p.name === currentUser.displayName)
                );
              
              // Allow editing if user is a participant OR an organizer
              const canEdit = isOrganizer || isPlayerInThisMatch;

              return (
                <MatchCard
                  key={match.id}
                  match={match}
                  matchNumber={index + 1}
                  onUpdateScore={onUpdateScore}
                  isVerified={isVerified}
                  isWaitingOnYou={(match as any).isWaitingOnYou}
                  canCurrentUserConfirm={(match as any).canCurrentUserConfirm}
                  canCurrentUserEdit={canEdit}
                />
              );
            })}
          </div>

        )}
      </div>
    </div>
  );
};
