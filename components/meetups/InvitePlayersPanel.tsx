/**
 * InvitePlayersPanel - Search and invite players to a private meetup
 *
 * Displayed in MeetupOrganizerTools when meetup.visibility === 'private'.
 * Uses the same displayName range query pattern as CoHostPicker.
 *
 * @version 07.62
 * @file components/meetups/InvitePlayersPanel.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, limit } from '@firebase/firestore';
import { db } from '../../services/firebase';
import {
  sendMeetupInvite,
  removeMeetupInvite,
  subscribeToMeetupInvites,
} from '../../services/firebase/meetupInvites';
import { useAuth } from '../../contexts/AuthContext';
import { maskEmail } from '../../utils/privacy';
import type { Meetup, MeetupInvite } from '../../types';

interface InvitePlayersPanelProps {
  meetup: Meetup;
  onInviteSent?: () => void;
}

interface UserResult {
  id: string;
  displayName: string;
  email: string;
}

export const InvitePlayersPanel: React.FC<InvitePlayersPanelProps> = ({
  meetup,
  onInviteSent,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [invites, setInvites] = useState<MeetupInvite[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Subscribe to real-time invite list
  useEffect(() => {
    const unsub = subscribeToMeetupInvites(meetup.id, setInvites);
    return unsub;
  }, [meetup.id]);

  // Already-invited user IDs (to exclude from search)
  const excludeIds = new Set<string>([
    meetup.createdByUserId || '',
    ...(meetup.coHostIds || []),
    ...invites.map(i => i.invitedUserId),
  ]);

  // Convert search term to title case for matching (e.g., "james" -> "James")
  const toTitleCase = (str: string) =>
    str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

  const searchUsers = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const usersRef = collection(db, 'users');

      // Search with title case (most common name format)
      const titleCaseTerm = toTitleCase(term.trim());
      const q = query(
        usersRef,
        where('displayName', '>=', titleCaseTerm),
        where('displayName', '<=', titleCaseTerm + '\uf8ff'),
        limit(10)
      );
      const snap = await getDocs(q);
      const users = snap.docs
        .map(d => ({
          id: d.id,
          displayName: d.data().displayName || '',
          email: d.data().email || '',
        }))
        .filter(u => !excludeIds.has(u.id));
      setResults(users);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setSearching(false);
    }
  }, [excludeIds.size]); // Re-create when exclude set changes

  const handleInvite = async (user: UserResult) => {
    if (!currentUser || !userProfile) return;
    setActionLoading(user.id);
    try {
      await sendMeetupInvite(
        meetup,
        currentUser.uid,
        userProfile.displayName || 'Organizer',
        { id: user.id, displayName: user.displayName, email: user.email }
      );
      // Clear search after successful invite
      setSearchTerm('');
      setResults([]);
      onInviteSent?.();
    } catch (err) {
      console.error('Failed to send invite:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (invite: MeetupInvite) => {
    setActionLoading(invite.invitedUserId);
    try {
      await removeMeetupInvite(invite.id, meetup.id, invite.invitedUserId);
      onInviteSent?.();
    } catch (err) {
      console.error('Failed to remove invite:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <h3 className="text-white font-semibold mb-3">Invitations</h3>

      {/* Search input */}
      <div className="relative mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            searchUsers(e.target.value);
          }}
          placeholder="Search players to invite..."
          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-lime-500 placeholder-gray-500 text-sm"
        />
        {searching && (
          <div className="absolute right-3 top-3">
            <div className="w-5 h-5 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Search results dropdown */}
        {results.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {results.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleInvite(user)}
                disabled={actionLoading === user.id}
                className="w-full px-4 py-3 text-left hover:bg-gray-700 flex items-center justify-between border-b border-gray-700 last:border-0 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-lime-900/30 rounded-full flex items-center justify-center text-lime-400 font-bold text-sm">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white text-sm">{user.displayName}</p>
                    <p className="text-gray-500 text-xs">{maskEmail(user.email)}</p>
                  </div>
                </div>
                <span className="text-lime-400 text-xs font-medium">
                  {actionLoading === user.id ? '...' : 'Invite'}
                </span>
              </button>
            ))}
          </div>
        )}

        {searchTerm.length >= 2 && !searching && results.length === 0 && (
          <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3">
            <p className="text-gray-500 text-sm text-center">No players found</p>
          </div>
        )}
      </div>

      {/* Invited list */}
      {invites.length > 0 ? (
        <div className="space-y-1">
          <p className="text-gray-500 text-xs mb-2">Invited ({invites.length})</p>
          {invites.map(invite => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-lime-900/30 rounded-full flex items-center justify-center text-lime-400 font-bold text-sm">
                  {invite.invitedUserName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm">{invite.invitedUserName}</p>
                  {invite.invitedUserEmail && (
                    <p className="text-gray-500 text-xs">{invite.invitedUserEmail}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemove(invite)}
                disabled={actionLoading === invite.invitedUserId}
                className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1"
              >
                {actionLoading === invite.invitedUserId ? '...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm text-center py-3">
          No players invited yet. Search above to invite players.
        </p>
      )}
    </div>
  );
};
