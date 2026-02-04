/**
 * SessionCheckInQR - QR Code Display for Meetup Check-In
 *
 * Displays a QR code that registered players scan to check in at the venue.
 * Features:
 * - Large QR code for easy scanning
 * - Print functionality (QR and info only)
 * - Download as PNG
 * - Full-screen toggle for tablet display
 *
 * @version 07.59
 * @file components/clubs/SessionCheckInQR.tsx
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';

export interface SessionCheckInQRProps {
  standingMeetupId: string;
  occurrenceId: string;  // "YYYY-MM-DD"
  meetupTitle: string;
  sessionDate: string;   // Formatted date like "Monday 3 Feb 2025"
  sessionTime: string;   // e.g., "6:00 PM - 8:00 PM"
  onClose?: () => void;
}

export const SessionCheckInQR: React.FC<SessionCheckInQRProps> = ({
  standingMeetupId,
  occurrenceId,
  meetupTitle,
  sessionDate,
  sessionTime,
  onClose,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printableRef = useRef<HTMLDivElement>(null);

  // Generate the check-in URL
  const checkInUrl = `${window.location.origin}/#/checkin/${standingMeetupId}/${occurrenceId}`;

  // Calculate QR size based on screen/mode
  const qrSize = isFullScreen ? Math.min(window.innerWidth, window.innerHeight) * 0.6 : 300;

  // Generate QR code
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // Generate display QR code
    QRCode.toDataURL(checkInUrl, {
      width: qrSize,
      margin: 2,
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

    // Generate canvas for download (larger size)
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, checkInUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H'
      }).catch((err: Error) => {
        console.error('Failed to generate QR canvas:', err);
      });
    }
  }, [checkInUrl, qrSize]);

  // Handle print - opens print dialog with just the QR and info
  const handlePrint = useCallback(() => {
    if (!printableRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print the QR code');
      return;
    }

    const content = printableRef.current.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Check-In QR - ${meetupTitle}</title>
          <style>
            body {
              margin: 0;
              padding: 40px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              box-sizing: border-box;
            }
            .qr-container {
              text-align: center;
              padding: 40px;
              border: 2px solid #000;
              border-radius: 16px;
            }
            .title {
              font-size: 28px;
              font-weight: bold;
              margin-bottom: 8px;
            }
            .subtitle {
              font-size: 20px;
              color: #333;
              margin-bottom: 24px;
            }
            .qr-wrapper {
              display: flex;
              justify-content: center;
              margin-bottom: 24px;
            }
            .qr-wrapper img {
              border: 8px solid #000;
              border-radius: 8px;
            }
            .info {
              font-size: 18px;
              color: #666;
              margin-top: 8px;
            }
            .scan-text {
              font-size: 16px;
              color: #84cc16;
              font-weight: 600;
              margin-top: 16px;
            }
            @media print {
              body { padding: 20px; }
              .qr-container { border: 3px solid #000; }
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }, [meetupTitle]);

  // Handle download - saves QR as PNG
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a new canvas with padding and text
    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    const padding = 40;
    const textHeight = 120;
    exportCanvas.width = canvas.width + (padding * 2);
    exportCanvas.height = canvas.height + (padding * 2) + textHeight;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Check-In', exportCanvas.width / 2, padding + 24);

    // Draw meetup title
    ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(meetupTitle, exportCanvas.width / 2, padding + 52);

    // Draw date/time
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText(`${sessionDate} | ${sessionTime}`, exportCanvas.width / 2, padding + 76);

    // Draw QR code
    ctx.drawImage(canvas, padding, padding + textHeight - 20);

    // Draw scan instruction
    ctx.fillStyle = '#84cc16';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Scan to Check In', exportCanvas.width / 2, exportCanvas.height - 20);

    // Download
    const link = document.createElement('a');
    link.download = `checkin-qr-${occurrenceId}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [meetupTitle, sessionDate, sessionTime, occurrenceId]);

  // Toggle full screen
  const toggleFullScreen = useCallback(() => {
    setIsFullScreen(prev => !prev);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        isFullScreen ? 'bg-white' : 'bg-black/80 p-4'
      }`}
      onClick={isFullScreen ? undefined : onClose}
    >
      <div
        className={`${
          isFullScreen
            ? 'w-full h-full flex flex-col items-center justify-center'
            : 'bg-gray-900 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl overflow-hidden'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header - only show when not fullscreen */}
        {!isFullScreen && (
          <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-lime-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">Check-In QR</h2>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* QR Code Content */}
        <div className={`${isFullScreen ? '' : 'p-6'}`}>
          {/* Printable Area - white background for printing */}
          <div
            ref={printableRef}
            className={`bg-white rounded-xl ${isFullScreen ? 'p-8' : 'p-6'} text-center`}
          >
            <div className="qr-container">
              <h3 className={`title font-bold text-gray-900 ${isFullScreen ? 'text-3xl mb-2' : 'text-xl mb-1'}`}>
                Check-In
              </h3>
              <p className={`subtitle text-gray-700 ${isFullScreen ? 'text-xl mb-6' : 'text-lg mb-4'}`}>
                {meetupTitle}
              </p>

              {/* QR Code */}
              <div className="qr-wrapper flex justify-center mb-4">
                {isLoading ? (
                  <div
                    className="flex items-center justify-center border-4 border-black rounded-lg"
                    style={{ width: qrSize, height: qrSize }}
                  >
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : error ? (
                  <div
                    className="flex items-center justify-center border-4 border-black rounded-lg text-red-500 p-4"
                    style={{ width: qrSize, height: qrSize }}
                  >
                    {error}
                  </div>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Check-in QR Code"
                    style={{
                      width: qrSize,
                      height: qrSize,
                      border: '4px solid #000',
                      borderRadius: '8px',
                    }}
                  />
                ) : null}
              </div>

              {/* Session Info */}
              <p className={`info text-gray-600 ${isFullScreen ? 'text-lg' : 'text-sm'}`}>
                {sessionDate}
              </p>
              <p className={`info text-gray-500 ${isFullScreen ? 'text-lg' : 'text-sm'}`}>
                {sessionTime}
              </p>
              <p className={`scan-text text-lime-600 font-semibold mt-4 ${isFullScreen ? 'text-lg' : 'text-sm'}`}>
                Scan to Check In
              </p>
            </div>
          </div>

          {/* Hidden Canvas for Download */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Action Buttons */}
          <div className={`flex gap-3 mt-4 ${isFullScreen ? 'justify-center' : ''}`}>
            <button
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex-1 max-w-[150px] flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <button
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="flex-1 max-w-[150px] flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <button
              onClick={toggleFullScreen}
              className="flex-1 max-w-[150px] flex items-center justify-center gap-2 bg-lime-500 hover:bg-lime-600 text-black py-3 px-4 rounded-lg font-semibold transition-colors"
            >
              {isFullScreen ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Exit
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Full Screen
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionCheckInQR;
