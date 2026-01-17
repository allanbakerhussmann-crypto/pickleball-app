/**
 * Default Waiver Text - V07.25
 *
 * Comprehensive liability waiver used across all leagues and tournaments.
 * This ensures consistency in the waiver agreement shown to players.
 */

export const DEFAULT_WAIVER_TEXT = `1. Participation & Scope

This waiver applies to all participation in activities facilitated through the platform, including but not limited to:
• Leagues
• Tournaments
• Team leagues
• Meetups and social play
• DUPR-rated events
• Warm-ups, practice sessions, and ancillary activities

Participation may occur at multiple venues, both indoor and outdoor.

2. Acknowledgement of Inherent Risk

I understand and acknowledge that pickleball and related sporting activities involve inherent risks, including but not limited to:
• Physical injury (minor or serious)
• Slips, trips, falls, and collisions
• Overexertion, fatigue, dehydration, or heat-related illness
• Injuries caused by other participants, equipment, surfaces, or facilities
• Aggravation of pre-existing conditions

I understand that these risks cannot be completely eliminated, even when rules, safety procedures, and reasonable care are followed.

3. Voluntary Assumption of Risk

I voluntarily choose to participate and freely assume all risks, both known and unknown, foreseeable and unforeseeable, associated with my participation.

I accept full responsibility for:
• My personal safety
• My actions and decisions
• Any injury, loss, or damage I may suffer

4. Medical Fitness & Health Responsibility

I confirm that:
• I am physically and medically fit to participate, or
• I have consulted a medical professional and have been cleared to participate

I acknowledge that:
• Organisers, clubs, and the platform do not provide medical advice
• No medical supervision is provided during events
• I am responsible for managing my own health, medication, and limitations

5. Release and Waiver of Liability

To the fullest extent permitted by law, I release and discharge the following parties from any and all claims, demands, actions, or liabilities arising from my participation:
• The platform owner and operator
• Event and league organisers
• Clubs and associations
• Venue owners and operators
• Officials, volunteers, contractors, and staff

This release applies to claims for injury, illness, loss, or property damage, except where liability cannot be excluded by law (including gross negligence or willful misconduct).

6. Indemnification

I agree to indemnify and hold harmless the released parties from any claims, damages, costs, or expenses (including legal fees) arising from:
• My actions or omissions
• My breach of this waiver
• Any harm I cause to other participants, spectators, or property

7. Insurance & ACC

I understand that:
• I am responsible for my own medical and accident insurance
• No personal injury, income protection, or property insurance is provided unless expressly stated
• In New Zealand, personal injury may be covered by ACC, subject to its rules and limitations

8. Rules, Conduct & Event Decisions

I agree to:
• Follow all event rules, formats, and instructions
• Respect officials' decisions
• Act in a safe and sportsmanlike manner

I understand that organisers may:
• Modify schedules, formats, or venues
• Remove participants for safety or conduct reasons
• Deny participation without refund if behaviour is unsafe, abusive, or disruptive

9. Equipment & Venue Conditions

I acknowledge that:
• Courts, nets, balls, and facilities may vary in condition
• Outdoor events are subject to weather and environmental conditions
• I am responsible for inspecting equipment and playing surfaces before play

10. Photography, Video & Media Release

I grant permission for photographs, videos, and recordings taken during events to be used for:
• Event administration
• Results reporting and rankings
• Promotion, marketing, and platform communications

No compensation is expected.

11. Minors (Under 18)

If I am registering or accepting this waiver on behalf of a participant under 18, I confirm that:
• I am the parent or legal guardian
• I consent to the minor's participation
• I accept all terms of this waiver on the minor's behalf

12. Governing Law & Jurisdiction

This waiver is governed by the laws of New Zealand.
Any disputes shall be subject to the exclusive jurisdiction of New Zealand courts.

13. Severability

If any provision of this waiver is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.

14. Acceptance

By registering for or participating in any activity through the platform, I confirm that:
• I have read and understood this waiver
• I voluntarily agree to all terms
• I understand this waiver affects my legal rights`;

/**
 * Default waiver settings for new leagues and tournaments
 */
export const DEFAULT_WAIVER_SETTINGS = {
  waiverRequired: true,
  waiverText: DEFAULT_WAIVER_TEXT,
};

/**
 * Current waiver version for audit logging
 */
export const WAIVER_VERSION = '1.0';

/**
 * DUPR Rating Submission Waiver - V07.51
 *
 * Required consent for tournaments that submit match results to DUPR.
 * Players must acknowledge that their match results will affect their DUPR rating.
 */
export const DUPR_WAIVER_TEXT = `DUPR Rating Submission Consent

1. Match Result Submission

I understand and consent to the following regarding DUPR (Dynamic Universal Pickleball Rating):
• My match results from this event will be submitted to DUPR
• These results will affect my official DUPR rating
• Submitted results cannot be removed or modified after processing

2. Rating Impact Acknowledgement

I acknowledge that:
• My DUPR rating may increase or decrease based on match outcomes
• Results are submitted by the event organizer, not individual players
• DUPR's rating algorithm determines how results affect my rating
• All submitted matches become part of my permanent match history

3. Data Sharing Authorization

I authorize the sharing of the following information with DUPR:
• My name and DUPR ID
• Match scores and outcomes
• Event name and date
• Opponent information (name, DUPR ID)

4. Accuracy of Information

I confirm that:
• My DUPR ID is accurate and belongs to me
• I am the person registered to play under this account
• I will report any scoring disputes to the organizer before match submission

5. DUPR Terms of Service

I acknowledge that:
• DUPR match submissions are subject to DUPR's Terms of Service
• Any disputes about rating calculations should be directed to DUPR
• The platform and organizers are not responsible for DUPR's rating methodology

6. Consent

By participating in this DUPR-rated event, I consent to having my match results submitted to DUPR and understand that this will permanently affect my rating.`;

/**
 * DUPR waiver version for audit logging
 */
export const DUPR_WAIVER_VERSION = '1.0';
