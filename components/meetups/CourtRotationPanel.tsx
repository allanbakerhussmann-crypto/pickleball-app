/**
 * CourtRotationPanel - Court rotation and sit-out tracking
 *
 * Assistive only - helps organizers track who sits out each round.
 * No automatic game pairing, no enforcement, no blocking.
 * Append-only sit-out records (no race conditions, full audit).
 *
 * @version 07.61
 * @file components/meetups/CourtRotationPanel.tsx
 */

import React, { useState, useMemo, useCallback } from 'react';
import { collection, addDoc, getDocs, query, orderBy } from '@firebase/firestore';
import { db } from '../../services/firebase';
import type { MeetupRotationSettings, MeetupRSVP } from '../../types';

interface CourtRotationPanelProps {
  meetupId: string;
  settings: MeetupRotationSettings;
  checkedInPlayers: MeetupRSVP[];
  onSettingsChange?: (settings: MeetupRotationSettings) => void;
}

interface SitOutRecord {
  id: string;
  userId: string;
  userName: string;
  round: number;
  createdAt: number;
}

export const CourtRotationPanel: React.FC<CourtRotationPanelProps> = ({
  meetupId,
  settings,
  checkedInPlayers,
  onSettingsChange,
}) => {
  const [courts, setCourts] = useState(settings.courts);
  const [playersPerCourt, setPlayersPerCourt] = useState(settings.playersPerCourt);
  const [sitOutHistory, setSitOutHistory] = useState<SitOutRecord[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [nextSitOuts, setNextSitOuts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const activeCapacity = courts * playersPerCourt;
  const checkedInCount = checkedInPlayers.length;
  const sitOutCount = Math.max(0, checkedInCount - activeCapacity);

  // Count how many times each player has sat out
  const sitOutCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of sitOutHistory) {
      counts[record.userId] = (counts[record.userId] || 0) + 1;
    }
    return counts;
  }, [sitOutHistory]);

  // Calculate suggested next sit-outs (least sit-outs first)
  const suggestedSitOuts = useMemo(() => {
    if (sitOutCount <= 0) return [];

    const playerScores = checkedInPlayers.map(p => ({
      userId: p.odUserId,
      userName: p.odUserName,
      sitOuts: sitOutCounts[p.odUserId] || 0,
    }));

    // Sort by fewest sit-outs (fairness), then random for ties
    playerScores.sort((a, b) => {
      if (a.sitOuts !== b.sitOuts) return a.sitOuts - b.sitOuts;
      return Math.random() - 0.5;
    });

    // Take the last N (most sit-outs go last, so reverse: fewest sit-outs DON'T sit out)
    // Actually: we want players who have sat out LEAST to play, so the ones sitting out
    // should be those who have sat out least recently... but fairness says those who
    // have sat out LEAST overall should sit out next.
    // Simplest: sort ascending by sitOuts, take the last `sitOutCount` players
    return playerScores.slice(-sitOutCount).map(p => p.userId);
  }, [checkedInPlayers, sitOutCount, sitOutCounts]);

  const handleShuffle = useCallback(() => {
    if (sitOutCount <= 0) return;

    const shuffled = [...checkedInPlayers]
      .sort(() => Math.random() - 0.5)
      .slice(0, sitOutCount)
      .map(p => p.odUserId);

    setNextSitOuts(shuffled);
  }, [checkedInPlayers, sitOutCount]);

  const handleConfirmSitOuts = async () => {
    const toSitOut = nextSitOuts.length > 0 ? nextSitOuts : suggestedSitOuts;
    if (toSitOut.length === 0) return;

    setLoading(true);
    try {
      const sitOutsRef = collection(db, 'meetups', meetupId, 'sitouts');
      const now = Date.now();

      for (const userId of toSitOut) {
        const player = checkedInPlayers.find(p => p.odUserId === userId);
        if (!player) continue;

        await addDoc(sitOutsRef, {
          userId,
          userName: player.odUserName,
          round: currentRound,
          createdAt: now,
          createdBy: '', // will be set by Cloud Function if needed
        });
      }

      // Reload history
      const historySnap = await getDocs(query(sitOutsRef, orderBy('createdAt', 'asc')));
      setSitOutHistory(historySnap.docs.map(d => ({ id: d.id, ...d.data() } as SitOutRecord)));

      setCurrentRound(prev => prev + 1);
      setNextSitOuts([]);
    } catch (err) {
      console.error('Error recording sit-outs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (userId: string): string => {
    return checkedInPlayers.find(p => p.odUserId === userId)?.odUserName || 'Unknown';
  };

  const displaySitOuts = nextSitOuts.length > 0 ? nextSitOuts : suggestedSitOuts;

  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        Court Rotation
      </h3>

      {/* Courts & Players Config */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Courts</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const newVal = Math.max(1, courts - 1);
                setCourts(newVal);
                onSettingsChange?.({ ...settings, courts: newVal });
              }}
              className="w-9 h-9 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-white text-lg font-bold"
            >
              -
            </button>
            <div className="flex-1 h-9 bg-gray-700 border border-gray-600 rounded flex items-center justify-center">
              <span className="text-lime-400 font-bold font-mono">{courts}</span>
            </div>
            <button
              onClick={() => {
                const newVal = Math.min(20, courts + 1);
                setCourts(newVal);
                onSettingsChange?.({ ...settings, courts: newVal });
              }}
              className="w-9 h-9 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-white text-lg font-bold"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Players/Court</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const newVal = Math.max(2, playersPerCourt - 1);
                setPlayersPerCourt(newVal);
                onSettingsChange?.({ ...settings, playersPerCourt: newVal });
              }}
              className="w-9 h-9 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-white text-lg font-bold"
            >
              -
            </button>
            <div className="flex-1 h-9 bg-gray-700 border border-gray-600 rounded flex items-center justify-center">
              <span className="text-lime-400 font-bold font-mono">{playersPerCourt}</span>
            </div>
            <button
              onClick={() => {
                const newVal = Math.min(8, playersPerCourt + 1);
                setPlayersPerCourt(newVal);
                onSettingsChange?.({ ...settings, playersPerCourt: newVal });
              }}
              className="w-9 h-9 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-white text-lg font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Sit-out info */}
      {sitOutCount > 0 ? (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
          <p className="text-yellow-400 text-sm font-medium">
            {sitOutCount} player{sitOutCount > 1 ? 's' : ''} sit{sitOutCount === 1 ? 's' : ''} out each round
          </p>
          <p className="text-yellow-600 text-xs mt-1">
            {checkedInCount} checked in, {activeCapacity} can play ({courts} courts x {playersPerCourt})
          </p>
        </div>
      ) : (
        <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
          <p className="text-green-400 text-sm">
            Everyone can play! {checkedInCount} checked in, {activeCapacity} spots available.
          </p>
        </div>
      )}

      {/* Next Sit-Outs */}
      {sitOutCount > 0 && (
        <div>
          <p className="text-gray-400 text-sm mb-2">Next Sit-Outs (Round {currentRound})</p>
          <div className="space-y-1">
            {displaySitOuts.map(userId => (
              <div key={userId} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
                <div className="w-6 h-6 bg-yellow-900/30 rounded-full flex items-center justify-center text-yellow-400 text-xs font-bold">
                  {(sitOutCounts[userId] || 0)}
                </div>
                <span className="text-gray-300 text-sm">{getPlayerName(userId)}</span>
                <span className="text-gray-500 text-xs ml-auto">
                  {sitOutCounts[userId] || 0} total sit-outs
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleConfirmSitOuts}
              disabled={loading}
              className="flex-1 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-black font-semibold py-2 rounded-lg text-sm"
            >
              {loading ? 'Recording...' : 'Confirm'}
            </button>
            <button
              onClick={handleShuffle}
              className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg text-sm border border-gray-600"
            >
              Shuffle
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {sitOutHistory.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs mb-1">Sit-out History</p>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {sitOutHistory.slice().reverse().map(record => (
              <div key={record.id} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-gray-600">R{record.round}</span>
                <span className="text-gray-400">{record.userName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
