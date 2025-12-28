/**
 * MyBookings Component
 * 
 * Shows a list of the current user's court bookings.
 * 
 * Features:
 * - View upcoming and past bookings
 * - Cancel upcoming bookings
 * - Filter by status
 * 
 * FILE LOCATION: components/clubs/MyBookings.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  Timestamp,
} from '@firebase/firestore';
import { db } from '../../services/firebase';
import { cancelCourtBooking, canCancelBooking } from '../../services/firebase';
import type { CourtBooking, ClubBookingSettings } from '../../types';
import { formatTime } from '../../utils/timeFormat';

// ============================================
// TYPES
// ============================================

interface MyBookingsProps {
  clubId: string;
  settings: ClubBookingSettings | null;
  isAdmin: boolean;
  onBack: () => void;
}

// Extend CourtBooking for payment fields that come from webhook
interface CourtBookingWithPayment extends CourtBooking {
  paymentStatus?: 'paid' | 'pending' | 'free';
  amount?: number;
  stripeSessionId?: string;
}

// ============================================
// HELPERS
// ============================================

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// formatTime imported from utils/timeFormat

const isUpcoming = (date: string, startTime: string): boolean => {
  const now = new Date();
  const bookingDate = new Date(`${date}T${startTime}`);
  return bookingDate > now;
};

const formatCurrency = (cents: number): string => {
  return `NZ$${(cents / 100).toFixed(2)}`;
};

// ============================================
// COMPONENT
// ============================================

export const MyBookings: React.FC<MyBookingsProps> = ({
  clubId,
  settings,
  isAdmin,
  onBack,
}) => {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<CourtBookingWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [cancelModal, setCancelModal] = useState<CourtBookingWithPayment | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user's bookings - using getDocs instead of onSnapshot to avoid index issues
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const loadBookings = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Simple query with just one where clause - no composite index needed
        const bookingsRef = collection(db, 'clubs', clubId, 'bookings');
        const q = query(
          bookingsRef,
          where('bookedByUserId', '==', currentUser.uid)
        );

        const snapshot = await getDocs(q);
        const bookingsList: CourtBookingWithPayment[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          bookingsList.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp 
              ? data.createdAt.toMillis() 
              : data.createdAt || Date.now(),
            updatedAt: data.updatedAt instanceof Timestamp
              ? data.updatedAt.toMillis()
              : data.updatedAt || Date.now(),
          } as CourtBookingWithPayment);
        });
        
        // Sort by date descending in JavaScript
        bookingsList.sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) return dateCompare;
          return b.startTime.localeCompare(a.startTime);
        });
        
        setBookings(bookingsList);
      } catch (err: any) {
        console.error('Failed to load bookings:', err);
        setError('Failed to load your bookings. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadBookings();
  }, [clubId, currentUser]);

  // Refresh bookings after cancel
  const refreshBookings = async () => {
    if (!currentUser) return;
    
    try {
      const bookingsRef = collection(db, 'clubs', clubId, 'bookings');
      const q = query(
        bookingsRef,
        where('bookedByUserId', '==', currentUser.uid)
      );

      const snapshot = await getDocs(q);
      const bookingsList: CourtBookingWithPayment[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookingsList.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp 
            ? data.createdAt.toMillis() 
            : data.createdAt || Date.now(),
          updatedAt: data.updatedAt instanceof Timestamp
            ? data.updatedAt.toMillis()
            : data.updatedAt || Date.now(),
        } as CourtBookingWithPayment);
      });
      
      bookingsList.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.startTime.localeCompare(a.startTime);
      });
      
      setBookings(bookingsList);
    } catch (err) {
      console.error('Failed to refresh bookings:', err);
    }
  };

  // Filter bookings
  const filteredBookings = bookings.filter((booking) => {
    // Check if cancelled
    const isCancelled = !!booking.cancelledAt;
    
    if (isCancelled) {
      return filter === 'all';
    }
    
    const upcoming = isUpcoming(booking.date, booking.startTime);
    
    if (filter === 'upcoming') return upcoming;
    if (filter === 'past') return !upcoming;
    return true;
  });

  // Sort: upcoming first (by date asc), then past (by date desc)
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const aUpcoming = isUpcoming(a.date, a.startTime);
    const bUpcoming = isUpcoming(b.date, b.startTime);
    
    if (aUpcoming && !bUpcoming) return -1;
    if (!aUpcoming && bUpcoming) return 1;
    
    if (aUpcoming) {
      // Both upcoming - sort ascending
      return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
    } else {
      // Both past - sort descending
      return b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime);
    }
  });

  // Handle cancel
  const handleCancel = async () => {
    if (!cancelModal || !currentUser || !settings) return;
    
    setError(null);
    setProcessing(true);
    
    try {
      if (!isAdmin && !canCancelBooking(cancelModal, settings.cancellationMinutesBeforeSlot)) {
        throw new Error(`Bookings must be cancelled at least ${settings.cancellationMinutesBeforeSlot} minutes before the start time`);
      }
      
      await cancelCourtBooking(clubId, cancelModal.id, currentUser.uid);
      setCancelModal(null);
      
      // Refresh the list
      await refreshBookings();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  // Stats
  const upcomingCount = bookings.filter(b => {
    const isCancelled = !!b.cancelledAt;
    return !isCancelled && isUpcoming(b.date, b.startTime);
  }).length;
  
  const pastCount = bookings.filter(b => {
    const isCancelled = !!b.cancelledAt;
    return !isCancelled && !isUpcoming(b.date, b.startTime);
  }).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">My Bookings</h1>
        </div>
        
        {/* Refresh Button */}
        <button
          onClick={refreshBookings}
          disabled={loading}
          className="text-gray-400 hover:text-white p-2"
          title="Refresh"
        >
          <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-3xl font-bold text-green-400">{upcomingCount}</div>
          <div className="text-gray-400 text-sm">Upcoming Bookings</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-3xl font-bold text-gray-400">{pastCount}</div>
          <div className="text-gray-400 text-sm">Past Bookings</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['upcoming', 'past', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
          {error}
          <button 
            onClick={() => setError(null)}
            className="float-right text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading your bookings...</p>
        </div>
      )}

      {/* No Bookings */}
      {!loading && sortedBookings.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-bold text-white mb-2">
            {filter === 'upcoming' ? 'No Upcoming Bookings' : filter === 'past' ? 'No Past Bookings' : 'No Bookings'}
          </h3>
          <p className="text-gray-400 text-sm">
            {filter === 'upcoming' 
              ? 'Book a court to see your upcoming reservations here.'
              : 'Your booking history will appear here.'}
          </p>
        </div>
      )}

      {/* Bookings List */}
      {!loading && sortedBookings.length > 0 && (
        <div className="space-y-3">
          {sortedBookings.map((booking) => {
            const upcoming = isUpcoming(booking.date, booking.startTime);
            const isCancelled = !!booking.cancelledAt;
            const canCancel = upcoming && 
              !isCancelled && 
              (isAdmin || canCancelBooking(booking, settings?.cancellationMinutesBeforeSlot || 60));

            return (
              <div
                key={booking.id}
                className={`bg-gray-800 rounded-xl p-4 border ${
                  isCancelled
                    ? 'border-red-900/50 opacity-60'
                    : upcoming
                    ? 'border-green-700'
                    : 'border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">🎾</span>
                      <div>
                        <h3 className="text-white font-semibold">{booking.courtName}</h3>
                        <p className="text-gray-400 text-sm">
                          {formatDate(booking.date)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Time: </span>
                        <span className="text-white">
                          {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                        </span>
                      </div>
                      
                      {booking.amount && booking.amount > 0 && (
                        <div>
                          <span className="text-gray-500">Paid: </span>
                          <span className="text-green-400">{formatCurrency(booking.amount)}</span>
                        </div>
                      )}
                      
                      {booking.paymentStatus === 'paid' && !booking.amount && (
                        <div>
                          <span className="text-green-400">✓ Paid</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {/* Status Badge */}
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isCancelled
                        ? 'bg-red-900/50 text-red-300'
                        : upcoming
                        ? 'bg-green-900/50 text-green-300'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {isCancelled 
                        ? 'Cancelled' 
                        : upcoming 
                        ? 'Upcoming' 
                        : 'Completed'}
                    </span>

                    {/* Cancel Button */}
                    {canCancel && (
                      <button
                        onClick={() => setCancelModal(booking)}
                        className="text-red-400 hover:text-red-300 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setCancelModal(null)}>
          <div className="bg-gray-800 rounded-xl max-w-md w-full border border-gray-700 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Cancel Booking</h2>
            
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Court</span>
                <span className="text-white font-semibold">{cancelModal.courtName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="text-white">{formatDate(cancelModal.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time</span>
                <span className="text-white">{formatTime(cancelModal.startTime)} - {formatTime(cancelModal.endTime)}</span>
              </div>
            </div>
            
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to cancel this booking? This action cannot be undone.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setCancelModal(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancel}
                disabled={processing}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold disabled:bg-gray-600"
              >
                {processing ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;