/**
 * StaffManagement Component
 *
 * Allows tournament organizers to add and remove staff members.
 * Staff can manage live courts, start matches, and enter scores.
 *
 * @version 06.19
 * @file components/tournament/StaffManagement.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, limit } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { maskEmail } from '../../utils/privacy';
import {
  addTournamentStaff,
  removeTournamentStaff,
  getTournamentStaffDetails,
  type TournamentStaffMember,
} from '../../services/firebase/tournaments';

// ============================================
// TYPES
// ============================================

interface StaffManagementProps {
  tournamentId: string;
  staffIds: string[];
  onStaffUpdated: () => void;
}

interface SearchResult {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

const MAX_STAFF = 20;

// ============================================
// COMPONENT
// ============================================

export const StaffManagement: React.FC<StaffManagementProps> = ({
  tournamentId,
  staffIds,
  onStaffUpdated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [staffDetails, setStaffDetails] = useState<TournamentStaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [searched, setSearched] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Load staff details
  useEffect(() => {
    const loadStaff = async () => {
      setLoadingStaff(true);
      try {
        const details = await getTournamentStaffDetails(staffIds);
        setStaffDetails(details);
      } catch (err) {
        console.error('Failed to load staff details:', err);
      } finally {
        setLoadingStaff(false);
      }
    };
    loadStaff();
  }, [staffIds]);

  // Search users
  const searchUsers = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const searchLower = term.toLowerCase();
      const usersRef = collection(db, 'users');
      const q = query(usersRef, limit(100));
      const snapshot = await getDocs(q);

      const matches: SearchResult[] = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const displayName = (data.displayName || '').toLowerCase();
        const email = (data.email || '').toLowerCase();

        if (displayName.includes(searchLower) || email.includes(searchLower)) {
          // Exclude already-added staff
          if (!staffIds.includes(doc.id)) {
            matches.push({
              id: doc.id,
              displayName: data.displayName || 'Unknown',
              email: data.email || '',
              photoURL: data.photoURL || data.photoData,
            });
          }
        }
      });

      // Sort by relevance
      matches.sort((a, b) => {
        const aStarts = a.displayName.toLowerCase().startsWith(searchLower) ? 0 : 1;
        const bStarts = b.displayName.toLowerCase().startsWith(searchLower) ? 0 : 1;
        return aStarts - bStarts;
      });

      setSearchResults(matches.slice(0, 8));
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [staffIds]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchUsers]);

  const handleAddStaff = async (userId: string) => {
    if (staffIds.length >= MAX_STAFF) {
      alert(`Maximum ${MAX_STAFF} staff members allowed.`);
      return;
    }

    setAddingUserId(userId);
    try {
      await addTournamentStaff(tournamentId, userId);
      setSearchTerm('');
      setSearchResults([]);
      setSearched(false);
      onStaffUpdated();
    } catch (err) {
      console.error('Failed to add staff:', err);
      alert('Failed to add staff member. Please try again.');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRemoveStaff = async (userId: string, displayName: string) => {
    if (!confirm(`Remove ${displayName} from tournament staff?`)) return;

    setRemovingUserId(userId);
    try {
      await removeTournamentStaff(tournamentId, userId);
      onStaffUpdated();
    } catch (err) {
      console.error('Failed to remove staff:', err);
      alert('Failed to remove staff member. Please try again.');
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Tournament Staff
        </h3>
        <p className="text-gray-400 text-sm mt-1">
          Staff can assign matches to courts, start matches, and enter scores.
          They cannot change tournament settings or manage teams.
        </p>
      </div>

      {/* Search Section */}
      <div className="p-4 border-b border-gray-700 bg-gray-800/50">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Add Staff Member
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full bg-gray-900 text-white pl-10 pr-4 py-3 rounded-lg border border-gray-600 focus:border-lime-500 outline-none"
            disabled={staffIds.length >= MAX_STAFF}
          />
          <svg
            className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searched && searchTerm.length >= 2 && (
          <div className="mt-2 bg-gray-900 border border-gray-600 rounded-lg max-h-64 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No users found matching "{searchTerm}"
              </div>
            ) : (
              searchResults.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleAddStaff(user.id)}
                  disabled={addingUserId === user.id}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors text-left border-b border-gray-700 last:border-b-0 disabled:opacity-50"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-lime-600/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lime-400 font-bold">
                        {user.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{user.displayName}</p>
                    <p className="text-gray-500 text-sm truncate">{maskEmail(user.email)}</p>
                  </div>

                  {/* Add button */}
                  {addingUserId === user.id ? (
                    <div className="w-5 h-5 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        <p className="text-gray-500 text-xs mt-2">
          {staffIds.length} of {MAX_STAFF} staff slots used
        </p>
      </div>

      {/* Current Staff List */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">
          Current Staff ({staffDetails.length})
        </h4>

        {loadingStaff ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : staffDetails.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p>No staff members yet</p>
            <p className="text-sm text-gray-600 mt-1">Search above to add staff</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staffDetails.map(staff => (
              <div
                key={staff.userId}
                className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-lime-600/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {staff.photoURL ? (
                    <img src={staff.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lime-400 font-bold">
                      {staff.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{staff.displayName}</p>
                  <p className="text-gray-500 text-sm truncate">{maskEmail(staff.email)}</p>
                </div>

                {/* Staff badge */}
                <span className="px-2 py-1 bg-lime-600/20 text-lime-400 text-xs font-medium rounded">
                  Staff
                </span>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveStaff(staff.userId, staff.displayName)}
                  disabled={removingUserId === staff.userId}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove staff member"
                >
                  {removingUserId === staff.userId ? (
                    <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permissions Info */}
      <div className="p-4 border-t border-gray-700 bg-gray-800/30">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Staff Permissions</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Assign matches to courts
          </div>
          <div className="flex items-center gap-2 text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Start matches
          </div>
          <div className="flex items-center gap-2 text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Enter scores
          </div>
          <div className="flex items-center gap-2 text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            View brackets & standings
          </div>
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Change settings
          </div>
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Manage teams
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffManagement;
