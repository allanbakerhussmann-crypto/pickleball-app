/**
 * OrganizerAgreementModal Component V07.05
 *
 * Displays the full Organiser Terms & Score Reporting Agreement
 * with mandatory checkboxes for acceptance.
 *
 * Features:
 * - Scrollable agreement text (18 sections)
 * - 3 required checkboxes (Main, Integrity, Privacy)
 * - "I Agree" button disabled until all checked
 * - Two modes: 'request' (new applicants) or 'existing' (blocked organizers)
 *
 * FILE LOCATION: components/shared/OrganizerAgreementModal.tsx
 */

import React, { useState, useRef, useEffect } from 'react';
import { ORGANIZER_AGREEMENT } from '../../constants/organizerAgreement';
import type { OrganizerAgreement } from '../../types';
import { ModalShell } from './ModalShell';

interface OrganizerAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (agreement: OrganizerAgreement) => void;
  mode: 'request' | 'existing';
}

export const OrganizerAgreementModal: React.FC<OrganizerAgreementModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  mode,
}) => {
  const [mainAcceptance, setMainAcceptance] = useState(false);
  const [integrityConfirmation, setIntegrityConfirmation] = useState(false);
  const [privacyConfirmation, setPrivacyConfirmation] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMainAcceptance(false);
      setIntegrityConfirmation(false);
      setPrivacyConfirmation(false);
      setHasScrolledToBottom(false);
    }
  }, [isOpen]);

  // Check if scrolled to bottom (or content fits without scrolling)
  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // Consider "scrolled to bottom" when within 100px of bottom, or content fits without scrolling
      if (scrollHeight <= clientHeight || scrollHeight - scrollTop - clientHeight < 100) {
        setHasScrolledToBottom(true);
      }
    }
  };

  // Check scroll position when modal opens and content renders
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure content has rendered
      const timer = setTimeout(checkScrollPosition, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Track scroll to encourage reading
  const handleScroll = () => {
    checkScrollPosition();
  };

  const allChecked = mainAcceptance && integrityConfirmation && privacyConfirmation;
  const canAccept = allChecked && hasScrolledToBottom;

  const handleAccept = () => {
    if (!canAccept) return;

    const agreement: OrganizerAgreement = {
      version: ORGANIZER_AGREEMENT.version,
      acceptedAt: Date.now(),
      acceptedCheckboxes: {
        mainAcceptance: true,
        integrityConfirmation: true,
        privacyConfirmation: true,
      },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    onAccept(agreement);
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl" className="flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                {mode === 'existing' ? 'Agreement Update Required' : 'Organiser Agreement'}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {ORGANIZER_AGREEMENT.title} • Version {ORGANIZER_AGREEMENT.version}
              </p>
            </div>
            {mode === 'request' && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {mode === 'existing' && (
            <div className="mt-3 p-3 bg-amber-900/30 border border-amber-600/30 rounded-lg">
              <p className="text-amber-400 text-sm">
                Our organiser agreement has been updated. Please review and accept the new terms to continue using organiser features.
              </p>
            </div>
          )}
        </div>

        {/* Scrollable Agreement Content */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 min-h-0"
        >
          <div className="space-y-6">
            {ORGANIZER_AGREEMENT.sections.map((section, index) => (
              <div key={index} className="space-y-2">
                <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                <div className="space-y-2">
                  {section.content.map((paragraph, pIndex) => (
                    <p key={pIndex} className="text-sm text-gray-300 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Scroll indicator */}
          {!hasScrolledToBottom && (
            <div className="sticky bottom-0 left-0 right-0 py-2 bg-gradient-to-t from-gray-900 via-gray-900/95 to-transparent text-center">
              <p className="text-xs text-gray-500">
                Scroll to read the full agreement
              </p>
            </div>
          )}
        </div>

        {/* Checkboxes and Accept Button */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-700 flex-shrink-0 space-y-3 sm:space-y-4 bg-gray-800/50 max-h-[55dvh] overflow-y-auto">
          {/* Main Acceptance */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={mainAcceptance}
                onChange={(e) => setMainAcceptance(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
              {ORGANIZER_AGREEMENT.checkboxes.main}
            </span>
          </label>

          {/* Integrity Confirmation */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={integrityConfirmation}
                onChange={(e) => setIntegrityConfirmation(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
              {ORGANIZER_AGREEMENT.checkboxes.integrity}
            </span>
          </label>

          {/* Privacy Confirmation */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={privacyConfirmation}
                onChange={(e) => setPrivacyConfirmation(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
              {ORGANIZER_AGREEMENT.checkboxes.privacy}
            </span>
          </label>

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-3 pt-2">
            {mode === 'request' && (
              <button
                onClick={onClose}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleAccept}
              disabled={!canAccept}
              className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                canAccept
                  ? 'bg-lime-600 hover:bg-lime-500 text-black'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {!hasScrolledToBottom
                ? 'Read agreement first'
                : !allChecked
                ? 'Accept all terms'
                : 'I Agree'}
            </button>
          </div>

          {/* Version info */}
          <p className="text-xs text-gray-500 text-center pb-1">
            Effective: {ORGANIZER_AGREEMENT.effectiveDate} • v{ORGANIZER_AGREEMENT.version}
          </p>
        </div>
      </ModalShell>
  );
};

export default OrganizerAgreementModal;
