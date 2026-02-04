/**
 * Type declarations for qrcode.react
 *
 * This module is loaded via CDN (esm.sh) and provides QR code generation components.
 *
 * @see https://www.npmjs.com/package/qrcode.react
 */

declare module 'qrcode.react' {
  import * as React from 'react';

  /**
   * Error correction level for QR codes
   * - L: ~7% recovery capacity
   * - M: ~15% recovery capacity
   * - Q: ~25% recovery capacity
   * - H: ~30% recovery capacity
   */
  type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  /**
   * Image settings for logo/image in center of QR code
   */
  interface ImageSettings {
    src: string;
    height?: number;
    width?: number;
    excavate?: boolean;
    x?: number;
    y?: number;
    opacity?: number;
    crossOrigin?: 'anonymous' | 'use-credentials' | '';
  }

  /**
   * Common props for QR code components
   */
  interface QRProps {
    /** The value to encode in the QR code */
    value: string;
    /** Size of the QR code in pixels */
    size?: number;
    /** Error correction level */
    level?: ErrorCorrectionLevel;
    /** Background color */
    bgColor?: string;
    /** Foreground color */
    fgColor?: string;
    /** Include margin around QR code */
    includeMargin?: boolean;
    /** Margin size (only when includeMargin is true) */
    marginSize?: number;
    /** Image settings for logo in center */
    imageSettings?: ImageSettings;
    /** Additional inline styles */
    style?: React.CSSProperties;
  }

  /**
   * Props for QRCodeCanvas component
   */
  interface QRCodeCanvasProps extends QRProps {
    /** ID for the canvas element */
    id?: string;
  }

  /**
   * Props for QRCodeSVG component
   */
  interface QRCodeSVGProps extends QRProps {
    /** Title for accessibility */
    title?: string;
    /** ID for the SVG element */
    id?: string;
  }

  /**
   * QR code rendered as a Canvas element
   * Use this when you need to download/export the QR code as an image
   */
  export const QRCodeCanvas: React.FC<QRCodeCanvasProps>;

  /**
   * QR code rendered as an SVG element
   * Use this for better scalability and CSS styling
   */
  export const QRCodeSVG: React.FC<QRCodeSVGProps>;

  /**
   * Default export - alias for QRCodeCanvas
   * @deprecated Use named exports QRCodeCanvas or QRCodeSVG instead
   */
  const QRCode: React.FC<QRCodeCanvasProps>;
  export default QRCode;
}
