/**
 * MemberSearchModal Component
 * 
 * Modal for searching and selecting existing members to pay for.
 * Shows searchable list of registered users.
 * 
 * FILE LOCATION: components/checkout/MemberSearchModal.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, limit } from '@firebase/firestore';
import { db } from '../../services/firebase';
import type { PaymentForMember } from '../../types/payForOthers';
import { ModalShell } from '../shared/ModalShell';
import { maskEmail } from '../../utils/privacy';

// ============================================
// TYPES
// ============================================

interface MemberSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (member: PaymentForMember) => void;
  /** User IDs to exclude from search results */
  excludeUserIds?: string[];
}

interface SearchResult {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  photoData?: string;
}

// ============================================
// COMPONENT
// ============================================

export const MemberSearchModal: React.FC<MemberSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  excludeUserIds = [],
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setResults([]);
      setSearched(false);
    }
  }, [isOpen]);

  // Debounced search
  const searchMembers = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      // Search by displayName (case-insensitive is tricky in Firestore)
      // We'll do a prefix search and filter client-side
      const searchLower = term.toLowerCase();
      
      // Get all users (limited) and filter client-side
      // In production, you'd want a proper search solution like Algolia
      const usersRef = collection(db, 'users');
      const q = query(usersRef, limit(100));
      const snapshot = await getDocs(q);
      
      const matches: SearchResult[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const displayName = (data.displayName || '').toLowerCase();
        const email = (data.email || '').toLowerCase();
        
        // Check if matches search term
        if (displayName.includes(searchLower) || email.includes(searchLower)) {
          // Exclude specified users
          if (!excludeUserIds.includes(doc.id)) {
            matches.push({
              id: doc.id,
              displayName: data.displayName || 'Unknown',
              email: data.email || '',
              photoURL: data.photoURL,
              photoData: data.photoData,
            });
          }
        }
      });
      
      // Sort by relevance (starts with > contains)
      matches.sort((a, b) => {
        const aStarts = a.displayName.toLowerCase().startsWith(searchLower) ? 0 : 1;
        const bStarts = b.displayName.toLowerCase().startsWith(searchLower) ? 0 : 1;
        return aStarts - bStarts;
      });
      
      setResults(matches.slice(0, 10)); // Limit to 10 results
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [excludeUserIds]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchMembers(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm, searchMembers]);

  const handleSelect = (result: SearchResult) => {
    onSelect({
      odUserId: result.id,
      odUserName: result.displayName,
      email: result.email,
      photoURL: result.photoData || result.photoURL,
    });
  };

  if (!isOpen) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose}>
      <div className="max-h-[80dvh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-lg font-bold text-white">Find Member</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              autoFocus
              className="w-full bg-gray-900 text-white pl-10 pr-4 py-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
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
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-2">
            Search for registered members to pay for their spot
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {!searched && searchTerm.length < 2 && (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-gray-500">Type at least 2 characters to search</p>
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500">No members found</p>
              <p className="text-gray-600 text-sm mt-1">Try a different search term</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map(result => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-900/50 hover:bg-gray-700 rounded-lg border border-gray-700 hover:border-purple-600 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-purple-600/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {result.photoData || result.photoURL ? (
                      <img 
                        src={result.photoData || result.photoURL} 
                        alt="" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <span className="text-purple-400 font-bold">
                        {result.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{result.displayName}</p>
                    <p className="text-gray-500 text-sm truncate">{maskEmail(result.email)}</p>
                  </div>
                  
                  {/* Select indicator */}
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50">
          <p className="text-gray-500 text-xs text-center">
            Selected members will be automatically RSVP'd when payment is confirmed
          </p>
        </div>
      </div>
    </ModalShell>
  );
};

export default MemberSearchModal;