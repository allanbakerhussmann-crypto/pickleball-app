/**
 * Checkout System - Main Entry Point
 * 
 * Universal checkout system for all product types.
 * 
 * USAGE:
 * 
 * import { CheckoutModal, useCheckout, calculateCourtBookingPrice } from './checkout';
 * 
 * // In your component:
 * const [showCheckout, setShowCheckout] = useState(false);
 * const pricing = calculateCourtBookingPrice({ court, date, startTime, ... });
 * 
 * <CheckoutModal
 *   isOpen={showCheckout}
 *   onClose={() => setShowCheckout(false)}
 *   type="court_booking"
 *   itemDetails={{ courtId, courtName, date, startTime, endTime }}
 *   pricing={pricing}
 *   clubId={clubId}
 *   onSuccess={(checkout) => { createBooking(); }}
 * />
 * 
 * FILE LOCATION: components/checkout/index.ts
 */

// ============================================
// COMPONENTS
// ============================================

export { CheckoutModal } from './CheckoutModal';
export type { CheckoutModalProps } from './CheckoutModal';

export { CheckoutTimer } from './CheckoutTimer';
export type { CheckoutTimerProps } from './CheckoutTimer';

export { PriceBreakdown } from './PriceBreakdown';
export type { PriceBreakdownProps } from './PriceBreakdown';

export { PaymentMethodSelector } from './PaymentMethodSelector';
export type { PaymentMethodSelectorProps } from './PaymentMethodSelector';

// ============================================
// HOOKS
// ============================================

export { useCheckout } from '../../hooks/useCheckout';
export type { 
  UseCheckoutOptions, 
  UseCheckoutReturn,
  WalletData,
  AnnualPassData,
} from '../../hooks/useCheckout';

// ============================================
// SERVICES
// ============================================

// Checkout service
export {
  createPendingCheckout,
  confirmCheckout,
  cancelCheckout,
  getCheckout,
  getUserPendingCheckouts,
  getPendingCourtHolds,
  subscribeToCheckout,
  expireOldCheckouts,
  cleanupExpiredCheckouts,
  checkCourtBookingConflict,
  HOLD_TIMES,
} from '../../services/firebase/checkout';

export type {
  CheckoutItem,
  CheckoutItemType,
  CheckoutItemDetails,
  CheckoutStatus,
  PaymentMethod,
  CreateCheckoutInput,
  ConfirmCheckoutInput,
} from '../../services/firebase/checkout';

// Pricing service
export {
  calculateCourtBookingPrice,
  calculateTournamentEntryPrice,
  calculateLeagueRegistrationPrice,
  calculateMeetupFeePrice,
  calculateClubMembershipPrice,
  calculateVisitorFeePrice,
  calculatePrice,
  formatCentsToDisplay,
  formatPriceCalculation,
} from '../../services/firebase/pricing';

export type {
  ProductType,
  PriceCalculation,
  PriceLineItem,
  PriceInput,
  CourtBookingPriceInput,
  TournamentEntryPriceInput,
  LeagueRegistrationPriceInput,
  MeetupFeePriceInput,
  ClubMembershipPriceInput,
  VisitorFeePriceInput,
} from '../../services/firebase/pricing';