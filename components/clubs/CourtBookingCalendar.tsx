/**
 * CourtBookingCalendar Component
 * 
 * Main calendar view for booking courts with Stripe checkout integration.
 * 
 * Features:
 * - View available courts and time slots
 * - SELECT MULTIPLE SLOTS (cart system)
 * - Pay via Stripe Checkout
 * - Cancel bookings
 * - Handle payment success/cancel returns
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
import { formatTime } from '../../utils/timeFormat';

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
  
  // Payment success state
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  // Cancel modal state
  const [cancelModal, setCancelModal] = useState<CourtBooking | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // formatTime imported from utils/timeFormat

  // Check for payment success/cancel from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success') {
      setPaymentSuccess(true);
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setPaymentSuccess(false), 5000);
    } else if (paymentStatus === 'cancelled') {
      setError('Payment was cancelled. Your booking was not completed.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
        court: court as any, // ClubCourt is compatible with Court for pricing
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
      priceLabel: selectedSlots.length > 1 ? 
        `${selectedSlots.length} Slots` : selectedSlots[0].pricing.priceLabel,
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

  // Build allSlots array for CheckoutModal
  const allSlotsForCheckout = useMemo(() => {
    if (!settings) return [];
    
    return selectedSlots.map(slot => ({
      courtId: slot.courtId,
      courtName: slot.courtName,
      date: selectedDate,
      startTime: slot.time,
      endTime: calculateEndTime(slot.time, settings.slotDurationMinutes),
      pricing: slot.pricing,
    }));
  }, [selectedSlots, selectedDate, settings]);

  // Handle checkout success (for free bookings)
  const handleCheckoutSuccess = async (_checkout: CheckoutItem) => {
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
      setPaymentSuccess(true);
      setTimeout(() => setPaymentSuccess(false), 5000);
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
          <p className="text-gray-400">This club has not enabled court booking yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Book a Court</h1>
      </div>

      {/* Mobile-Friendly Date Selector - Horizontal Scroll */}
      <div className="mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {dateOptions.map((opt) => {
            const isSelected = selectedDate === opt.value;
            const dateObj = new Date(opt.value + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-NZ', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const monthName = dateObj.toLocaleDateString('en-NZ', { month: 'short' });
            const isToday = opt.value === new Date().toISOString().split('T')[0];
            
            return (
              <button
                key={opt.value}
                onClick={() => setSelectedDate(opt.value)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-lg border transition-all min-w-[70px] ${
                  isSelected
                    ? 'bg-green-600 border-green-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className={`text-xs font-medium ${isSelected ? 'text-green-100' : 'text-gray-500'}`}>
                  {isToday ? 'Today' : dayName}
                </span>
                <span className="text-lg font-bold">{dayNum}</span>
                <span className={`text-xs ${isSelected ? 'text-green-100' : 'text-gray-500'}`}>
                  {monthName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment Success Banner */}
      {paymentSuccess && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Payment successful! Your booking has been confirmed.</span>
          <button 
            onClick={() => setPaymentSuccess(false)}
            className="ml-auto text-green-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
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
          <p className="text-gray-400">Loading courts...</p>
        </div>
      )}

      {/* Cart Summary Bar */}
      {selectedSlots.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-3 sm:p-4 z-40">
          <div className="max-w-6xl mx-auto">
            {/* Mobile Layout */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center justify-between sm:block">
                <div>
                  <p className="text-white font-semibold text-sm sm:text-base">
                    {selectedSlots.length} {selectedSlots.length === 1 ? 'slot' : 'slots'} selected
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 truncate max-w-[200px] sm:max-w-none">
                    {selectedSlots.map(s => `${s.courtName} @ ${formatTime(s.time)}`).join(' • ')}
                  </p>
                </div>
                <div className="text-right sm:hidden">
                  <p className="text-lg font-bold text-white">
                    {combinedPricing?.isFree ? 'Free' : formatCentsToDisplay(combinedPricing?.finalPrice || 0)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xl font-bold text-white">
                    {combinedPricing?.isFree ? 'Free' : formatCentsToDisplay(combinedPricing?.finalPrice || 0)}
                  </p>
                  {combinedPricing && combinedPricing.savings > 0 && (
                    <p className="text-green-300 text-xs">
                      Save {formatCentsToDisplay(combinedPricing.savings)}
                    </p>
                  )}
                </div>
                
                <div className="flex gap-2 flex-1 sm:flex-none">
                  <button
                    onClick={() => setSelectedSlots([])}
                    className="px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium text-sm"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setShowCheckout(true)}
                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold text-sm sm:text-base"
                  >
                    Book Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Courts Message */}
      {!loading && courts.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <h3 className="text-lg font-bold text-white mb-2">No Courts Available</h3>
          <p className="text-gray-400 text-sm">
            {isAdmin ? 'Add courts in the Manage Courts section.' : 'No courts have been set up yet.'}
          </p>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && courts.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-24">
          {/* Scrollable container for mobile */}
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Min-width ensures columns don't get too narrow on mobile */}
            <div style={{ minWidth: `${80 + courts.length * 90}px` }}>
              {/* Court Headers */}
              <div 
                className="grid border-b border-gray-700 sticky top-0 z-10 bg-gray-800"
                style={{ gridTemplateColumns: `70px repeat(${courts.length}, minmax(80px, 1fr))` }}
              >
                <div className="p-2 bg-gray-900/50 text-xs text-gray-500 font-semibold flex items-center justify-center">
                  TIME
                </div>
                {courts.map((court) => (
                  <div key={court.id} className="p-2 bg-gray-900/50 text-center border-l border-gray-700">
                    <div className="font-semibold text-white text-xs sm:text-sm truncate">{court.name}</div>
                    {court.description && (
                      <div className="text-xs text-gray-500 truncate hidden sm:block">{court.description}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Time Slots */}
              <div className="max-h-[55vh] overflow-y-auto">
                {timeSlots.map((time) => {
                  const isPast = isSlotInPast(selectedDate, time);
                  
                  return (
                    <div
                      key={time}
                      className="grid border-b border-gray-700 last:border-b-0"
                      style={{ gridTemplateColumns: `70px repeat(${courts.length}, minmax(80px, 1fr))` }}
                    >
                      {/* Time Label */}
                      <div className={`p-2 text-xs font-mono flex items-center justify-center ${isPast ? 'text-gray-600' : 'text-gray-400'}`}>
                        {formatTime(time)}
                      </div>

                      {/* Slots for each court */}
                      {courts.map((court) => {
                        const booking = getBookingForSlot(court.id, time);
                        const pendingHold = getPendingHoldForSlot(court.id, time);
                        const isSelected = isSlotSelected(court.id, time);
                        const canBook = isSlotBookable(time);
                        const isMyBooking = booking?.bookedByUserId === currentUser?.uid;
                        const isMyHold = pendingHold?.userId === currentUser?.uid;

                        // Determine cell state
                        let cellClass = 'p-1.5 sm:p-2 border-l border-gray-700 transition-colors flex items-center justify-center min-h-[60px] ';
                        let content = null;

                        if (isPast) {
                          cellClass += 'bg-gray-900/30';
                          content = <span className="text-gray-600 text-xs">Past</span>;
                        } else if (booking) {
                          cellClass += isMyBooking 
                            ? 'bg-blue-900/30 cursor-pointer hover:bg-blue-900/50' 
                            : 'bg-red-900/20';
                          content = (
                            <div 
                              className={`text-xs text-center ${isMyBooking ? 'text-blue-300' : 'text-red-300'}`}
                              onClick={() => isMyBooking && setCancelModal(booking)}
                            >
                              <div className="font-semibold">{isMyBooking ? '🎾 Yours' : '🔒'}</div>
                              <div className="text-gray-400 truncate text-[10px] sm:text-xs max-w-[70px]">{booking.bookedByName?.split(' ')[0]}</div>
                            </div>
                          );
                        } else if (pendingHold && !isMyHold) {
                          cellClass += 'bg-yellow-900/20';
                          content = (
                            <div className="text-xs text-yellow-300 text-center">
                              <div>⏳</div>
                              <div className="text-[10px]">Hold</div>
                            </div>
                          );
                        } else if (isSelected) {
                          cellClass += 'bg-green-900/50 cursor-pointer hover:bg-green-900/70';
                          content = (
                            <button
                              onClick={() => toggleSlotSelection(court, time)}
                              className="w-full text-xs text-green-300 font-semibold text-center"
                            >
                              <div>✓</div>
                              <div className="text-[10px] sm:text-xs">Selected</div>
                            </button>
                          );
                        } else if (canBook) {
                          cellClass += 'bg-gray-700/30 cursor-pointer hover:bg-green-900/30';
                          
                          // Calculate price for display
                          const slotPricing = settings ? calculateCourtBookingPrice({
                            court: court as any,
                            date: selectedDate,
                            startTime: time,
                            durationMinutes: settings.slotDurationMinutes,
                            settings,
                            isMember,
                            hasAnnualPass: false,
                            isVisitor: !isMember && !isAdmin,
                          }) : null;
                          
                          content = (
                            <button
                              onClick={() => toggleSlotSelection(court, time)}
                              className="w-full text-center"
                            >
                              <div className="text-green-400 font-semibold text-xs sm:text-sm">
                                {slotPricing?.isFree ? 'Free' : formatCentsToDisplay(slotPricing?.finalPrice || 0)}
                              </div>
                              <div className="text-gray-500 text-[10px] sm:text-xs">Select</div>
                            </button>
                          );
                        } else {
                          cellClass += 'bg-gray-900/30';
                          content = <span className="text-gray-600 text-xs">—</span>;
                        }

                        return (
                          <div key={court.id} className={cellClass}>
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && combinedPricing && settings && (
        <CheckoutModal
          isOpen={true}
          onClose={() => setShowCheckout(false)}
          type="court_booking"
          itemDetails={combinedItemDetails}
          pricing={combinedPricing}
          clubId={clubId}
          allSlots={allSlotsForCheckout}
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