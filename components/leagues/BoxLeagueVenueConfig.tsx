/**
 * Box League Venue Configuration Component
 *
 * Configures courts and sessions for rotating doubles box leagues.
 * Supports multiple sessions (e.g., Early/Late) and multiple courts.
 * Capacity = courts × sessions × boxSize
 *
 * FILE LOCATION: components/leagues/BoxLeagueVenueConfig.tsx
 * VERSION: V07.26
 */

import React, { useMemo } from 'react';
import type {
  BoxLeagueVenueSettings,
  BoxLeagueCourt,
  BoxLeagueSession,
} from '../../types/rotatingDoublesBox';

// ============================================
// TYPES
// ============================================

interface BoxLeagueVenueConfigProps {
  /** Current venue settings */
  value: BoxLeagueVenueSettings;
  /** Handler when settings change */
  onChange: (settings: BoxLeagueVenueSettings) => void;
  /** Box size for capacity calculation */
  boxSize: 4 | 5 | 6;
  /** Whether the form is disabled */
  disabled?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

// Generate time options from 6 AM to 10 PM in 30-minute increments
const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30; // Start at 6:00 AM
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hours12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return {
    value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    label: `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`,
  };
});

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 25, label: '25 min' },
  { value: 30, label: '30 min' },
  { value: 35, label: '35 min' },
  { value: 40, label: '40 min' },
  { value: 45, label: '45 min' },
];

const BUFFER_OPTIONS = [
  { value: 0, label: 'No buffer' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getSessionDurationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  return (endHour * 60 + endMin) - (startHour * 60 + startMin);
}

function getRoundsForBoxSize(boxSize: 4 | 5 | 6): number {
  switch (boxSize) {
    case 4: return 3;
    case 5: return 5;
    case 6: return 6;
  }
}

function formatTimeDisplay(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const hours12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// ============================================
// COMPONENT
// ============================================

export const BoxLeagueVenueConfig: React.FC<BoxLeagueVenueConfigProps> = ({
  value,
  onChange,
  boxSize,
  disabled = false,
}) => {
  // Calculate capacity
  const capacity = useMemo(() => {
    const activeCourts = value.courts.filter(c => c.active).length;
    const activeSessions = value.sessions.filter(s => s.active).length;
    const totalBoxes = activeCourts * activeSessions;
    const maxPlayers = totalBoxes * boxSize;
    const roundsPerBox = getRoundsForBoxSize(boxSize);
    const estimatedDuration = roundsPerBox * (value.matchDurationMinutes + value.bufferMinutes);

    return {
      activeCourts,
      activeSessions,
      totalBoxes,
      maxPlayers,
      roundsPerBox,
      estimatedDuration,
    };
  }, [value.courts, value.sessions, boxSize, value.matchDurationMinutes, value.bufferMinutes]);

  // ==========================================
  // COURT HANDLERS
  // ==========================================

  const addCourt = () => {
    const newCourt: BoxLeagueCourt = {
      id: generateId('court'),
      name: `Court ${value.courts.length + 1}`,
      order: value.courts.length + 1,
      active: true,
    };
    onChange({
      ...value,
      courts: [...value.courts, newCourt],
    });
  };

  const updateCourt = (courtId: string, updates: Partial<BoxLeagueCourt>) => {
    onChange({
      ...value,
      courts: value.courts.map(c =>
        c.id === courtId ? { ...c, ...updates } : c
      ),
    });
  };

  const removeCourt = (courtId: string) => {
    if (value.courts.length <= 1) return;
    onChange({
      ...value,
      courts: value.courts.filter(c => c.id !== courtId),
    });
  };

  // ==========================================
  // SESSION HANDLERS
  // ==========================================

  const addSession = () => {
    const lastSession = value.sessions[value.sessions.length - 1];
    let startTime = '19:30';
    let endTime = '21:30';

    if (lastSession) {
      // Start 30 min after last session ends
      const [endHour, endMin] = lastSession.endTime.split(':').map(Number);
      const newStartMinutes = endHour * 60 + endMin + 30;
      const newStartHour = Math.floor(newStartMinutes / 60);
      const newStartMin = newStartMinutes % 60;
      startTime = `${String(newStartHour).padStart(2, '0')}:${String(newStartMin).padStart(2, '0')}`;

      // End time 2 hours later
      const newEndMinutes = newStartMinutes + 120;
      const newEndHour = Math.floor(newEndMinutes / 60);
      const newEndMin = newEndMinutes % 60;
      endTime = `${String(Math.min(newEndHour, 22)).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`;
    }

    const newSession: BoxLeagueSession = {
      id: generateId('session'),
      name: value.sessions.length === 0 ? 'Early' : value.sessions.length === 1 ? 'Late' : `Session ${value.sessions.length + 1}`,
      startTime,
      endTime,
      order: value.sessions.length + 1,
      active: true,
    };
    onChange({
      ...value,
      sessions: [...value.sessions, newSession],
    });
  };

  const updateSession = (sessionId: string, updates: Partial<BoxLeagueSession>) => {
    onChange({
      ...value,
      sessions: value.sessions.map(s =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    });
  };

  const removeSession = (sessionId: string) => {
    if (value.sessions.length <= 1) return;
    onChange({
      ...value,
      sessions: value.sessions.filter(s => s.id !== sessionId),
    });
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="space-y-6">
      {/* ===== MATCH TIMING (First Section) ===== */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⏱️</span>
          <div>
            <h3 className="text-lg font-semibold text-white">Match Timing</h3>
            <p className="text-sm text-gray-500">How long each match takes</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Match Duration */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
              Match Duration
            </label>
            <select
              value={value.matchDurationMinutes}
              onChange={e => onChange({ ...value, matchDurationMinutes: parseInt(e.target.value) })}
              disabled={disabled}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-lime-500 appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25rem',
              }}
            >
              {DURATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1.5">~15-20 min for games to 11</p>
          </div>

          {/* Buffer Between Rounds */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
              Buffer Between Rounds
            </label>
            <select
              value={value.bufferMinutes}
              onChange={e => onChange({ ...value, bufferMinutes: parseInt(e.target.value) })}
              disabled={disabled}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-lime-500 appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25rem',
              }}
            >
              {BUFFER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1.5">Time between rounds in a box</p>
          </div>
        </div>

        {/* Time estimate badge */}
        <div className="mt-4 flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-lime-900/30 border border-lime-700/50 rounded-full">
            <span className="text-lime-400 text-sm font-medium">
              ~{capacity.estimatedDuration} min per box
            </span>
            <span className="text-gray-500 text-sm">
              ({capacity.roundsPerBox} rounds × {value.matchDurationMinutes + value.bufferMinutes} min)
            </span>
          </div>
        </div>
      </div>

      {/* ===== VENUE DETAILS ===== */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📍</span>
          <div>
            <h3 className="text-lg font-semibold text-white">Venue</h3>
            <p className="text-sm text-gray-500">Where the league plays</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
              Venue Name
            </label>
            <input
              type="text"
              value={value.venueName}
              onChange={e => onChange({ ...value, venueName: e.target.value })}
              placeholder="e.g., Auckland Pickleball Center"
              disabled={disabled}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-lime-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
              Address <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={value.venueAddress || ''}
              onChange={e => onChange({ ...value, venueAddress: e.target.value })}
              placeholder="e.g., 123 Main St, Auckland"
              disabled={disabled}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-lime-500"
            />
          </div>
        </div>
      </div>

      {/* ===== COURTS ===== */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏟️</span>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Courts
                <span className="ml-2 text-sm font-normal text-lime-400">
                  {value.courts.filter(c => c.active).length} active
                </span>
              </h3>
              <p className="text-sm text-gray-500">One box plays on each court</p>
            </div>
          </div>
          <button
            type="button"
            onClick={addCourt}
            disabled={disabled || value.courts.length >= 10}
            className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Court
          </button>
        </div>

        <div className="space-y-2">
          {value.courts.map((court, index) => (
            <div
              key={court.id}
              className={`
                flex items-center gap-3 p-3 rounded-lg border transition-all
                ${court.active
                  ? 'bg-gray-900/50 border-gray-700'
                  : 'bg-gray-900/30 border-gray-800 opacity-60'
                }
              `}
            >
              {/* Court number badge */}
              <div className={`
                w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm
                ${court.active ? 'bg-lime-600/20 text-lime-400' : 'bg-gray-800 text-gray-600'}
              `}>
                {index + 1}
              </div>

              {/* Court name input */}
              <input
                type="text"
                value={court.name}
                onChange={e => updateCourt(court.id, { name: e.target.value })}
                disabled={disabled}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-lime-500"
                placeholder="Court name"
              />

              {/* Active toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={court.active}
                  onChange={e => updateCourt(court.id, { active: e.target.checked })}
                  disabled={disabled}
                  className="w-4 h-4 accent-lime-500 rounded"
                />
                <span className={`text-sm ${court.active ? 'text-lime-400' : 'text-gray-600'}`}>
                  Active
                </span>
              </label>

              {/* Remove button */}
              {value.courts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCourt(court.id)}
                  disabled={disabled}
                  className="p-2 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove court"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== SESSIONS ===== */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕐</span>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Sessions
                <span className="ml-2 text-sm font-normal text-cyan-400">
                  {value.sessions.filter(s => s.active).length} active
                </span>
              </h3>
              <p className="text-sm text-gray-500">Time slots (e.g., Early 6-8pm, Late 8-10pm)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={addSession}
            disabled={disabled || value.sessions.length >= 4}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Session
          </button>
        </div>

        <div className="space-y-3">
          {value.sessions.map((session, index) => {
            const duration = getSessionDurationMinutes(session.startTime, session.endTime);
            const isEnoughTime = duration >= capacity.estimatedDuration;

            return (
              <div
                key={session.id}
                className={`
                  p-4 rounded-xl border transition-all
                  ${session.active
                    ? 'bg-gray-900/50 border-gray-700'
                    : 'bg-gray-900/30 border-gray-800 opacity-60'
                  }
                `}
              >
                {/* Session header row */}
                <div className="flex items-center gap-3 mb-4">
                  {/* Session number badge */}
                  <div className={`
                    w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm
                    ${session.active ? 'bg-cyan-600/20 text-cyan-400' : 'bg-gray-800 text-gray-600'}
                  `}>
                    {index + 1}
                  </div>

                  {/* Session name */}
                  <input
                    type="text"
                    value={session.name}
                    onChange={e => updateSession(session.id, { name: e.target.value })}
                    disabled={disabled}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Session name (e.g., Early, Late)"
                  />

                  {/* Active toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={session.active}
                      onChange={e => updateSession(session.id, { active: e.target.checked })}
                      disabled={disabled}
                      className="w-4 h-4 accent-cyan-500 rounded"
                    />
                    <span className={`text-sm ${session.active ? 'text-cyan-400' : 'text-gray-600'}`}>
                      Active
                    </span>
                  </label>

                  {/* Remove button */}
                  {value.sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSession(session.id)}
                      disabled={disabled}
                      className="p-2 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                      title="Remove session"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Time selection row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Start</label>
                    <select
                      value={session.startTime}
                      onChange={e => updateSession(session.id, { startTime: e.target.value })}
                      disabled={disabled}
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '1rem',
                      }}
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <span className="text-gray-600 mt-5">→</span>

                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">End</label>
                    <select
                      value={session.endTime}
                      onChange={e => updateSession(session.id, { endTime: e.target.value })}
                      disabled={disabled}
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '1rem',
                      }}
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Duration badge */}
                  <div className="mt-5">
                    <span className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                      ${isEnoughTime
                        ? 'bg-gray-800 text-gray-400'
                        : 'bg-amber-900/30 border border-amber-700/50 text-amber-400'
                      }
                    `}>
                      {duration} min
                      {!isEnoughTime && session.active && (
                        <span className="text-xs">(need ~{capacity.estimatedDuration})</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Session summary */}
                <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {formatTimeDisplay(session.startTime)} - {formatTimeDisplay(session.endTime)}
                  </span>
                  {session.active && isEnoughTime && (
                    <span className="text-lime-500/70 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Enough time
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== CAPACITY SUMMARY ===== */}
      <div className="bg-gradient-to-br from-lime-900/30 to-lime-900/10 rounded-xl p-5 border border-lime-700/40">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">📊</span>
          <h3 className="text-lg font-semibold text-lime-400">Capacity Summary</h3>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="bg-gray-900/50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-white">{capacity.activeCourts}</div>
            <div className="text-sm text-gray-500 mt-1">Courts</div>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-white">{capacity.activeSessions}</div>
            <div className="text-sm text-gray-500 mt-1">Sessions</div>
          </div>
          <div className="bg-lime-900/30 rounded-xl p-4 text-center border border-lime-700/30">
            <div className="text-3xl font-bold text-lime-400">{capacity.totalBoxes}</div>
            <div className="text-sm text-lime-600 mt-1">Boxes</div>
          </div>
          <div className="bg-lime-900/30 rounded-xl p-4 text-center border border-lime-700/30">
            <div className="text-3xl font-bold text-lime-400">{capacity.maxPlayers}</div>
            <div className="text-sm text-lime-600 mt-1">Max Players</div>
          </div>
        </div>

        {/* Calculation breakdown */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-lime-500">●</span>
            <span>
              <span className="text-white font-medium">{capacity.totalBoxes} boxes</span>
              {' = '}{capacity.activeCourts} courts × {capacity.activeSessions} session{capacity.activeSessions !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-lime-500">●</span>
            <span>
              <span className="text-white font-medium">{capacity.maxPlayers} players max</span>
              {' = '}{capacity.totalBoxes} boxes × {boxSize} players per box
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-lime-500">●</span>
            <span>
              Each box plays <span className="text-white font-medium">{capacity.roundsPerBox} rounds</span>
              {' (~'}{capacity.estimatedDuration} min total)
            </span>
          </div>
        </div>
      </div>

      {/* ===== INFO TIP ===== */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-start gap-3">
          <span className="text-lime-400 text-lg">💡</span>
          <div className="text-sm text-gray-400">
            <p className="font-medium text-gray-300 mb-1">How it works</p>
            <p>
              With <span className="text-white">{capacity.activeSessions} session{capacity.activeSessions !== 1 ? 's' : ''}</span> and <span className="text-white">{capacity.activeCourts} court{capacity.activeCourts !== 1 ? 's' : ''}</span>,
              you can run <span className="text-lime-400">{capacity.totalBoxes} box{capacity.totalBoxes !== 1 ? 'es' : ''}</span> per week.
              Each box is assigned to a court for one session, where {boxSize} players rotate through {capacity.roundsPerBox} rounds of doubles matches.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoxLeagueVenueConfig;
