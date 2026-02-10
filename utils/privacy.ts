/**
 * Privacy Utilities
 *
 * Helpers for masking sensitive user data in the UI.
 */

/**
 * Masks an email address for privacy display.
 * Shows the first 3 characters of the local part + *** + full domain.
 *
 * Examples:
 *   maskEmail('allanrbaker13@gmail.com')  → 'all***@gmail.com'
 *   maskEmail('jr505hurren@gmail.com')    → 'jr5***@gmail.com'
 *   maskEmail('ab@gmail.com')             → 'ab***@gmail.com'
 */
export function maskEmail(email: string | undefined | null): string {
  if (!email) return '';
  const atIndex = email.indexOf('@');
  if (atIndex < 0) return email;
  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  const visible = local.substring(0, Math.min(3, local.length));
  return `${visible}***${domain}`;
}
