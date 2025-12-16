/**
 * CourtBookingCalendar Component
 * 
 * Main calendar view for booking courts
 * 
 * FILE LOCATION: components/clubs/CourtBookingCalendar.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToClubCourts,
  subscribeToBookingsForDate,
  getClubBookingSettings,
  createCourtBooking,
  cancelCourtBooking,
  canUserBook,
  canCancelBooking,
  generateTimeSlots,
  calculateEndTime,
  isSlotInPast,
  formatDateLabel,
} from '../../services/firebase';
import type { ClubCourt, ClubBookingSettings, CourtBooking, DEFAULT_BOOKING_SETTINGS } from '../../types';

interface CourtBookingCalendarProps {
  clubId: string;
  isAdmin: boolean;
  isMember: boolean;
  onBack: () => void;
}

export const CourtBookingCalendar: React.FC<CourtBookingCalendarProps> = ({
  clubId,
  isAdmin,
  isMember,
  onBack,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [courts, setCourts] = useState<ClubCourt[]>([]);
  const [settings, setSettings] = useState<ClubBookingSettings | null>(null);
  const [bookings, setBookings] = useState<CourtBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(true);
  const [bookingModal, setBookingModal] = useState<{
    courtId: string;
    courtName: string;
    time: string;
  } | null>(null);
  const [cancelModal, setCancelModal] = useState<CourtBooking | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    getClubBookingSettings(clubId).then((s) => {
      setSettings(s || {
        enabled: false,
        slotDurationMinutes: 60,
        openTime: '06:00',
        closeTime: '22:00',
        maxAdvanceBookingDays: 14,
        maxBookingsPerMemberPerDay: 2,
        cancellationMinutesBeforeSlot: 60,
        allowNonMembers: false,
      });
    });
  }, [clubId]);

  // Subscribe to courts
  useEffect(() => {
    const unsubscribe = subscribeToClubCourts(clubId, (data) => {
      setCourts(data.filter(c => c.isActive));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [clubId]);

  // Subscribe to bookings for selected date
  useEffect(() => {
    const unsubscribe = subscribeToBookingsForDate(clubId, selectedDate, setBookings);
    return () => unsubscribe();
  }, [clubId, selectedDate]);

  // Generate date options (today + maxAdvanceBookingDays)
  const dateOptions = React.useMemo(() => {
    const dates: { value: string; label: string }[] = [];
    const maxDays = settings?.maxAdvanceBookingDays || 14;
    
    for (let i = 0; i < maxDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const value = date.toISOString().split('T')[0];
      dates.push({
        value,
        label: formatDateLabel(value),
      });
    }
    
    return dates;
  }, [settings?.maxAdvanceBookingDays]);

  // Generate time slots
  const timeSlots = React.useMemo(() => {
    if (!settings) return [];
    return generateTimeSlots(
      settings.openTime,
      settings.closeTime,
      settings.slotDurationMinutes
    );
  }, [settings]);

  // Get booking for a specific court and time
  const getBookingForSlot = (courtId: string, time: string): CourtBooking | null => {
    return bookings.find(
      b => b.courtId === courtId && b.startTime === time && b.status === 'confirmed'
    ) || null;
  };

  // Check if slot is bookable
  const isSlotBookable = (time: string): boolean => {
    if (!isMember && !isAdmin) return false;
    return !isSlotInPast(selectedDate, time);
  };

  // Handle booking
  const handleBook = async () => {
    if (!bookingModal || !currentUser || !userProfile || !settings) return;
    
    setError(null);
    setProcessing(true);
    
    try {
      // Check daily limit
      const { canBook, currentCount } = await canUserBook(
        clubId,
        currentUser.uid,
        selectedDate,
        settings.maxBookingsPerMemberPerDay
      );
      
      if (!canBook && !isAdmin) {
        throw new Error(`You've reached your daily limit of ${settings.maxBookingsPerMemberPerDay} bookings`);
      }
      
      await createCourtBooking(clubId, {
        courtId: bookingModal.courtId,
        courtName: bookingModal.courtName,
        date: selectedDate,
        startTime: bookingModal.time,
        endTime: calculateEndTime(bookingModal.time, settings.slotDurationMinutes),
        bookedByUserId: currentUser.uid,
        bookedByName: userProfile.displayName || 'Unknown',
      });
      
      setBookingModal(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    if (!cancelModal || !currentUser || !settings) return;
    
    setError(null);
    setProcessing(true);
    
    try {
      // Check if within cancellation window (unless admin)
      if (!isAdmin && !canCancelBooking(cancelModal, settings.cancellationMinutesBeforeSlot)) {
        throw new Error(`Bookings must be cancelled at least ${settings.cancellationMinutesBeforeSlot} minutes before the start time`);
      }
      
      await cancelCourtBooking(clubId, cancelModal.id, currentUser.uid);
      setCancelModal(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  // Format time for display
  const formatTime = (time: string): string => {
    const [hours, mins] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };

  if (!settings?.enabled && !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Court Booking Not Available</h2>
          <p className="text-gray-400">This club hasn't enabled court booking yet.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Club
          </button>
          <h1 className="text-2xl font-bold text-white">Court Booking</h1>
        </div>
      </div>

      {/* Date Selector */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {dateOptions.map((d) => (
          <button
            key={d.value}
            onClick={() => setSelectedDate(d.value)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedDate === d.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* No Courts Message */}
      {courts.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <h3 className="text-lg font-bold text-white mb-2">No Courts Available</h3>
          <p className="text-gray-400 text-sm">
            {isAdmin ? 'Add courts in the Manage Courts section.' : 'No courts have been set up yet.'}
          </p>
        </div>
      )}

      {/* Calendar Grid */}
      {courts.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Court Headers */}
          <div className="grid border-b border-gray-700" style={{ gridTemplateColumns: `80px repeat(${courts.length}, 1fr)` }}>
            <div className="p-3 bg-gray-900/50 text-xs text-gray-500 font-semibold">TIME</div>
            {courts.map((court) => (
              <div key={court.id} className="p-3 bg-gray-900/50 text-center border-l border-gray-700">
                <div className="font-semibold text-white text-sm">{court.name}</div>
                {court.description && (
                  <div className="text-xs text-gray-500">{court.description}</div>
                )}
              </div>
            ))}
          </div>

          {/* Time Slots */}
          <div className="max-h-[60vh] overflow-y-auto">
            {timeSlots.map((time) => {
              const isPast = isSlotInPast(selectedDate, time);
              
              return (
                <div
                  key={time}
                  className="grid border-b border-gray-700 last:border-b-0"
                  style={{ gridTemplateColumns: `80px repeat(${courts.length}, 1fr)` }}
                >
                  {/* Time Label */}
                  <div className={`p-3 text-xs font-mono ${isPast ? 'text-gray-600' : 'text-gray-400'}`}>
                    {formatTime(time)}
                  </div>

                  {/* Court Slots */}
                  {courts.map((court) => {
                    const booking = getBookingForSlot(court.id, time);
                    const canBook = isSlotBookable(time) && !booking;
                    const isMyBooking = booking?.bookedByUserId === currentUser?.uid;
                    const canCancelThis = isMyBooking || isAdmin;

                    return (
                      <div
                        key={`${court.id}-${time}`}
                        className={`p-2 border-l border-gray-700 min-h-[60px] ${
                          isPast ? 'bg-gray-900/30' : ''
                        }`}
                      >
                        {booking ? (
                          // Booked slot
                          <div
                            onClick={() => canCancelThis && setCancelModal(booking)}
                            className={`h-full rounded p-2 text-xs ${
                              isMyBooking
                                ? 'bg-blue-600/30 border border-blue-500 cursor-pointer hover:bg-blue-600/40'
                                : canCancelThis
                                ? 'bg-red-900/30 border border-red-700 cursor-pointer hover:bg-red-900/40'
                                : 'bg-gray-700/50 border border-gray-600'
                            }`}
                          >
                            <div className={`font-semibold ${isMyBooking ? 'text-blue-300' : 'text-gray-300'}`}>
                              {isMyBooking ? 'Your Booking' : 'Booked'}
                            </div>
                            <div className="text-gray-400 truncate">{booking.bookedByName}</div>
                          </div>
                        ) : canBook ? (
                          // Available slot
                          <button
                            onClick={() => setBookingModal({ courtId: court.id, courtName: court.name, time })}
                            className="w-full h-full rounded border-2 border-dashed border-gray-600 hover:border-green-500 hover:bg-green-900/20 text-gray-500 hover:text-green-400 text-xs font-semibold transition-colors flex items-center justify-center"
                          >
                            + Book
                          </button>
                        ) : (
                          // Unavailable (past or no permission)
                          <div className="h-full rounded bg-gray-900/20 flex items-center justify-center">
                            <span className="text-gray-600 text-xs">
                              {isPast ? 'Past' : '—'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-600/30 border border-blue-500"></div>
          <span>Your Booking</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-700/50 border border-gray-600"></div>
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border-2 border-dashed border-gray-600"></div>
          <span>Available</span>
        </div>
      </div>

      {/* Booking Modal */}
      {bookingModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setBookingModal(null)}>
          <div className="bg-gray-800 rounded-xl max-w-md w-full border border-gray-700 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Confirm Booking</h2>
            
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Court</span>
                <span className="text-white font-semibold">{bookingModal.courtName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="text-white">{formatDateLabel(selectedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time</span>
                <span className="text-white">
                  {formatTime(bookingModal.time)} - {formatTime(calculateEndTime(bookingModal.time, settings?.slotDurationMinutes || 60))}
                </span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setBookingModal(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleBook}
                disabled={processing}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-semibold disabled:bg-gray-600"
              >
                {processing ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
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
                <span className="text-white">{formatDateLabel(cancelModal.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time</span>
                <span className="text-white">{formatTime(cancelModal.startTime)} - {formatTime(cancelModal.endTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Booked By</span>
                <span className="text-white">{cancelModal.bookedByName}</span>
              </div>
            </div>
            
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to cancel this booking?
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

export default CourtBookingCalendar;