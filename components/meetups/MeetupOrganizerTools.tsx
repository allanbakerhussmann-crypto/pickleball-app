/**
 * MeetupOrganizerTools - Manage tab content for meetup organizers
 *
 * Displays:
 * - Counter dashboard (Confirmed / Checked-in / No-shows / Guests)
 * - Player list with check-in / no-show actions
 * - Guest section with add guest button
 * - Court rotation panel (if enabled)
 * - Close session button
 *
 * @version 07.61
 * @file components/meetups/MeetupOrganizerTools.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  checkInPlayer,
  undoCheckIn,
  markNoShow,
  undoNoShow,
  closeMeetupSession,
  subscribeToMeetupRsvps,
  subscribeToMeetupGuests,
} from '../../services/firebase/meetupAttendance';
import { AddGuestModal } from './AddGuestModal';
import { CourtRotationPanel } from './CourtRotationPanel';
import { InvitePlayersPanel } from './InvitePlayersPanel';
import type { Meetup, MeetupRSVP, MeetupGuest } from '../../types';

interface MeetupOrganizerToolsProps {
  meetup: Meetup;
  onMeetupUpdate?: () => void;
}

type UndoAction = {
  type: 'check_in' | 'no_show';
  userId: string;
  userName: string;
  timeout: ReturnType<typeof setTimeout>;
};

export const MeetupOrganizerTools: React.FC<MeetupOrganizerToolsProps> = ({
  meetup,
  onMeetupUpdate,
}) => {
  const [rsvps, setRsvps] = useState<MeetupRSVP[]>([]);
  const [guests, setGuests] = useState<MeetupGuest[]>([]);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [rotationExpanded, setRotationExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Subscribe to real-time data
  useEffect(() => {
    const unsubRsvps = subscribeToMeetupRsvps(meetup.id, setRsvps);
    const unsubGuests = subscribeToMeetupGuests(meetup.id, setGuests);
    return () => { unsubRsvps(); unsubGuests(); };
  }, [meetup.id]);

  // Derived counts
  const confirmedRsvps = rsvps.filter(r => r.status === 'confirmed');
  const checkedInRsvps = confirmedRsvps.filter(r => r.checkedInAt);
  const notCheckedIn = confirmedRsvps.filter(r => !r.checkedInAt);
  const noShowRsvps = rsvps.filter(r => r.status === 'no_show');

  const confirmedCount = confirmedRsvps.length;
  const checkedInCount = checkedInRsvps.length;
  const noShowCount = noShowRsvps.length;
  const guestCount = guests.length;

  // Show undo toast for 3 seconds
  const showUndo = useCallback((type: 'check_in' | 'no_show', userId: string, userName: string) => {
    if (undoAction) clearTimeout(undoAction.timeout);

    const timeout = setTimeout(() => setUndoAction(null), 3000);
    setUndoAction({ type, userId, userName, timeout });
  }, [undoAction]);

  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    clearTimeout(undoAction.timeout);

    try {
      if (undoAction.type === 'check_in') {
        await undoCheckIn(meetup.id, undoAction.userId);
      } else {
        await undoNoShow(meetup.id, undoAction.userId);
      }
    } catch (err) {
      console.error('Undo failed:', err);
    }

    setUndoAction(null);
    onMeetupUpdate?.();
  }, [undoAction, meetup.id, onMeetupUpdate]);

  const handleCheckIn = async (userId: string, userName: string) => {
    setActionLoading(userId);
    try {
      await checkInPlayer(meetup.id, userId);
      showUndo('check_in', userId, userName);
      onMeetupUpdate?.();
    } catch (err: any) {
      console.error('Check-in failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleNoShow = async (userId: string, userName: string) => {
    setActionLoading(userId);
    try {
      await markNoShow(meetup.id, userId);
      showUndo('no_show', userId, userName);
      onMeetupUpdate?.();
    } catch (err: any) {
      console.error('Mark no-show failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseSession = async () => {
    setClosing(true);
    try {
      await closeMeetupSession(meetup.id);
      setShowCloseConfirm(false);
      onMeetupUpdate?.();
    } catch (err: any) {
      console.error('Close session failed:', err);
    } finally {
      setClosing(false);
    }
  };

  const isClosed = !!meetup.closedAt;
  const defaultGuestAmount = meetup.pricing?.amount || 0;

  return (
    <div className="space-y-6">
      {/* Counter Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-lime-400">{confirmedCount}</p>
          <p className="text-xs text-gray-400">Confirmed</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{checkedInCount}</p>
          <p className="text-xs text-gray-400">Checked In</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{noShowCount}</p>
          <p className="text-xs text-gray-400">No-shows</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{guestCount}</p>
          <p className="text-xs text-gray-400">Guests</p>
        </div>
      </div>

      {/* Invite Players (Private Meetups) */}
      {meetup.visibility === 'private' && (
        <InvitePlayersPanel
          meetup={meetup}
          onInviteSent={() => onMeetupUpdate?.()}
        />
      )}

      {/* Undo Toast */}
      {undoAction && (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 flex items-center justify-between animate-fade-in">
          <span className="text-gray-300 text-sm">
            {undoAction.type === 'check_in' ? 'Checked in' : 'Marked no-show'}: {undoAction.userName}
          </span>
          <button
            onClick={handleUndo}
            className="text-lime-400 hover:text-lime-300 text-sm font-medium underline"
          >
            Undo
          </button>
        </div>
      )}

      {/* Players Section */}
      <div>
        <h3 className="text-white font-semibold mb-3">Players</h3>

        {/* Checked In */}
        {checkedInRsvps.length > 0 && (
          <div className="space-y-1 mb-3">
            {checkedInRsvps.map(rsvp => (
              <div key={rsvp.odUserId} className="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-900/30">
                <div>
                  <p className="text-white text-sm">{rsvp.odUserName}</p>
                  {rsvp.duprId && <p className="text-gray-500 text-xs">DUPR: {rsvp.duprId}</p>}
                </div>
                <span className="text-green-400 text-xs font-medium px-2 py-1 bg-green-900/30 rounded">
                  Checked In
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Not Checked In (action buttons) */}
        {notCheckedIn.length > 0 && (
          <div className="space-y-1 mb-3">
            {notCheckedIn.map(rsvp => (
              <div key={rsvp.odUserId} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <p className="text-white text-sm">{rsvp.odUserName}</p>
                  <div className="flex gap-2 mt-0.5">
                    {rsvp.paymentStatus === 'paid' && (
                      <span className="text-green-400 text-xs bg-green-900/50 px-1.5 py-0.5 rounded">Paid</span>
                    )}
                    {rsvp.paymentStatus === 'pending' && (
                      <span className="text-yellow-400 text-xs bg-yellow-900/50 px-1.5 py-0.5 rounded">Pending</span>
                    )}
                  </div>
                </div>
                {!isClosed && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCheckIn(rsvp.odUserId, rsvp.odUserName)}
                      disabled={actionLoading === rsvp.odUserId}
                      className="text-green-400 hover:text-green-300 text-xs font-medium px-3 py-1.5 bg-green-900/30 hover:bg-green-900/50 rounded border border-green-700/50"
                    >
                      {actionLoading === rsvp.odUserId ? '...' : 'Check In'}
                    </button>
                    <button
                      onClick={() => handleNoShow(rsvp.odUserId, rsvp.odUserName)}
                      disabled={actionLoading === rsvp.odUserId}
                      className="text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 rounded border border-red-700/50"
                    >
                      No-Show
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No-shows */}
        {noShowRsvps.length > 0 && (
          <div className="space-y-1 mb-3">
            <p className="text-gray-500 text-xs mb-1">No-shows</p>
            {noShowRsvps.map(rsvp => (
              <div key={rsvp.odUserId} className="flex items-center justify-between p-3 bg-red-900/10 rounded-lg border border-red-900/20">
                <p className="text-gray-400 text-sm">{rsvp.odUserName}</p>
                <span className="text-red-400 text-xs font-medium px-2 py-1 bg-red-900/30 rounded">
                  No-show
                </span>
              </div>
            ))}
          </div>
        )}

        {confirmedRsvps.length === 0 && noShowRsvps.length === 0 && (
          <p className="text-gray-500 text-sm py-4 text-center">No RSVPs yet</p>
        )}
      </div>

      {/* Guests Section */}
      <div>
        <h3 className="text-white font-semibold mb-3">Guests</h3>

        {guests.length > 0 && (
          <div className="space-y-1 mb-3">
            {guests.map(guest => (
              <div key={guest.id} className="flex items-center justify-between p-3 bg-blue-900/10 rounded-lg border border-blue-900/20">
                <div>
                  <p className="text-white text-sm">{guest.name} <span className="text-gray-500">(guest)</span></p>
                  {guest.notes && <p className="text-gray-500 text-xs">{guest.notes}</p>}
                </div>
                <span className="text-blue-400 text-xs font-medium">
                  ${(guest.amount / 100).toFixed(2)} {guest.paymentMethod === 'cash' ? 'Cash' : 'Card'}
                </span>
              </div>
            ))}
          </div>
        )}

        {!isClosed && (
          <button
            onClick={() => setShowAddGuest(true)}
            className="w-full p-3 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-gray-300 text-sm transition-colors"
          >
            + Add Guest
          </button>
        )}
      </div>

      {/* Court Rotation (Expandable) */}
      {meetup.rotationSettings && (
        <div>
          <button
            onClick={() => setRotationExpanded(!rotationExpanded)}
            className="w-full flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
          >
            <span className="text-gray-300 font-medium text-sm">Court Rotation</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${rotationExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {rotationExpanded && (
            <div className="mt-2 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
              <CourtRotationPanel
                meetupId={meetup.id}
                settings={meetup.rotationSettings}
                checkedInPlayers={checkedInRsvps}
              />
            </div>
          )}
        </div>
      )}

      {/* Close Session */}
      {!isClosed && (
        <div>
          {!showCloseConfirm ? (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="w-full bg-red-900/30 hover:bg-red-900/50 border border-red-700 text-red-400 font-semibold py-3 rounded-lg transition-colors"
            >
              Close Session
            </button>
          ) : (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 space-y-3">
              <p className="text-red-400 text-sm font-medium">
                Close this session?
              </p>
              <p className="text-gray-400 text-xs">
                {notCheckedIn.length > 0
                  ? `${notCheckedIn.length} confirmed player${notCheckedIn.length > 1 ? 's' : ''} who haven't checked in will be marked as no-show.`
                  : 'All confirmed players have been checked in.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCloseSession}
                  disabled={closing}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-semibold py-2 rounded-lg"
                >
                  {closing ? 'Closing...' : 'Yes, Close'}
                </button>
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session Closed Banner */}
      {isClosed && (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 text-center">
          <p className="text-gray-400 text-sm">Session closed</p>
          <p className="text-gray-500 text-xs mt-1">
            {checkedInCount} checked in, {guestCount} guests, {noShowCount} no-shows
          </p>
        </div>
      )}

      {/* Add Guest Modal */}
      {showAddGuest && (
        <AddGuestModal
          meetupId={meetup.id}
          defaultAmount={defaultGuestAmount}
          onClose={() => setShowAddGuest(false)}
          onAdded={() => onMeetupUpdate?.()}
        />
      )}
    </div>
  );
};
