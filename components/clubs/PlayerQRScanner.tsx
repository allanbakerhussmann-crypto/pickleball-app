/**
 * PlayerQRScanner - QR Code Scanner for Organizer Check-In
 *
 * Modal component for organizers to scan player QR codes at meetup check-in.
 * Uses the browser's MediaDevices API for camera access and jsQR for decoding.
 *
 * Features:
 * - Camera access with rear camera preference (mobile)
 * - QR code scanning using jsQR library
 * - Player verification display (name/photo)
 * - Cloud Function call to check in the scanned player
 * - Success/error states with clear feedback
 *
 * QR Data Format Expected:
 * { type: 'player_checkin', userId: 'xxx' }
 *
 * @version 07.60
 * @file components/clubs/PlayerQRScanner.tsx
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import { getUserProfile } from '../../services/firebase/users';
import type { UserProfile } from '../../types';
import type { CheckInPlayerInput, CheckInPlayerOutput } from '../../types/standingMeetup';

// Get functions instance for australia-southeast1 region
const functionsAU = getFunctions(getApp(), 'australia-southeast1');

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsAU, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}

// Import jsQR dynamically (loaded via CDN)
declare const jsQR: (
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' }
) => { data: string } | null;

export interface PlayerQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  standingMeetupId: string;
  occurrenceId: string; // "YYYY-MM-DD"
  onCheckInSuccess?: (userId: string, userName: string) => void;
}

type ScannerState = 'scanning' | 'verifying' | 'confirming' | 'processing' | 'success' | 'error';

interface ScannedPlayer {
  userId: string;
  profile: UserProfile | null;
}

export const PlayerQRScanner: React.FC<PlayerQRScannerProps> = ({
  isOpen,
  onClose,
  standingMeetupId,
  occurrenceId,
  onCheckInSuccess,
}) => {
  // State
  const [state, setState] = useState<ScannerState>('scanning');
  const [scannedPlayer, setScannedPlayer] = useState<ScannedPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);

      // Request camera with rear preference (for mobile)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);

      let errorMessage = 'Unable to access camera';
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access and try again.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      }

      setCameraError(errorMessage);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Scan QR code from video frame
  const scanFrame = useCallback(() => {
    if (state !== 'scanning' || !videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data for QR detection
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Check if jsQR is loaded
    if (typeof jsQR === 'function') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data) {
        // Debounce: don't process the same code repeatedly
        if (code.data !== lastScannedRef.current) {
          lastScannedRef.current = code.data;
          handleQRCode(code.data);
          return; // Don't continue scanning while processing
        }
      }
    }

    // Continue scanning
    animationRef.current = requestAnimationFrame(scanFrame);
  }, [state]);

  // Handle scanned QR code
  const handleQRCode = async (data: string) => {
    try {
      setState('verifying');
      setError(null);

      // Parse QR data
      let qrData: { type: string; userId: string };
      try {
        qrData = JSON.parse(data);
      } catch {
        setError('Invalid QR code format. Expected a player check-in QR code.');
        setState('error');
        return;
      }

      // Validate QR data structure
      if (qrData.type !== 'player_checkin' || !qrData.userId) {
        setError('This QR code is not a valid player check-in code.');
        setState('error');
        return;
      }

      // Look up user profile
      const profile = await getUserProfile(qrData.userId);

      setScannedPlayer({
        userId: qrData.userId,
        profile,
      });
      setState('confirming');
    } catch (err: any) {
      console.error('QR processing error:', err);
      setError('Failed to process QR code. Please try again.');
      setState('error');
    }
  };

  // Confirm check-in
  const confirmCheckIn = async () => {
    if (!scannedPlayer) return;

    setState('processing');
    setError(null);

    try {
      const checkInFn = httpsCallable<CheckInPlayerInput, CheckInPlayerOutput>(
        functionsAU,
        'standingMeetup_checkInPlayer'
      );

      await checkInFn({
        standingMeetupId,
        occurrenceId,
        playerUserId: scannedPlayer.userId,
      });

      // Success
      const playerName = scannedPlayer.profile?.displayName || 'Player';

      setSuccessMessage(`${playerName} checked in successfully!`);
      setState('success');

      // Notify parent
      onCheckInSuccess?.(scannedPlayer.userId, playerName);

      // Auto-reset to scan another after 2 seconds
      setTimeout(() => {
        resetScanner();
      }, 2000);
    } catch (err: any) {
      console.error('Check-in error:', err);

      // Parse error message
      let errorMessage = err.message || 'Failed to check in player';

      if (errorMessage.includes('NOT_PARTICIPANT')) {
        errorMessage = 'This player is not registered for this session.';
      } else if (errorMessage.includes('ALREADY_CHECKED_IN')) {
        errorMessage = 'This player has already checked in.';
      } else if (errorMessage.includes('SESSION_NOT_ACTIVE')) {
        errorMessage = 'This session is not currently active.';
      } else if (errorMessage.includes('SESSION_ALREADY_CLOSED')) {
        errorMessage = 'This session has already been closed.';
      } else if (errorMessage.includes('NOT_AUTHORIZED')) {
        errorMessage = 'You do not have permission to check in players.';
      } else if (errorMessage.includes('OCCURRENCE_NOT_FOUND')) {
        errorMessage = 'Session not found.';
      } else if (errorMessage.includes('MEETUP_NOT_FOUND')) {
        errorMessage = 'Meetup not found.';
      }

      setError(errorMessage);
      setState('error');
    }
  };

  // Reset scanner to scan another player
  const resetScanner = useCallback(() => {
    setScannedPlayer(null);
    setError(null);
    setSuccessMessage(null);
    lastScannedRef.current = null;
    setState('scanning');
  }, []);

  // Start/stop camera and scanning based on modal state
  useEffect(() => {
    if (isOpen && state === 'scanning') {
      startCamera();

      // Wait a moment for camera to initialize, then start scanning
      const timeout = setTimeout(() => {
        animationRef.current = requestAnimationFrame(scanFrame);
      }, 500);

      return () => {
        clearTimeout(timeout);
        stopCamera();
      };
    }

    return undefined;
  }, [isOpen, state, startCamera, stopCamera, scanFrame]);

  // Clean up on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetScanner();
    }
  }, [isOpen, stopCamera, resetScanner]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && state !== 'processing') {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Get display name for scanned player
  const getPlayerDisplayName = (): string => {
    if (!scannedPlayer?.profile) return 'Unknown Player';
    return scannedPlayer.profile.displayName || 'Player';
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-lime-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Scan Player QR</h2>
              <p className="text-gray-400 text-sm">Check in a registered player</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={state === 'processing'}
            className="text-gray-400 hover:text-white p-1 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Camera Error */}
          {cameraError && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-red-400 font-medium">Camera Error</p>
                  <p className="text-red-300 text-sm mt-1">{cameraError}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setCameraError(null);
                  startCamera();
                }}
                className="mt-3 w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Scanning State - Video Feed */}
          {(state === 'scanning' || state === 'verifying') && !cameraError && (
            <div className="space-y-4">
              {/* Video Container */}
              <div className="relative aspect-square bg-gray-950 rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Scanning Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Scanner Frame */}
                  <div className="w-64 h-64 relative">
                    {/* Corner markers */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-lime-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-lime-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-lime-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-lime-500 rounded-br-lg"></div>

                    {/* Scanning line animation */}
                    <div className="absolute inset-x-0 h-0.5 bg-lime-500 animate-pulse" style={{ top: '50%' }}></div>
                  </div>
                </div>

                {/* Verifying overlay */}
                {state === 'verifying' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-lime-500/30 border-t-lime-500 rounded-full animate-spin mx-auto"></div>
                      <p className="text-white mt-3 font-medium">Verifying player...</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-gray-400 text-sm text-center">
                Point the camera at a player's QR code to check them in
              </p>
            </div>
          )}

          {/* Confirming State - Player Info */}
          {state === 'confirming' && scannedPlayer && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-xl p-6 text-center">
                {/* Player Avatar */}
                <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
                  {scannedPlayer.profile?.photoURL ? (
                    <img
                      src={scannedPlayer.profile.photoURL}
                      alt={getPlayerDisplayName()}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>

                {/* Player Name */}
                <h3 className="text-xl font-bold text-white mb-1">{getPlayerDisplayName()}</h3>

                {/* Email (if available) */}
                {scannedPlayer.profile?.email && (
                  <p className="text-gray-400 text-sm">{scannedPlayer.profile.email}</p>
                )}

                {/* DUPR Rating (if available) */}
                {scannedPlayer.profile?.duprDoublesRating && (
                  <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-blue-900/30 rounded-full">
                    <span className="text-blue-400 text-sm font-medium">DUPR</span>
                    <span className="text-white font-bold">{scannedPlayer.profile.duprDoublesRating.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <p className="text-gray-400 text-sm text-center">
                Confirm to check in this player
              </p>
            </div>
          )}

          {/* Processing State */}
          {state === 'processing' && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 border-4 border-lime-500/30 border-t-lime-500 rounded-full animate-spin mx-auto"></div>
              <p className="text-white mt-4 font-medium">Checking in player...</p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="py-8 text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-lime-500/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Checked In!</h3>
              <p className="text-lime-400">{successMessage}</p>
              <p className="text-gray-500 text-sm mt-4">Scanning for next player...</p>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="py-8 text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Check-In Failed</h3>
              <p className="text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-700 bg-gray-800">
          {/* Scanning/Verifying - just Cancel */}
          {(state === 'scanning' || state === 'verifying') && (
            <button
              onClick={onClose}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
          )}

          {/* Confirming - Confirm and Cancel */}
          {state === 'confirming' && (
            <div className="flex gap-3">
              <button
                onClick={resetScanner}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Scan Again
              </button>
              <button
                onClick={confirmCheckIn}
                className="flex-1 bg-lime-600 hover:bg-lime-500 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Check In
              </button>
            </div>
          )}

          {/* Processing - disabled button */}
          {state === 'processing' && (
            <button
              disabled
              className="w-full bg-gray-600 text-gray-400 py-3 rounded-lg font-semibold cursor-not-allowed"
            >
              Processing...
            </button>
          )}

          {/* Success - just shows info, auto-resets */}
          {state === 'success' && (
            <button
              onClick={resetScanner}
              className="w-full bg-lime-600 hover:bg-lime-500 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Scan Another Player
            </button>
          )}

          {/* Error - Try Again and Cancel */}
          {state === 'error' && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
              <button
                onClick={resetScanner}
                className="flex-1 bg-lime-600 hover:bg-lime-500 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerQRScanner;
