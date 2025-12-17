/**
 * CourtBookingCalendar Component
 * 
 * Main calendar view for booking courts with integrated checkout system.
 * 
 * Features:
 * - View available courts and time slots
 * - SELECT MULTIPLE SLOTS (cart system)
 * - Book all selected slots with single payment
 * - Cancel bookings
 * - Shows pending holds from other users
 * 
 * FILE LOCATION: components/clubs/CourtBookingCalendar.tsx
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { calculateCourtBookingPrice, formatCentsToDisplay } from '../../services/firebase/pricing';
import { getPendingCourtHolds } from '../../services/firebase/checkout';
import type { ClubCourt, ClubBookingSettings, CourtBooking } from '../../types';
import type { PriceCalculation, PriceLineItem } from '../../services/firebase/pricing';
import type { CheckoutItem, CheckoutItemDetails } from '../../services/firebase/checkout';

// ============================================
// TYPES
// ============================================

interface SelectedSlot {
  courtId: string;
  courtName: string;
  time: string;
  pricing: PriceCalculation;
}

interface CourtBookingCalendarProps {
  clubId: string;
  clubName?: string;
  isAdmin: boolean;
  isMember: boolean;
  onBack: () => void;
}

// ============================================
// COMPONENT
// ============================================

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
  
  // CART: Selected slots for multi-booking
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  
  // Checkout modal state
  const [showCheckout, setShowCheckout] = useState(false);
  
  // Cancel modal state
  const [cancelModal, setCancelModal] = useState<CourtBooking | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format time for display - defined early so it can be used in useMemo hooks
  const formatTime = (time: string): string => {
    const [hours, mins] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };

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

  // Clear selected slots when date changes
  useEffect(() => {
    setSelectedSlots([]);
  }, [selectedDate]);

  // Generate date options (today + maxAdvanceBookingDays)
  const dateOptions = useMemo(() => {
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
  const timeSlots = useMemo(() => {
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

  // Check if slot is selected in cart
  const isSlotSelected = (courtId: string, time: string): boolean => {
    return selectedSlots.some(s => s.courtId === courtId && s.time === time);
  };

  // Check if slot is bookable
  const isSlotBookable = (time: string): boolean => {
    if (!isMember && !isAdmin) return false;
    return !isSlotInPast(selectedDate, time);
  };

  // Toggle slot selection (add/remove from cart)
  const toggleSlotSelection = (court: ClubCourt, time: string) => {
    if (!settings) return;

    const isCurrentlySelected = isSlotSelected(court.id, time);

    if (isCurrentlySelected) {
      // Remove from cart
      setSelectedSlots(prev => prev.filter(s => !(s.courtId === court.id && s.time === time)));
    } else {
      // Check daily limit
      const currentBookingsCount = bookings.filter(b => b.bookedByUserId === currentUser?.uid).length;
      const totalAfterSelection = currentBookingsCount + selectedSlots.length + 1;
      
      if (!isAdmin && totalAfterSelection > (settings.maxBookingsPerMemberPerDay || 2)) {
        setError(`You can only book ${settings.maxBookingsPerMemberPerDay} slots per day`);
        return;
      }

      // Calculate pricing for this slot
      const pricing = calculateCourtBookingPrice({
        court,
        date: selectedDate,
        startTime: time,
        durationMinutes: settings.slotDurationMinutes,
        settings,
        isMember,
        hasAnnualPass: false,
        isVisitor: !isMember && !isAdmin,
      });

      // Add to cart
      setSelectedSlots(prev => [...prev, {
        courtId: court.id,
        courtName: court.name,
        time,
        pricing,
      }]);
    }

    setError(null);
  };

  // Calculate combined pricing for all selected slots
  const combinedPricing = useMemo((): PriceCalculation | null => {
    if (selectedSlots.length === 0) return null;

    const lineItems: PriceLineItem[] = [];
    let totalBase = 0;
    let totalFinal = 0;
    let totalSavings = 0;

    selectedSlots.forEach(slot => {
      // Add each slot's line items with court/time info
      slot.pricing.lineItems.forEach(item => {
        lineItems.push({
          ...item,
          label: `${slot.courtName} @ ${formatTime(slot.time)} - ${item.label}`,
        });
      });
      totalBase += slot.pricing.basePrice;
      totalFinal += slot.pricing.finalPrice;
      totalSavings += slot.pricing.savings;
    });

    return {
      productType: 'court_booking',
      basePrice: totalBase,
      finalPrice: totalFinal,
      savings: totalSavings,
      lineItems,
      priceLabel: selectedSlots.length > 1 ? `${selectedSlots.length} Slots` : selectedSlots[0].pricing.priceLabel,
      currency: 'nzd',
      isFree: totalFinal === 0,
    };
  }, [selectedSlots]);

  // Build combined item details for checkout
  const combinedItemDetails = useMemo((): CheckoutItemDetails => {
    if (selectedSlots.length === 0) return {};

    if (selectedSlots.length === 1) {
      const slot = selectedSlots[0];
      return {
        clubId,
        clubName,
        courtId: slot.courtId,
        courtName: slot.courtName,
        date: selectedDate,
        startTime: slot.time,
        endTime: calculateEndTime(slot.time, settings?.slotDurationMinutes || 60),
      };
    }

    // Multiple slots - store as description
    const slotDescriptions = selectedSlots.map(s => 
      `${s.courtName} @ ${formatTime(s.time)}`
    ).join(', ');

    return {
      clubId,
      clubName,
      date: selectedDate,
      description: `${selectedSlots.length} court bookings: ${slotDescriptions}`,
    };
  }, [selectedSlots, selectedDate, clubId, clubName, settings]);

  // Handle checkout success - create all bookings
  const handleCheckoutSuccess = async (checkout: CheckoutItem) => {
    if (!settings || !currentUser || !userProfile) return;

    try {
      // Create a booking for each selected slot
      for (const slot of selectedSlots) {
        await createCourtBooking(clubId, {
          courtId: slot.courtId,
          courtName: slot.courtName,
          date: selectedDate,
          startTime: slot.time,
          endTime: calculateEndTime(slot.time, settings.slotDurationMinutes),
          bookedByUserId: currentUser.uid,
          bookedByName: userProfile.displayName || 'Unknown',
        });
      }

      // Clear cart and close checkout
      setSelectedSlots([]);
      setShowCheckout(false);
    } catch (err: any) {
      console.error('Failed to create bookings after payment:', err);
      setError(err.message || 'Failed to complete booking');
    }
  };

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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

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

      {/* Selected Slots Cart */}
      {selectedSlots.length > 0 && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-green-400 font-semibold flex items-center gap-2">
                <span>🛒</span>
                {selectedSlots.length} {selectedSlots.length === 1 ? 'Slot' : 'Slots'} Selected
              </h3>
              <div className="text-sm text-gray-300 mt-1">
                {selectedSlots.map((slot, i) => (
                  <span key={`${slot.courtId}-${slot.time}`}>
                    {i > 0 && ' • '}
                    {slot.courtName} @ {formatTime(slot.time)}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-gray-400 text-sm">Total</p>
                <p className="text-green-400 font-bold text-xl">
                  {combinedPricing?.isFree ? 'Free' : formatCentsToDisplay(combinedPricing?.finalPrice || 0)}
                </p>
                {combinedPricing && combinedPricing.savings > 0 && (
                  <p className="text-green-300 text-xs">
                    Save {formatCentsToDisplay(combinedPricing.savings)}
                  </p>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedSlots([])}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowCheckout(true)}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold"
                >
                  Book {selectedSlots.length} {selectedSlots.length === 1 ? 'Slot' : 'Slots'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    const isSelected = isSlotSelected(court.id, time);
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
                          // Available slot - clickable for cart
                          <button
                            onClick={() => toggleSlotSelection(court, time)}
                            className={`w-full h-full rounded border-2 text-xs font-semibold transition-all flex items-center justify-center ${
                              isSelected
                                ? 'bg-green-600/30 border-green-500 text-green-400'
                                : 'border-dashed border-gray-600 hover:border-green-500 hover:bg-green-900/20 text-gray-500 hover:text-green-400'
                            }`}
                          >
                            {isSelected ? '✓ Selected' : '+ Select'}
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
          <div className="w-4 h-4 rounded bg-green-600/30 border border-green-500"></div>
          <span>Selected</span>
        </div>
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

      {/* Instructions */}
      <div className="mt-4 text-sm text-gray-400">
        💡 Click slots to select them, then click "Book" to pay for all at once.
      </div>

      {/* Checkout Modal */}
      {showCheckout && combinedPricing && settings && (
        <CheckoutModal
          isOpen={true}
          onClose={() => setShowCheckout(false)}
          type="court_booking"
          itemDetails={combinedItemDetails}
          pricing={combinedPricing}
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