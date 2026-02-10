/**
 * Organizer Agreement Constants V07.05
 *
 * Contains the full Organiser Terms & Score Reporting Agreement text
 * and version tracking for agreement acceptance.
 *
 * FILE LOCATION: constants/organizerAgreement.ts
 */

// Current agreement version - update when agreement changes
export const CURRENT_ORGANIZER_AGREEMENT_VERSION = 'V1.8';
export const ORGANIZER_AGREEMENT_EFFECTIVE_DATE = '2026-02-08';

// Agreement section structure
export interface AgreementSection {
  title: string;
  content: string[];
}

// Full agreement structure
export interface OrganizerAgreementContent {
  version: string;
  effectiveDate: string;
  title: string;
  sections: AgreementSection[];
  checkboxes: {
    main: string;
    integrity: string;
    privacy: string;
  };
}

export const ORGANIZER_AGREEMENT: OrganizerAgreementContent = {
  version: CURRENT_ORGANIZER_AGREEMENT_VERSION,
  effectiveDate: ORGANIZER_AGREEMENT_EFFECTIVE_DATE,
  title: 'Organiser Terms & Score Reporting Agreement',
  sections: [
    {
      title: '1. Parties',
      content: [
        'This Organiser Terms & Score Reporting Agreement ("Agreement") is entered into between:',
        '• Pickleball Director ("Platform", "we", "us", "our"), and',
        '• The individual requesting organiser access ("Organiser", "you", "your").',
        'By clicking "I Agree", submitting an organiser request, or using organiser-level features, you confirm that you have read, understood, and agree to be bound by this Agreement.',
      ],
    },
    {
      title: '2. Purpose and Scope',
      content: [
        '2.1 This Agreement governs your use of organiser-level features within Pickleball Director, including but not limited to:',
        '• Creating and managing sessions, events, leagues, or tournaments',
        '• Creating matches and assigning participants',
        '• Reviewing score proposals and resolving disputes',
        '• Finalising official match results',
        '• Submitting match results to third-party rating services (including DUPR, where enabled)',
        '2.2 Organiser access is a privileged role intended solely for structured and supervised pickleball activities, such as club nights, leagues, tournaments, and organised sessions. It is not intended for casual, unsupervised, or ad-hoc play.',
      ],
    },
    {
      title: '3. Platform Fees',
      content: [
        '3.1 Organiser Stripe Account Fee',
        'If you connect a Stripe account to receive payments through Pickleball Director, a monthly platform fee of NZ$2.00 (or local currency equivalent) applies. This fee:',
        '• Recovers Stripe Connect infrastructure costs incurred by the Platform',
        '• Is automatically deducted from your first qualifying payment each calendar month',
        '• Only applies to payments of $3.00 or more',
        '• Will be deferred to the next qualifying payment if your first payment is below the threshold',
        '3.2 This fee is separate from Stripe\'s own processing fees (approximately 2.7% + $0.30 per transaction) which are also deducted from payments you receive.',
        '3.3 The Platform may adjust these fees from time to time with reasonable notice. Continued use of payment features after fee changes constitutes acceptance.',
      ],
    },
    {
      title: '4. Definitions',
      content: [
        'For the purposes of this Agreement:',
        '• Match – A scheduled or recorded pickleball match created or managed within Pickleball Director.',
        '• Score Proposal – A non-binding score submitted by a player for organiser review.',
        '• Official Result – The final score and winner(s) finalised by an Organiser.',
        '• Dispute – An objection raised by a player regarding a Score Proposal or result.',
        '• Rating Service – A third-party player rating system integrated with the Platform (e.g. DUPR).',
        '• DUPR-Eligible – A match designated within the Platform as eligible for DUPR submission under configured rules.',
        '• Personal Information – Information about an identifiable individual, as defined under applicable privacy law.',
      ],
    },
    {
      title: '5. Eligibility and Verification',
      content: [
        '4.1 You confirm that you are at least 18 years old (or the age of majority in your jurisdiction).',
        '4.2 You agree to provide accurate, complete, and current information when requesting organiser access and to keep that information up to date.',
        '4.3 Pickleball Director may require additional verification before granting organiser access, including confirmation of your association with a club, venue, league, or event.',
        '4.4 Granting organiser access is at our discretion. We may approve, decline, limit, or revoke organiser access at any time in accordance with this Agreement.',
      ],
    },
    {
      title: '6. Core Organiser Responsibilities',
      content: [
        'As an Organiser, you agree to:',
        '5.1 Act honestly, fairly, and in good faith at all times.',
        '5.2 Ensure that all Matches you manage are:',
        '• Legitimately played',
        '• Properly organised',
        '• Accurately recorded',
        '5.3 Take reasonable steps to confirm that:',
        '• The correct players participated',
        '• Team compositions are accurate',
        '• Scores reflect the actual outcome of the match',
        '5.4 Use organiser privileges only for legitimate administration purposes, and not for personal advantage or rating manipulation.',
        '5.5 Conduct yourself professionally when interacting with players, officials, and other organisers.',
      ],
    },
    {
      title: '7. Non-Self-Reporting Rule (Critical)',
      content: [
        '6.1 Pickleball Director enforces a strict non-self-reporting model. Players may submit Score Proposals only. Players cannot:',
        '• Finalise matches',
        '• Submit Official Results',
        '• Trigger rating submissions',
        '6.2 You must not allow or facilitate self-reporting, including:',
        '• Allowing players to finalise or approve Official Results',
        '• Submitting results based solely on player confirmation',
        '• Submitting unverified or fabricated results',
        '6.3 You acknowledge that organiser actions may directly impact player ratings and competition outcomes and accept heightened responsibility for integrity and accuracy.',
      ],
    },
    {
      title: '8. Score Proposal, Dispute, and Finalisation Workflow',
      content: [
        '7.1 Score Proposals',
        '• Players may submit Score Proposals for organiser review.',
        '• Score Proposals are non-binding and do not complete a match.',
        '7.2 Acknowledgement ("Signing")',
        '• Opposing players may acknowledge ("sign") a proposal to indicate agreement.',
        '• A signed proposal is still not official and requires organiser review.',
        '7.3 Disputes',
        '• Players may dispute a proposal and provide a reason.',
        '• You agree to review disputes impartially and promptly.',
        '7.4 Official Result Finalisation',
        '• A Match is only considered completed once you finalise the Official Result.',
        '• You agree to finalise results based on reasonable verification, which may include:',
        '  - Confirmation from both sides',
        '  - Court sheets or scorecards',
        '  - Referee or staff confirmation',
        '  - Event procedures',
        '7.5 Locking and Corrections',
        '• Finalised results may be locked.',
        '• If an error is discovered, you must follow the Platform\'s correction workflow and maintain an audit trail.',
      ],
    },
    {
      title: '9. DUPR and Rating Service Submission Rules',
      content: [
        '8.1 Where DUPR or another Rating Service is enabled, you agree to submit results only when:',
        '• The Match was legitimately played',
        '• The Official Result has been finalised by you',
        '• The Match meets eligibility criteria',
        '• No unresolved dispute exists',
        '8.2 You must not submit:',
        '• Practice or warm-up games',
        '• Casual or unsupervised play',
        '• Abandoned or incomplete matches',
        '• Test or fabricated results',
        '• Matches with incorrect participants',
        '8.3 You acknowledge that Rating Services apply their own rules and may reject or adjust submissions independently of Pickleball Director.',
      ],
    },
    {
      title: '10. Accuracy and Verification Duty',
      content: [
        '9.1 You agree to take reasonable steps to verify match accuracy before finalisation.',
        '9.2 Reasonable verification includes, at minimum:',
        '• Confirming the correct participants',
        '• Confirming the score with more than a single unverified claim',
        '9.3 Repeated inaccuracies, negligence, or manipulation may result in immediate suspension or revocation of organiser access.',
      ],
    },
    {
      title: '11. Corrections, Reversals, and Audit Trail',
      content: [
        '10.1 You must correct errors promptly once identified.',
        '10.2 If a result has already been submitted to a Rating Service and requires correction:',
        '• You must follow the Platform\'s correction workflow',
        '• You acknowledge that some Rating Services may restrict or disallow edits',
        '10.3 All organiser actions are logged, including:',
        '• Score finalisation',
        '• Corrections',
        '• Rating submissions',
        '• Role grants and revocations',
        'You must not attempt to bypass or manipulate audit records.',
      ],
    },
    {
      title: '12. Data Protection and Privacy',
      content: [
        '11.1 You must handle Personal Information accessed through organiser features responsibly and only for legitimate event administration.',
        '11.2 You must not:',
        '• Export, sell, or misuse player data',
        '• Share Personal Information outside the Platform without lawful basis',
        '11.3 You acknowledge that:',
        '• Match data and identifiers may be transmitted to Rating Services',
        '• Your actions may trigger lawful data sharing',
        '11.4 You agree to comply with applicable privacy laws, including the New Zealand Privacy Act 2020, and the Pickleball Director Privacy Policy.',
      ],
    },
    {
      title: '13. Security and Account Use',
      content: [
        '12.1 You are responsible for maintaining the security of your account.',
        '12.2 You must not share organiser credentials or allow others to act on your behalf.',
        '12.3 You must notify us immediately of any suspected unauthorised access.',
      ],
    },
    {
      title: '14. Enforcement, Suspension, and Revocation',
      content: [
        '13.1 Pickleball Director may monitor organiser activity to ensure integrity and compliance.',
        '13.2 We may suspend or revoke organiser access immediately if we reasonably believe you have:',
        '• Violated this Agreement',
        '• Enabled self-reporting',
        '• Submitted false or negligent results',
        '• Misused Personal Information',
        '• Exposed the Platform or Rating Services to risk',
        '13.3 Revocation may occur without prior notice where serious risk exists.',
      ],
    },
    {
      title: '15. Disclaimers',
      content: [
        '14.1 Pickleball Director provides tools to assist organisers but does not guarantee:',
        '• Rating outcomes',
        '• Rating accuracy within third-party services',
        '• Acceptance of submissions by Rating Services',
        '14.2 Rating calculations are controlled by the Rating Service, not Pickleball Director.',
        '14.3 You are responsible for the accuracy of results you finalise and submit.',
      ],
    },
    {
      title: '16. Limitation of Liability',
      content: [
        'To the maximum extent permitted by law:',
        '15.1 Pickleball Director is not liable for:',
        '• Rating changes',
        '• Player disputes',
        '• Consequences arising from inaccurate information supplied by users',
        '• Decisions made by you in your organiser role',
        '15.2 Any liability is limited as set out in the Pickleball Director Terms of Service.',
      ],
    },
    {
      title: '17. Changes to This Agreement',
      content: [
        '16.1 We may update this Agreement from time to time.',
        '16.2 Material changes will be communicated where reasonably practicable.',
        '16.3 Continued use of organiser features after updates constitutes acceptance.',
      ],
    },
    {
      title: '18. Contact',
      content: [
        'For questions regarding organiser responsibilities or compliance, contact:',
        'support@pickleballdirector.co.nz',
      ],
    },
  ],
  checkboxes: {
    main: 'I have read and agree to the Pickleball Director Organiser Terms & Score Reporting Agreement. I understand that only organisers may finalise official results and submit rating-eligible matches, and I accept responsibility for accurate, honest, and compliant score reporting.',
    integrity: 'I understand that submitting false or unverified results may result in immediate revocation of organiser access.',
    privacy: 'I understand that I may access participant data as part of organiser duties and will handle it in accordance with privacy law and the Pickleball Director Privacy Policy.',
  },
};

/**
 * Check if an organizer agreement is current (matches current version and has all checkboxes)
 */
export function isAgreementCurrent(agreement: {
  version: string;
  acceptedCheckboxes: {
    mainAcceptance: boolean;
    integrityConfirmation: boolean;
    privacyConfirmation: boolean;
  };
} | undefined): boolean {
  if (!agreement) return false;
  if (agreement.version !== CURRENT_ORGANIZER_AGREEMENT_VERSION) return false;

  const { mainAcceptance, integrityConfirmation, privacyConfirmation } = agreement.acceptedCheckboxes;
  return mainAcceptance && integrityConfirmation && privacyConfirmation;
}
