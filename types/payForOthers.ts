/**
 * Pay For Others - Type Definitions
 * 
 * Types for the "Pay for Others" feature that allows users to:
 * - Add non-member guests (kids, friends without accounts)
 * - Pay for existing members (friends with accounts)
 * 
 * FILE LOCATION: types/payForOthers.ts
 */

// ============================================
// GUEST TYPES (Non-Members)
// ============================================

export type GuestRelationship = 'child' | 'spouse' | 'friend' | 'family' | 'colleague' | 'other';

/**
 * A guest is someone without an account who is being paid for
 */
export interface PaymentGuest {
  /** Guest's name (required) */
  name: string;
  /** Relationship to the payer */
  relationship: GuestRelationship;
  /** Optional email for receipt */
  email?: string;
  /** Optional phone */
  phone?: string;
  /** Any notes (e.g., "vegetarian", "beginner") */
  notes?: string;
}

// ============================================
// MEMBER PAYMENT TYPES
// ============================================

/**
 * A member being paid for by someone else
 */
export interface PaymentForMember {
  /** The member's user ID */
  odUserId: string;
  /** Display name */
  odUserName: string;
  /** Email (for notification) */
  email?: string;
  /** Profile photo URL */
  photoURL?: string;
}

// ============================================
// COMBINED PAYMENT DATA
// ============================================

/**
 * Full payment data including self, guests, and members
 */
export interface PayForOthersData {
  /** Include self in the booking? (usually true) */
  includeSelf: boolean;
  /** Non-member guests */
  guests: PaymentGuest[];
  /** Existing members being paid for */
  members: PaymentForMember[];
}

/**
 * Summary of who's being paid for
 */
export interface PaymentSummary {
  /** Total number of people */
  totalPeople: number;
  /** Self included? */
  selfIncluded: boolean;
  /** Number of guests */
  guestCount: number;
  /** Number of members */
  memberCount: number;
  /** Price per person (in cents) */
  pricePerPerson: number;
  /** Subtotal before fees (in cents) */
  subtotal: number;
  /** Platform fee (in cents) */
  platformFee: number;
  /** Total to charge (in cents) */
  total: number;
  /** List of all names */
  names: string[];
}

// ============================================
// ENHANCED RSVP TYPE
// ============================================

/**
 * Extended RSVP with payment for others support
 */
export interface EnhancedMeetupRSVP {
  /** User ID of the person who RSVP'd */
  userId: string;
  /** User's display name */
  userName?: string;
  /** RSVP status */
  status: 'going' | 'maybe';
  /** When the RSVP was created */
  createdAt: number;
  
  // Payment info
  paymentStatus?: 'not_required' | 'pending' | 'paid' | 'refunded' | 'waived';
  amountPaid?: number;
  paidAt?: number;
  stripePaymentId?: string;
  
  // If someone else paid for this user
  paidByUserId?: string;
  paidByUserName?: string;
  
  // If this user paid for others
  paidForGuests?: PaymentGuest[];
  paidForMemberIds?: string[];
  totalPaid?: number;
  headcount?: number;
}

// ============================================
// STRIPE METADATA
// ============================================

/**
 * Metadata sent to Stripe for pay-for-others transactions
 */
export interface PayForOthersStripeMetadata {
  type: 'meetup' | 'court_booking' | 'tournament' | 'league';
  itemId: string;
  payerId: string;
  payerName: string;
  headcount: string;
  includeSelf: string;
  guestNames?: string;
  guestRelationships?: string;
  memberIds?: string;
  memberNames?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate payment summary
 */
export function calculatePaymentSummary(
  data: PayForOthersData,
  pricePerPerson: number,
  platformFeePercent: number = 5
): PaymentSummary {
  const selfCount = data.includeSelf ? 1 : 0;
  const guestCount = data.guests.length;
  const memberCount = data.members.length;
  const totalPeople = selfCount + guestCount + memberCount;
  
  const subtotal = totalPeople * pricePerPerson;
  const platformFee = Math.round(subtotal * (platformFeePercent / 100));
  const total = subtotal + platformFee;
  
  const names: string[] = [];
  if (data.includeSelf) names.push('You');
  data.guests.forEach(g => names.push(g.name));
  data.members.forEach(m => names.push(m.odUserName));
  
  return {
    totalPeople,
    selfIncluded: data.includeSelf,
    guestCount,
    memberCount,
    pricePerPerson,
    subtotal,
    platformFee,
    total,
    names,
  };
}

/**
 * Format guest relationship for display
 */
export function formatRelationship(relationship: GuestRelationship): string {
  const labels: Record<GuestRelationship, string> = {
    child: 'Child',
    spouse: 'Spouse/Partner',
    friend: 'Friend',
    family: 'Family Member',
    colleague: 'Colleague',
    other: 'Other',
  };
  return labels[relationship] || 'Guest';
}

/**
 * Validate guest data
 */
export function validateGuest(guest: Partial<PaymentGuest>): string | null {
  if (!guest.name || guest.name.trim().length < 2) {
    return 'Guest name must be at least 2 characters';
  }
  if (!guest.relationship) {
    return 'Please select a relationship';
  }
  if (guest.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) {
    return 'Invalid email address';
  }
  return null;
}