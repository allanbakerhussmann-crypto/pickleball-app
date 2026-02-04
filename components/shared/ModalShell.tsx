/**
 * ModalShell - Mobile-safe modal wrapper for Android, iOS and Capacitor
 *
 * Handles:
 * - Full-screen backdrop with click-to-close
 * - Safe area padding (iOS notch/home indicator, Android nav bar)
 * - dvh viewport units for keyboard-aware sizing
 * - Body scroll locking (prevents iOS Safari bounce)
 * - Escape key to close
 * - visualViewport resize for Android keyboard
 *
 * Does NOT impose internal layout - children control header/content/footer.
 *
 * @version 07.58
 * @file components/shared/ModalShell.tsx
 */

import React, { useEffect, useRef, useCallback } from 'react';

interface ModalShellProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler (called on backdrop click and Escape key) */
  onClose: () => void;
  /** Maximum width class (default: 'max-w-md') */
  maxWidth?: string;
  /** Z-index class (default: 'z-50') */
  zIndex?: string;
  /** Whether backdrop click closes modal (default: true) */
  closeOnBackdrop?: boolean;
  /** Additional className for the modal card */
  className?: string;
  /** Content */
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  maxWidth = 'max-w-md',
  zIndex = 'z-50',
  closeOnBackdrop = true,
  className = '',
  children,
}) => {
  const scrollYRef = useRef(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when modal opens
  useEffect(() => {
    if (isOpen) {
      scrollYRef.current = window.scrollY;
      document.documentElement.style.setProperty(
        '--scroll-y',
        `${scrollYRef.current}px`
      );
      document.body.classList.add('modal-open');
    }

    return () => {
      if (isOpen) {
        document.body.classList.remove('modal-open');
        window.scrollTo(0, scrollYRef.current);
      }
    };
  }, [isOpen]);

  // Escape key handler
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleEscape]);

  // Android keyboard: adjust overlay padding when visualViewport shrinks
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      const el = overlayRef.current;
      if (!el) return;

      const offset = window.innerHeight - vv.height;
      if (offset > 50) {
        // Keyboard is open - add extra bottom padding
        el.style.paddingBottom = `${offset + 16}px`;
      } else {
        // Keyboard closed - revert to CSS default
        el.style.paddingBottom = '';
      }
    };

    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndex} overflow-y-auto`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Scrollable centering wrapper with safe-area padding */}
      <div
        ref={overlayRef}
        className="modal-overlay relative flex items-center justify-center"
      >
        {/* Modal card */}
        <div
          className={`
            relative w-full ${maxWidth}
            bg-gray-800 rounded-xl border border-gray-700
            shadow-2xl overflow-hidden my-auto
            ${className}
          `.trim()}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
