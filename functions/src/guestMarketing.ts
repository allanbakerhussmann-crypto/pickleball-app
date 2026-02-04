/**
 * Guest Marketing Cloud Functions
 *
 * Firestore triggers for building guest profiles from occurrence guest data.
 * When a guest is added to a standing meetup occurrence (cash or Stripe),
 * this trigger aggregates their visit data into a centralized guestProfiles
 * collection keyed by normalized email.
 *
 * Guests without email addresses are silently skipped (cash-only, no contact info).
 *
 * NOTE: Using 1st Gen functions for reliable deployment
 * (2nd Gen has Container Healthcheck issues in australia-southeast1)
 *
 * @version 07.61
 * @file functions/src/guestMarketing.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { sendEmail } from './comms';

const db = admin.firestore();

// =============================================================================
// Types (duplicated from types/standingMeetup.ts for Cloud Functions)
// =============================================================================

interface OccurrenceGuest {
  id: string;
  name: string;
  email?: string;
  emailConsent?: boolean;
  amount: number;
  paymentMethod: 'cash' | 'stripe';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  receivedBy?: string;
  notes?: string;
  createdAt: number;
  createdBy: string;
}

interface GuestVisitSummary {
  standingMeetupId: string;
  occurrenceId: string;
  clubId: string;
  meetupTitle: string;
  amount: number;
  paymentMethod: 'cash' | 'stripe';
  visitedAt: number;
}

interface GuestProfile {
  email: string;
  names: string[];
  primaryName: string;
  totalVisits: number;
  totalSpend: number;
  firstVisitAt: number;
  lastVisitAt: number;
  recentVisits: GuestVisitSummary[];
  clubIds: string[];
  meetupIds: string[];
  cashVisits: number;
  stripeVisits: number;
  conversionStatus: 'guest' | 'invited' | 'signed_up';
  convertedUserId?: string;
  convertedAt?: number;
  emailConsent: boolean;
  emailConsentAt?: number;
  unsubscribeToken: string;
  emailsSent: string[];
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Helper: Normalize email for use as document ID
// =============================================================================

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// =============================================================================
// Helper: Add unique value to array (dedup)
// =============================================================================

function addUnique(arr: string[], value: string): string[] {
  if (!arr.includes(value)) {
    return [...arr, value];
  }
  return arr;
}

// =============================================================================
// Helper: Determine which marketing email to send based on visit count
// =============================================================================

function getEmailKeyForVisitCount(totalVisits: number): string | null {
  switch (totalVisits) {
    case 1: return 'welcome';
    case 3: return 'regular';
    case 5: return 'convert';
    default: return null;
  }
}

// =============================================================================
// Helper: Build marketing email content
// =============================================================================

interface MarketingEmailParams {
  emailKey: string;
  guestName: string;
  meetupTitle: string;
  unsubscribeUrl: string;
  signupUrl: string;
  totalVisits: number;
  totalSpend: number;
}

function buildGuestMarketingEmail(params: MarketingEmailParams): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const { emailKey, guestName, meetupTitle, unsubscribeUrl, signupUrl, totalVisits, totalSpend } = params;

  let subject = '';
  let subtitle = '';
  let bodyParagraphs: string[] = [];
  let ctaText = '';
  let textBody = '';

  if (emailKey === 'welcome') {
    subject = `Thanks for visiting ${meetupTitle}!`;
    subtitle = 'Thanks for Playing!';
    bodyParagraphs = [
      `Hi ${guestName}, thanks for coming to ${meetupTitle}. We hope you had a great time on the courts!`,
      'Want to find more sessions, track your play history, and connect with other players?',
    ];
    ctaText = 'Create Free Account';
    textBody = [
      `Hi ${guestName},`,
      '',
      `Thanks for coming to ${meetupTitle}. We hope you had a great time on the courts!`,
      '',
      'Want to find more sessions, track your play history, and connect with other players?',
      '',
      `Create your free account: ${signupUrl}`,
      '',
      '---',
      'Pickleball Director - pickleballdirector.co.nz',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
  } else if (emailKey === 'regular') {
    subject = `You're becoming a regular, ${guestName}!`;
    subtitle = "You're a Regular!";
    bodyParagraphs = [
      `Hi ${guestName}, you've now played ${totalVisits} sessions! You're becoming a familiar face on the courts.`,
      'Create a free account to track your sessions, see your play history, and get notified about upcoming events.',
    ];
    ctaText = 'Create Free Account';
    textBody = [
      `Hi ${guestName},`,
      '',
      `You've now played ${totalVisits} sessions! You're becoming a familiar face on the courts.`,
      '',
      'Create a free account to track your sessions, see your play history, and get notified about upcoming events.',
      '',
      `Create your free account: ${signupUrl}`,
      '',
      '---',
      'Pickleball Director - pickleballdirector.co.nz',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
  } else if (emailKey === 'convert') {
    const spendFormatted = `$${(totalSpend / 100).toFixed(2)}`;
    subject = `Track your pickleball stats, ${guestName}`;
    subtitle = 'Join the Community';
    bodyParagraphs = [
      `Hi ${guestName}, with ${totalVisits} sessions and ${spendFormatted} spent, you're a dedicated player!`,
    ];
    ctaText = 'Join for Free';
    textBody = [
      `Hi ${guestName},`,
      '',
      `With ${totalVisits} sessions and ${spendFormatted} spent, you're a dedicated player!`,
      '',
      'With a free account you can:',
      '- Track all your sessions and stats',
      '- Get notified about upcoming events',
      '- Connect with other players',
      '- Access DUPR ratings integration',
      '',
      `Join for free: ${signupUrl}`,
      '',
      '---',
      'Pickleball Director - pickleballdirector.co.nz',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
  }

  // Build HTML body paragraphs
  let htmlContentInner = bodyParagraphs
    .map((p) => `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${p}</p>`)
    .join('');

  // Add feature list for convert email
  if (emailKey === 'convert') {
    htmlContentInner += `
      <ul style="margin:0 0 14px;padding-left:20px;color:#374151;font-size:15px;line-height:1.8;">
        <li>Track all your sessions and stats</li>
        <li>Get notified about upcoming events</li>
        <li>Connect with other players</li>
        <li>Access DUPR ratings integration</li>
      </ul>`;
  }

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#030712;color:#fff;border-radius:14px;padding:24px;">
      <div style="font-size:20px;font-weight:700;">Pickleball Director</div>
      <div style="color:#84cc16;font-size:14px;margin-top:4px;">${subtitle}</div>
    </div>
    <div style="background:#fff;border-radius:14px;margin-top:14px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
      ${htmlContentInner}
      <a href="${signupUrl}" style="display:inline-block;margin-top:10px;padding:10px 24px;background:#84cc16;color:#030712;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">${ctaText}</a>
    </div>
    <div style="text-align:center;margin-top:16px;color:#9ca3af;font-size:12px;">
      Pickleball Director &mdash; pickleballdirector.co.nz
      <br/>
      <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from marketing emails</a>
    </div>
  </div>
</body>
</html>`;

  return { subject, textBody, htmlBody };
}

// =============================================================================
// Firestore Trigger: guest_onGuestCreated
//
// Path: standingMeetups/{standingMeetupId}/occurrences/{dateId}/guests/{guestId}
//
// Creates or updates a guestProfiles/{normalizedEmail} document whenever a
// new guest document is written. Uses a transaction to avoid race conditions
// when two guests with the same email are added in quick succession.
// =============================================================================

export const guest_onGuestCreated = functions
  .region('australia-southeast1')
  .firestore.document('standingMeetups/{standingMeetupId}/occurrences/{dateId}/guests/{guestId}')
  .onCreate(async (snap, context) => {
    const guest = snap.data() as OccurrenceGuest;
    const { standingMeetupId, dateId } = context.params;

    try {
      // -----------------------------------------------------------------------
      // 1. Check if guest has an email - skip if not (cash guest without email)
      // -----------------------------------------------------------------------
      if (!guest.email || !guest.email.trim()) {
        console.log(
          `guest_onGuestCreated: Skipping guest ${context.params.guestId} - no email (cash guest)`
        );
        return;
      }

      const email = normalizeEmail(guest.email);

      // -----------------------------------------------------------------------
      // 2. Look up the standing meetup for title and clubId
      // -----------------------------------------------------------------------
      const meetupSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .get();

      let meetupTitle = 'Unknown Meetup';
      let clubId = '';

      if (meetupSnap.exists) {
        const meetupData = meetupSnap.data();
        meetupTitle = meetupData?.title || 'Unknown Meetup';
        clubId = meetupData?.clubId || '';
      } else {
        console.warn(
          `guest_onGuestCreated: Standing meetup ${standingMeetupId} not found, using defaults`
        );
      }

      // -----------------------------------------------------------------------
      // 3. Build visit summary for this occurrence
      // -----------------------------------------------------------------------
      const visitSummary: GuestVisitSummary = {
        standingMeetupId,
        occurrenceId: dateId,
        clubId,
        meetupTitle,
        amount: guest.amount,
        paymentMethod: guest.paymentMethod,
        visitedAt: guest.createdAt,
      };

      // -----------------------------------------------------------------------
      // 4. Determine email consent
      //    - Stripe guests: false by default (consent must be explicit via checkbox)
      //    - Cash guests: check the emailConsent field on the guest doc
      // -----------------------------------------------------------------------
      let hasEmailConsent = false;
      if (guest.paymentMethod === 'cash') {
        // For cash guests, the organizer may have ticked consent checkbox
        hasEmailConsent = guest.emailConsent === true;
      }
      // For Stripe guests, emailConsent defaults to false (they entered email
      // for payment, not for marketing - consent must be explicit)

      // -----------------------------------------------------------------------
      // 5. Create or update guestProfile in a transaction
      // -----------------------------------------------------------------------
      const profileRef = db.collection('guestProfiles').doc(email);
      const now = Date.now();

      await db.runTransaction(async (transaction) => {
        const profileSnap = await transaction.get(profileRef);

        if (profileSnap.exists) {
          // --- UPDATE existing profile ---
          const existing = profileSnap.data() as GuestProfile;

          // Update names array (dedup) and set primaryName to latest
          const updatedNames = addUnique(existing.names, guest.name.trim());

          // Update clubIds and meetupIds (dedup)
          const updatedClubIds = clubId
            ? addUnique(existing.clubIds, clubId)
            : existing.clubIds;
          const updatedMeetupIds = addUnique(existing.meetupIds, standingMeetupId);

          // Prepend new visit and keep only last 10
          const updatedRecentVisits = [visitSummary, ...existing.recentVisits].slice(0, 10);

          // Update payment method counters
          const updatedCashVisits =
            guest.paymentMethod === 'cash'
              ? existing.cashVisits + 1
              : existing.cashVisits;
          const updatedStripeVisits =
            guest.paymentMethod === 'stripe'
              ? existing.stripeVisits + 1
              : existing.stripeVisits;

          // Build update object
          const updateData: Partial<GuestProfile> & { updatedAt: number } = {
            names: updatedNames,
            primaryName: guest.name.trim(),
            totalVisits: existing.totalVisits + 1,
            totalSpend: existing.totalSpend + guest.amount,
            lastVisitAt: guest.createdAt,
            recentVisits: updatedRecentVisits,
            clubIds: updatedClubIds,
            meetupIds: updatedMeetupIds,
            cashVisits: updatedCashVisits,
            stripeVisits: updatedStripeVisits,
            updatedAt: now,
          };

          // Only upgrade consent from false to true, never downgrade
          if (hasEmailConsent && !existing.emailConsent) {
            updateData.emailConsent = true;
            updateData.emailConsentAt = now;
          }

          transaction.update(profileRef, updateData);
        } else {
          // --- CREATE new profile ---
          const newProfile: GuestProfile = {
            email,
            names: [guest.name.trim()],
            primaryName: guest.name.trim(),
            totalVisits: 1,
            totalSpend: guest.amount,
            firstVisitAt: guest.createdAt,
            lastVisitAt: guest.createdAt,
            recentVisits: [visitSummary],
            clubIds: clubId ? [clubId] : [],
            meetupIds: [standingMeetupId],
            cashVisits: guest.paymentMethod === 'cash' ? 1 : 0,
            stripeVisits: guest.paymentMethod === 'stripe' ? 1 : 0,
            conversionStatus: 'guest',
            emailConsent: hasEmailConsent,
            ...(hasEmailConsent && { emailConsentAt: now }),
            unsubscribeToken: crypto.randomUUID(),
            emailsSent: [],
            createdAt: now,
            updatedAt: now,
          };

          transaction.set(profileRef, newProfile);
        }
      });

      console.log(
        `guest_onGuestCreated: Profile updated for ${email} ` +
          `(meetup: ${standingMeetupId}, occurrence: ${dateId}, ` +
          `payment: ${guest.paymentMethod})`
      );

      // --- Phase 2: Marketing email sequences ---
      try {
        const profileRef2 = db.collection('guestProfiles').doc(email);
        const finalSnap = await profileRef2.get();
        const finalProfile = finalSnap.data() as GuestProfile | undefined;

        if (!finalProfile) return;
        if (!finalProfile.emailConsent) return;
        if (finalProfile.conversionStatus !== 'guest') return;

        const emailKey = getEmailKeyForVisitCount(finalProfile.totalVisits);
        if (!emailKey) return;
        if ((finalProfile.emailsSent || []).includes(emailKey)) return;

        const baseUrl = functions.config().app?.url || 'https://pickleballdirector.co.nz';
        const unsubscribeUrl = `${baseUrl}/api/guest/unsubscribe?token=${finalProfile.unsubscribeToken}`;
        const signupUrl = baseUrl;

        const { subject, textBody, htmlBody } = buildGuestMarketingEmail({
          emailKey,
          guestName: finalProfile.primaryName,
          meetupTitle,
          unsubscribeUrl,
          signupUrl,
          totalVisits: finalProfile.totalVisits,
          totalSpend: finalProfile.totalSpend,
        });

        const emailResult = await sendEmail(finalProfile.email, subject, textBody, htmlBody);

        if (emailResult.success) {
          await profileRef2.update({
            emailsSent: admin.firestore.FieldValue.arrayUnion(emailKey),
            updatedAt: Date.now(),
          });
          console.log(`guest_onGuestCreated: Marketing email '${emailKey}' sent to ${email}`);
        } else {
          console.warn(`guest_onGuestCreated: Marketing email '${emailKey}' failed for ${email}: ${emailResult.error}`);
        }
      } catch (emailError) {
        console.warn('guest_onGuestCreated: Marketing email failed (non-fatal):', emailError);
      }
    } catch (error) {
      // Log error but do NOT throw - triggers should not retry on app-level errors
      console.error(
        `guest_onGuestCreated: Failed to update profile for guest ${context.params.guestId}:`,
        error
      );
    }
  });

// =============================================================================
// Helper: Build unsubscribe confirmation HTML page
// =============================================================================

function buildUnsubscribeHtml(success: boolean, errorMessage?: string): string {
  const icon = success
    ? '<div style="font-size:48px;margin-bottom:16px;">&#10003;</div>'
    : '<div style="font-size:48px;margin-bottom:16px;">&#9888;</div>';

  const heading = success
    ? "You've Been Unsubscribed"
    : 'Unsubscribe Failed';

  const message = success
    ? "You won't receive any more marketing emails from Pickleball Director. You can still be added as a guest at meetups."
    : (errorMessage || 'Something went wrong. Please try again later.');

  const headingColor = success ? '#84cc16' : '#f87171';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${heading} - Pickleball Director</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:Arial,Helvetica,sans-serif;color:#fff;min-height:100vh;">
  <div style="max-width:480px;margin:0 auto;padding:80px 24px;text-align:center;">
    ${icon}
    <h1 style="font-size:24px;font-weight:700;color:${headingColor};margin:0 0 16px;">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#d1d5db;margin:0 0 32px;">${message}</p>
    <a href="https://pickleballdirector.co.nz" style="display:inline-block;padding:10px 24px;background:#84cc16;color:#030712;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">Go to Pickleball Director</a>
    <div style="margin-top:48px;color:#6b7280;font-size:12px;">Pickleball Director &mdash; pickleballdirector.co.nz</div>
  </div>
</body>
</html>`;
}

// =============================================================================
// HTTP Endpoint: guest_unsubscribe
//
// GET /api/guest/unsubscribe?token=<unsubscribeToken>
//
// Looks up the guestProfile by unsubscribeToken and sets emailConsent to false.
// Returns a branded HTML confirmation page.
// =============================================================================

export const guest_unsubscribe = functions
  .region('australia-southeast1')
  .https.onRequest(async (req, res) => {
    // Set CORS headers for browser access
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed');
      return;
    }

    const token = req.query.token as string;
    if (!token || typeof token !== 'string' || token.length < 10) {
      res.status(200).send(buildUnsubscribeHtml(false, 'Invalid unsubscribe link.'));
      return;
    }

    try {
      const snapshot = await db.collection('guestProfiles')
        .where('unsubscribeToken', '==', token)
        .limit(1)
        .get();

      if (snapshot.empty) {
        res.status(200).send(buildUnsubscribeHtml(false, 'This link has already been used or is invalid.'));
        return;
      }

      const doc = snapshot.docs[0];
      await doc.ref.update({
        emailConsent: false,
        updatedAt: Date.now(),
      });

      res.status(200).send(buildUnsubscribeHtml(true));
    } catch (error) {
      console.error('guest_unsubscribe: Error:', error);
      res.status(200).send(buildUnsubscribeHtml(false, 'Something went wrong. Please try again later.'));
    }
  });
