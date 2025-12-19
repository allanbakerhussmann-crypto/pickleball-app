/**
 * PayForOthersSection Component
 * 
 * Allows users to pay for additional people:
 * - Option A: Add guests (non-members) by entering their name
 * - Option B: Search and select existing members
 * 
 * Used in checkout modals for meetups, court bookings, etc.
 * 
 * FILE LOCATION: components/checkout/PayForOthersSection.tsx
 */

import React, { useState } from 'react';
import type { 
  PaymentGuest, 
  PaymentForMember, 
  PayForOthersData,
  GuestRelationship,
} from '../../types/payForOthers';
import { formatRelationship, validateGuest, calculatePaymentSummary } from '../../types/payForOthers';
import { MemberSearchModal } from './MemberSearchModal';

// ============================================
// TYPES
// ============================================

interface PayForOthersSectionProps {
  /** Current data */
  data: PayForOthersData;
  /** Called when data changes */
  onChange: (data: PayForOthersData) => void;
  /** Price per person in cents */
  pricePerPerson: number;
  /** Platform fee percentage */
  platformFeePercent?: number;
  /** Maximum total people allowed (including self) */
  maxPeople?: number;
  /** Current user's name */
  currentUserName: string;
  /** Disable editing */
  disabled?: boolean;
}

// ============================================
// HELPER: Format currency
// ============================================

const formatCurrency = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

// ============================================
// COMPONENT
// ============================================

export const PayForOthersSection: React.FC<PayForOthersSectionProps> = ({
  data,
  onChange,
  pricePerPerson,
  platformFeePercent = 5,
  maxPeople,
  currentUserName,
  disabled = false,
}) => {
  // Local state for adding guests
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestRelationship, setNewGuestRelationship] = useState<GuestRelationship>('friend');
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  
  // Member search modal
  const [showMemberSearch, setShowMemberSearch] = useState(false);

  // Calculate summary
  const summary = calculatePaymentSummary(data, pricePerPerson, platformFeePercent);
  
  // Check if at max capacity
  const atMaxCapacity = maxPeople ? summary.totalPeople >= maxPeople : false;

  // ============================================
  // HANDLERS
  // ============================================

  const handleToggleSelf = () => {
    if (disabled) return;
    onChange({
      ...data,
      includeSelf: !data.includeSelf,
    });
  };

  const handleAddGuest = () => {
    setGuestError(null);
    
    const guest: PaymentGuest = {
      name: newGuestName.trim(),
      relationship: newGuestRelationship,
      email: newGuestEmail.trim() || undefined,
    };
    
    const error = validateGuest(guest);
    if (error) {
      setGuestError(error);
      return;
    }
    
    onChange({
      ...data,
      guests: [...data.guests, guest],
    });
    
    // Reset form
    setNewGuestName('');
    setNewGuestRelationship('friend');
    setNewGuestEmail('');
    setShowAddGuest(false);
  };

  const handleRemoveGuest = (index: number) => {
    if (disabled) return;
    const newGuests = [...data.guests];
    newGuests.splice(index, 1);
    onChange({
      ...data,
      guests: newGuests,
    });
  };

  const handleAddMember = (member: PaymentForMember) => {
    // Check if already added
    if (data.members.some(m => m.odUserId === member.odUserId)) {
      return;
    }
    onChange({
      ...data,
      members: [...data.members, member],
    });
    setShowMemberSearch(false);
  };

  const handleRemoveMember = (userId: string) => {
    if (disabled) return;
    onChange({
      ...data,
      members: data.members.filter(m => m.odUserId !== userId),
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-4">
      {/* Self Inclusion */}
      <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm">
            {currentUserName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-white font-medium">{currentUserName}</p>
            <p className="text-gray-500 text-xs">You</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-green-400 font-medium">{formatCurrency(pricePerPerson)}</span>
          <button
            onClick={handleToggleSelf}
            disabled={disabled}
            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
              data.includeSelf
                ? 'bg-green-600 border-green-600 text-white'
                : 'border-gray-600 text-transparent hover:border-gray-500'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {data.includeSelf && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Section Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-700"></div>
        <span className="text-gray-500 text-sm">Add others to your booking</span>
        <div className="flex-1 h-px bg-gray-700"></div>
      </div>

      {/* Added Guests List */}
      {data.guests.length > 0 && (
        <div className="space-y-2">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">
            Guests (Non-Members)
          </p>
          {data.guests.map((guest, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium">{guest.name}</p>
                  <p className="text-gray-500 text-xs">{formatRelationship(guest.relationship)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 font-medium">{formatCurrency(pricePerPerson)}</span>
                {!disabled && (
                  <button
                    onClick={() => handleRemoveGuest(index)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Added Members List */}
      {data.members.length > 0 && (
        <div className="space-y-2">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">
            Existing Members
          </p>
          {data.members.map((member) => (
            <div 
              key={member.odUserId}
              className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-purple-700/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center overflow-hidden">
                  {member.photoURL ? (
                    <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-purple-400 font-bold text-sm">
                      {member.odUserName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-white font-medium">{member.odUserName}</p>
                  <p className="text-purple-400 text-xs">Member • Will be auto-RSVP'd</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 font-medium">{formatCurrency(pricePerPerson)}</span>
                {!disabled && (
                  <button
                    onClick={() => handleRemoveMember(member.odUserId)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Guest Form */}
      {showAddGuest && !atMaxCapacity && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-white font-medium">Add Guest</h4>
            <button
              onClick={() => setShowAddGuest(false)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name *</label>
            <input
              type="text"
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              placeholder="Guest's full name"
              className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Relationship</label>
            <select
              value={newGuestRelationship}
              onChange={(e) => setNewGuestRelationship(e.target.value as GuestRelationship)}
              className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none"
            >
              <option value="child">Child</option>
              <option value="spouse">Spouse/Partner</option>
              <option value="friend">Friend</option>
              <option value="family">Family Member</option>
              <option value="colleague">Colleague</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email (optional)</label>
            <input
              type="email"
              value={newGuestEmail}
              onChange={(e) => setNewGuestEmail(e.target.value)}
              placeholder="For receipt (optional)"
              className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none"
            />
          </div>
          
          {guestError && (
            <p className="text-red-400 text-sm">{guestError}</p>
          )}
          
          <button
            onClick={handleAddGuest}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-medium"
          >
            Add Guest
          </button>
        </div>
      )}

      {/* Action Buttons */}
      {!disabled && !atMaxCapacity && !showAddGuest && (
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddGuest(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 border-dashed transition-colors"
          >
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Guest
          </button>
          
          <button
            onClick={() => setShowMemberSearch(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 border-dashed transition-colors"
          >
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find Member
          </button>
        </div>
      )}

      {/* Max Capacity Warning */}
      {atMaxCapacity && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 text-center">
          <p className="text-yellow-400 text-sm">
            Maximum capacity reached ({maxPeople} people)
          </p>
        </div>
      )}

      {/* Summary */}
      {summary.totalPeople > 0 && (
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">
              {summary.totalPeople} {summary.totalPeople === 1 ? 'person' : 'people'} × {formatCurrency(pricePerPerson)}
            </span>
            <span className="text-white">{formatCurrency(summary.subtotal)}</span>
          </div>
          
          {platformFeePercent > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Platform fee ({platformFeePercent}%)</span>
              <span className="text-white">{formatCurrency(summary.platformFee)}</span>
            </div>
          )}
          
          <div className="h-px bg-gray-700 my-2"></div>
          
          <div className="flex justify-between">
            <span className="text-white font-bold">Total</span>
            <span className="text-green-400 font-bold text-lg">{formatCurrency(summary.total)}</span>
          </div>
          
          {summary.names.length > 0 && (
            <p className="text-gray-500 text-xs mt-2">
              Paying for: {summary.names.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Member Search Modal */}
      <MemberSearchModal
        isOpen={showMemberSearch}
        onClose={() => setShowMemberSearch(false)}
        onSelect={handleAddMember}
        excludeUserIds={[
          ...data.members.map(m => m.odUserId),
        ]}
      />
    </div>
  );
};

export default PayForOthersSection;