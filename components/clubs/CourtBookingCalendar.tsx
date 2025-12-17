/**
 * CourtBookingCalendar Component
 * 
 * Main calendar view for booking courts with integrated checkout system.
 * 
 * Features:
 * - View available courts and time slots
 * - Book courts with payment via CheckoutModal
 * - Cancel bookings
 * - Shows pending holds from other users
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
import { CheckoutModal } from '../checkout/CheckoutModal';
import { calculateCourtBookingPrice } from '../../services/firebase/pricing';
import { getPendingCourtHolds } from '../../services/firebase/checkout';
import type { ClubCourt, ClubBookingSettings, CourtBooking } from '../../types';
import type { PriceCalculation } from '../../services/firebase/pricing';
import type { CheckoutItem } from '../../services/firebase/checkout';

interface CourtBookingCalendarProps {
  clubId: string;
  clubName?: string;
  isAdmin: boolean;
  isMember: boolean;
  onBack: () => void;
}

export const CourtBookingCalendar: React.FC<CourtBookingCalendarProps> = ({
  clubId,
  clubName = 'Club',
  isAdmin,
  isMember,
  onBack,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [courts, setCourts] = useState<ClubCourt[]>([]);
  const [settings, setSettings] = useState<ClubBookingSettings | null>(null);
  const [bookings, setBookings] = useState<CourtBooking[]>([]);
  const [pendingHolds, setPendingHolds] = useState<CheckoutItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(true);
  
  // Checkout modal state
  const [checkoutModal, setCheckoutModal] = useState<{
    court: ClubCourt;
    time: string;
    pricing: PriceCalculation;
  } | null>(null);
  
  // Cancel modal state
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

  // Load pending holds for selected date
  useEffect(() => {
    const loadHolds = async () => {
      try {
        const holds = await getPendingCourtHolds(clubId, selectedDate);
        setPendingHolds(holds);
      } catch (err) {
        console.error('Failed to load pending holds:', err);
        setPendingHolds([]);
      }
    };
    loadHolds();
    
    // Refresh holds every 30 seconds
    const interval = setInterval(loadHolds, 30000);
    return () => clearInterval(interval);
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

  // Check if slot has a pending hold
  const getPendingHoldForSlot = (courtId: string, time: string): CheckoutItem | null => {
    return pendingHolds.find(
      h => h.itemDetails.courtId === courtId && h.itemDetails.startTime === time
    ) || null;
  };

  // Check if slot is bookable
  const isSlotBookable = (time: string): boolean => {
    if (!isMember && !isAdmin) return false;
    return !isSlotInPast(selectedDate, time);
  };

  // Handle clicking book button
  const handleBookClick = async (court: ClubCourt, time: string) => {
    if (!settings || !currentUser) return;

    setError(null);

    // Check daily limit first
    const { canBook: canBookMore } = await canUserBook(
      clubId,
      currentUser.uid,
      selectedDate,
      settings.maxBookingsPerMemberPerDay
    );

    if (!canBookMore && !isAdmin) {
      setError(`You've reached your daily limit of ${settings.maxBookingsPerMemberPerDay} bookings`);
      return;
    }

    // Calculate pricing
    const endTime = calculateEndTime(time, settings.slotDurationMinutes);
    const pricing = calculateCourtBookingPrice({
      court,
      date: selectedDate,
      startTime: time,
      durationMinutes: settings.slotDurationMinutes,
      settings,
      isMember,
      hasAnnualPass: false, // TODO: Check user's annual pass
      isVisitor: !isMember && !isAdmin,
    });

    // Open checkout modal
    setCheckoutModal({
      court,
      time,
      pricing,
    });
  };

  // Handle checkout success
  const handleCheckoutSuccess = async (checkout: CheckoutItem) => {
    if (!settings || !currentUser || !userProfile) return;

    try {
      // Create the actual booking
      await createCourtBooking(clubId, {
        courtId: checkout.itemDetails.courtId!,
        courtName: checkout.itemDetails.courtName!,
        date: checkout.itemDetails.date!,
        startTime: checkout.itemDetails.startTime!,
        endTime: checkout.itemDetails.endTime!,
        bookedByUserId: currentUser.uid,
        bookedByName: userProfile.displayName || 'Unknown',
      });

      setCheckoutModal(null);
    } catch (err: any) {
      console.error('Failed to create booking after payment:', err);
      setError(err.message || 'Failed to complete booking');
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

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4">
          {error}
          <button 
            onClick={() => setError(null)}
            className="float-right text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

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
                    const pendingHold = getPendingHoldForSlot(court.id, time);
                    const canBook = isSlotBookable(time) && !booking && !pendingHold;
                    const isMyBooking = booking?.bookedByUserId === currentUser?.uid;
                    const isMyHold = pendingHold?.userId === currentUser?.uid;
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
                        ) : pendingHold ? (
                          // Pending hold (someone is checking out)
                          <div
                            className={`h-full rounded p-2 text-xs ${
                              isMyHold
                                ? 'bg-yellow-600/30 border border-yellow-500'
                                : 'bg-orange-900/20 border border-orange-700/50'
                            }`}
                          >
                            <div className={`font-semibold ${isMyHold ? 'text-yellow-300' : 'text-orange-300'}`}>
                              {isMyHold ? 'Your Hold' : 'Reserved'}
                            </div>
                            <div className="text-gray-400 text-xs">
                              {isMyHold ? 'Complete checkout' : 'Being booked...'}
                            </div>
                          </div>
                        ) : canBook ? (
                          // Available slot
                          <button
                            onClick={() => handleBookClick(court, time)}
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
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-600/30 border border-blue-500"></div>
          <span>Your Booking</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-700/50 border border-gray-600"></div>
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-900/20 border border-orange-700/50"></div>
          <span>Being Reserved</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border-2 border-dashed border-gray-600"></div>
          <span>Available</span>
        </div>
      </div>

      {/* Checkout Modal */}
      {checkoutModal && settings && (
        <CheckoutModal
          isOpen={true}
          onClose={() => setCheckoutModal(null)}
          type="court_booking"
          itemDetails={{
            clubId,
            clubName,
            courtId: checkoutModal.court.id,
            courtName: checkoutModal.court.name,
            date: selectedDate,
            startTime: checkoutModal.time,
            endTime: calculateEndTime(checkoutModal.time, settings.slotDurationMinutes),
          }}
          pricing={checkoutModal.pricing}
          clubId={clubId}
          onSuccess={handleCheckoutSuccess}
          onError={(err) => setError(err.message)}
        />
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