/**
 * WeeklyMeetupsCalendar Component
 *
 * Calendar view for organizers showing all upcoming sessions across all weekly meetups.
 * Uses the meetupOccurrencesIndex collection for efficient cross-meetup queries.
 * Supports both week and month views with navigation.
 *
 * @version 07.57
 * @file components/clubs/WeeklyMeetupsCalendar.tsx
 */

import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToOccurrenceIndex } from '../../services/firebase/standingMeetups';
import type { MeetupOccurrenceIndex } from '../../types/standingMeetup';
import { formatTime } from '../../utils/timeFormat';

interface WeeklyMeetupsCalendarProps {
  clubId: string;
  onOpenOccurrence: (standingMeetupId: string, dateId: string) => void;
}

type ViewMode = 'week' | 'month';

interface DaySessions {
  date: Date;
  dateKey: string;
  sessions: MeetupOccurrenceIndex[];
  isToday: boolean;
  isCurrentMonth: boolean;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const WeeklyMeetupsCalendar: React.FC<WeeklyMeetupsCalendarProps> = ({
  clubId,
  onOpenOccurrence,
}) => {
  const [sessions, setSessions] = useState<MeetupOccurrenceIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToOccurrenceIndex(
      (data) => {
        setSessions(data);
        setLoading(false);
      },
      { clubId }
    );

    return () => {
      try {
        unsubscribe();
      } catch (err) {
        // Ignore Firestore SDK errors during cleanup (race condition bug in SDK 12.6.0)
        console.debug('Subscription cleanup error (safe to ignore):', err);
      }
    };
  }, [clubId]);

  // Group sessions by date key (YYYY-MM-DD)
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, MeetupOccurrenceIndex[]>();
    sessions.forEach((session) => {
      const dateKey = session.occurrenceDate;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(session);
    });
    // Sort sessions within each day by start time
    map.forEach((daySessions) => {
      daySessions.sort((a, b) => a.when - b.when);
    });
    return map;
  }, [sessions]);

  // Get the start of the week (Sunday)
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Get the start of the month calendar (may include days from previous month)
  const getMonthCalendarStart = (date: Date) => {
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    return getWeekStart(firstOfMonth);
  };

  // Generate week days array
  const weekDays = useMemo((): DaySessions[] => {
    const weekStart = getWeekStart(currentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: DaySessions[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateKey = formatDateKey(date);
      days.push({
        date,
        dateKey,
        sessions: sessionsByDate.get(dateKey) || [],
        isToday: date.getTime() === today.getTime(),
        isCurrentMonth: date.getMonth() === currentDate.getMonth(),
      });
    }
    return days;
  }, [currentDate, sessionsByDate]);

  // Generate month grid (6 weeks to cover all possibilities)
  const monthDays = useMemo((): DaySessions[] => {
    const calendarStart = getMonthCalendarStart(currentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: DaySessions[] = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(calendarStart);
      date.setDate(date.getDate() + i);
      const dateKey = formatDateKey(date);
      days.push({
        date,
        dateKey,
        sessions: sessionsByDate.get(dateKey) || [],
        isToday: date.getTime() === today.getTime(),
        isCurrentMonth: date.getMonth() === currentDate.getMonth(),
      });
    }
    return days;
  }, [currentDate, sessionsByDate]);

  // Navigation
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(null);
  };

  const navigate = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'week') {
        d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
      } else {
        d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
      }
      return d;
    });
    setSelectedDay(null);
  };

  // Get header label
  const getHeaderLabel = () => {
    if (viewMode === 'week') {
      const weekStart = getWeekStart(currentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
      } else {
        return `${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} - ${MONTH_NAMES[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }
    } else {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
  };

  // Selected day sessions
  const selectedDaySessions = selectedDay ? sessionsByDate.get(selectedDay) || [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Calendar</h2>
          <p className="text-gray-400 text-sm">
            All upcoming sessions across your weekly meetups
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'week'
                ? 'bg-lime-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'month'
                ? 'bg-lime-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between bg-gray-800 rounded-xl p-3 border border-gray-700">
        <button
          onClick={() => navigate('prev')}
          className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">{getHeaderLabel()}</h3>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-full transition-colors"
          >
            Today
          </button>
        </div>

        <button
          onClick={() => navigate('next')}
          className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-gray-700">
            {DAY_NAMES.map((day, i) => (
              <div
                key={day}
                className={`py-3 text-center text-sm font-semibold ${
                  i === 0 || i === 6 ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day Columns */}
          <div className="grid grid-cols-7 min-h-[400px]">
            {weekDays.map((day) => (
              <WeekDayColumn
                key={day.dateKey}
                day={day}
                onOpenOccurrence={onOpenOccurrence}
              />
            ))}
          </div>
        </div>
      )}

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-gray-700">
            {DAY_NAMES.map((day, i) => (
              <div
                key={day}
                className={`py-3 text-center text-sm font-semibold ${
                  i === 0 || i === 6 ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-7">
            {monthDays.map((day) => (
              <MonthDayCell
                key={day.dateKey}
                day={day}
                isSelected={selectedDay === day.dateKey}
                onSelect={() => setSelectedDay(day.dateKey)}
                onOpenOccurrence={onOpenOccurrence}
              />
            ))}
          </div>
        </div>
      )}

      {/* Selected Day Sessions (Month View) */}
      {viewMode === 'month' && selectedDay && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-white">
              {formatDisplayDate(selectedDay)}
            </h4>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {selectedDaySessions.length === 0 ? (
            <p className="text-gray-500 text-sm">No sessions scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDaySessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  compact={false}
                  onClick={() => onOpenOccurrence(session.standingMeetupId, session.occurrenceDate)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {sessions.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-white mb-2">No Upcoming Sessions</h3>
          <p className="text-gray-400">
            Create a weekly meetup to start scheduling recurring sessions.
          </p>
        </div>
      )}
    </div>
  );
};

// Week Day Column Component
interface WeekDayColumnProps {
  day: DaySessions;
  onOpenOccurrence: (standingMeetupId: string, dateId: string) => void;
}

const WeekDayColumn: React.FC<WeekDayColumnProps> = ({ day, onOpenOccurrence }) => {
  return (
    <div
      className={`border-r border-gray-700 last:border-r-0 p-2 ${
        day.isToday ? 'bg-lime-900/20' : ''
      }`}
    >
      {/* Date Number */}
      <div className="text-center mb-2">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
            day.isToday
              ? 'bg-lime-600 text-white'
              : 'text-gray-300'
          }`}
        >
          {day.date.getDate()}
        </span>
      </div>

      {/* Sessions */}
      <div className="space-y-2">
        {day.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            compact
            onClick={() => onOpenOccurrence(session.standingMeetupId, session.occurrenceDate)}
          />
        ))}
      </div>
    </div>
  );
};

// Month Day Cell Component
interface MonthDayCellProps {
  day: DaySessions;
  isSelected: boolean;
  onSelect: () => void;
  onOpenOccurrence: (standingMeetupId: string, dateId: string) => void;
}

const MonthDayCell: React.FC<MonthDayCellProps> = ({ day, isSelected, onSelect, onOpenOccurrence }) => {
  const hasSession = day.sessions.length > 0;
  const sessionCount = day.sessions.length;

  // Handle click on session - go directly to meetup detail
  const handleSessionClick = (e: React.MouseEvent, session: MeetupOccurrenceIndex) => {
    e.stopPropagation(); // Don't trigger day selection
    onOpenOccurrence(session.standingMeetupId, session.occurrenceDate);
  };

  return (
    <div
      onClick={onSelect}
      className={`
        min-h-[80px] p-2 border-b border-r border-gray-700 last:border-r-0 text-left
        transition-colors relative cursor-pointer
        ${day.isCurrentMonth ? '' : 'opacity-40'}
        ${day.isToday ? 'bg-lime-900/20' : ''}
        ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-750'}
      `}
    >
      {/* Date Number */}
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
          day.isToday
            ? 'bg-lime-600 text-white'
            : day.isCurrentMonth
            ? 'text-gray-300'
            : 'text-gray-600'
        }`}
      >
        {day.date.getDate()}
      </span>

      {/* Session Indicators - Now directly clickable */}
      {hasSession && (
        <div className="mt-1 flex flex-wrap gap-0.5">
          {day.sessions.slice(0, 2).map((session) => (
            <button
              key={session.id}
              onClick={(e) => handleSessionClick(e, session)}
              className="w-full px-1 py-0.5 bg-lime-600/30 border border-lime-600/50 hover:bg-lime-600/50 hover:border-lime-500 rounded text-[10px] text-lime-300 leading-tight text-left transition-colors"
              title={`${session.title} - ${formatTime(session.startTime)} - ${formatTime(session.endTime)} (Click to open)`}
            >
              <div className="truncate">{session.title}</div>
              <div className="text-lime-400/70">{formatTime(session.startTime)} - {formatTime(session.endTime)}</div>
            </button>
          ))}
          {sessionCount > 2 && (
            <div className="text-[10px] text-gray-500 px-1">
              +{sessionCount - 2} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Session Card Component
interface SessionCardProps {
  session: MeetupOccurrenceIndex;
  compact?: boolean;
  onClick: () => void;
}

const SessionCard: React.FC<SessionCardProps> = ({ session, compact = false, onClick }) => {
  const spotsInfo = session.maxPlayers > 0
    ? `${session.expectedCount}/${session.maxPlayers}`
    : `${session.expectedCount}`;
  const isFull = session.maxPlayers > 0 && session.expectedCount >= session.maxPlayers;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left bg-gray-700 hover:bg-gray-600 rounded-lg p-2 transition-colors group"
      >
        <div className="flex items-center gap-1 text-xs text-lime-400 mb-1">
          <span>{formatTime(session.startTime)}</span>
          {isFull && (
            <span className="bg-yellow-600/30 text-yellow-400 px-1 rounded text-[10px]">Full</span>
          )}
        </div>
        <div className="text-sm text-white font-medium truncate">{session.title}</div>
        <div className="text-xs text-gray-400">{spotsInfo} expected</div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-700 hover:bg-gray-600 rounded-lg p-3 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lime-400 font-semibold">
            {formatTime(session.startTime)} - {formatTime(session.endTime)}
          </span>
          {isFull && (
            <span className="bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded text-xs font-medium">
              Full
            </span>
          )}
        </div>
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <div className="text-white font-medium mb-1">{session.title}</div>
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {session.locationName}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          {spotsInfo} expected
        </span>
      </div>
    </button>
  );
};

// Helper Functions
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateKey: string): string {
  const date = new Date(dateKey + 'T00:00:00');
  return date.toLocaleDateString('en-NZ', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default WeeklyMeetupsCalendar;
