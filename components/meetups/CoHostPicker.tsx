/**
 * CoHostPicker - Search and add co-hosts for a meetup
 *
 * Co-hosts CAN: check-in, add guests, mark no-show, close session
 * Co-hosts CANNOT: edit meetup details, cancel meetup, manage co-hosts
 *
 * @version 07.61
 * @file components/meetups/CoHostPicker.tsx
 */

import React, { useState, useCallback } from 'react';
import { collection, query, where, getDocs, limit } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { maskEmail } from '../../utils/privacy';

interface CoHostPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  hostId: string; // exclude the host from search results
}

interface UserResult {
  id: string;
  displayName: string;
  email: string;
}

export const CoHostPicker: React.FC<CoHostPickerProps> = ({ selectedIds, onChange, hostId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

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
        .map(d => ({ id: d.id, displayName: d.data().displayName || '', email: d.data().email || '' }))
        .filter(u => u.id !== hostId && !selectedIds.includes(u.id));
      setResults(users);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setSearching(false);
    }
  }, [hostId, selectedIds]);

  const handleAdd = (user: UserResult) => {
    setSelectedUsers(prev => [...prev, user]);
    onChange([...selectedIds, user.id]);
    setResults([]);
    setSearchTerm('');
  };

  const handleRemove = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
    onChange(selectedIds.filter(id => id !== userId));
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-400">Co-hosts</label>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            searchUsers(e.target.value);
          }}
          placeholder="Search players by name..."
          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-lime-500 placeholder-gray-500"
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
                onClick={() => handleAdd(user)}
                className="w-full px-4 py-3 text-left hover:bg-gray-700 flex items-center gap-3 border-b border-gray-700 last:border-0"
              >
                <div className="w-8 h-8 bg-lime-900/30 rounded-full flex items-center justify-center text-lime-400 font-bold text-sm">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm">{user.displayName}</p>
                  <p className="text-gray-500 text-xs">{maskEmail(user.email)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected co-hosts */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map(user => (
            <span
              key={user.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-lime-900/30 border border-lime-700/50 rounded-full text-sm text-lime-400"
            >
              {user.displayName}
              <button
                type="button"
                onClick={() => handleRemove(user.id)}
                className="text-lime-500 hover:text-red-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {selectedUsers.length === 0 && (
        <p className="text-gray-500 text-xs">No co-hosts added yet</p>
      )}
    </div>
  );
};
