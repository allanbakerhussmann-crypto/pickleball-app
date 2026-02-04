/**
 * MyCheckInQR Component
 *
 * Displays the player's personal QR code that organizers can scan
 * to check them into meetup sessions.
 *
 * Features:
 * - Generates QR code with player check-in data
 * - Print functionality for physical copy
 * - Download as PNG image
 * - Dark theme styling
 *
 * @version 07.59
 * @file components/profile/MyCheckInQR.tsx
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';

// ============================================
// COMPONENT
// ============================================

export const MyCheckInQR: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate the QR code value as JSON
  const qrValue = currentUser?.uid
    ? JSON.stringify({ type: 'player_checkin', userId: currentUser.uid })
    : '';

  // Generate QR code on mount/value change
  useEffect(() => {
    if (!qrValue) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Generate display QR code
    QRCode.toDataURL(qrValue, {
      width: 200,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    })
      .then((url: string) => {
        setQrDataUrl(url);
        setIsLoading(false);
      })
      .catch((err: Error) => {
        console.error('Failed to generate QR code:', err);
        setError('Failed to generate QR code');
        setIsLoading(false);
      });

    // Generate download canvas (larger)
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrValue, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H'
      }).catch((err: Error) => {
        console.error('Failed to generate QR canvas:', err);
      });
    }
  }, [qrValue]);

  // ============================================
  // HANDLERS
  // ============================================

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas not found for download');
      return;
    }

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `checkin-qr-${userProfile?.displayName?.replace(/\s+/g, '-').toLowerCase() || 'player'}.png`;
    link.href = url;
    link.click();
  }, [userProfile?.displayName]);

  // ============================================
  // RENDER - NOT LOGGED IN
  // ============================================

  if (!currentUser) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="text-center text-gray-400">
          <p>Please log in to view your check-in QR code.</p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            background: white !important;
            padding: 40px;
            border-radius: 16px;
          }
          .print-area .qr-name {
            color: black !important;
          }
          .print-area .qr-instructions {
            color: #666 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-lime-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-white">My Check-In QR Code</h3>
            <p className="text-xs text-gray-400">For meetup check-in</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* QR Code Display Area - Printable */}
          <div className="print-area bg-gray-900 rounded-xl p-6 mb-6">
            {/* Player Name */}
            <p className="qr-name text-xl font-bold text-white text-center mb-4">
              {userProfile?.displayName || 'Player'}
            </p>

            {/* QR Code */}
            <div className="flex justify-center mb-4">
              <div className="bg-white p-4 rounded-xl">
                {isLoading ? (
                  <div className="w-[200px] h-[200px] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : error ? (
                  <div className="w-[200px] h-[200px] flex items-center justify-center text-red-500 text-sm text-center p-4">
                    {error}
                  </div>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Check-in QR Code"
                    width={200}
                    height={200}
                    style={{ display: 'block' }}
                  />
                ) : null}
              </div>
            </div>

            {/* Instructions */}
            <p className="qr-instructions text-sm text-gray-400 text-center">
              Show this QR to the organizer at check-in
            </p>
          </div>

          {/* Hidden Canvas for Download */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Action Buttons */}
          <div className="no-print flex gap-3">
            <button
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>

            <button
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="flex-1 py-3 bg-lime-600 hover:bg-lime-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PNG
            </button>
          </div>

          {/* Info Note */}
          <div className="no-print mt-4 p-3 bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-400">
              This QR code contains your unique player ID. Organizers can scan it to quickly check you into meetup sessions.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default MyCheckInQR;
