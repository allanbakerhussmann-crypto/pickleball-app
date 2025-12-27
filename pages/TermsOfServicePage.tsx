/**
 * TermsOfServicePage - Terms of Service for Pickleball Director
 *
 * Legal terms governing use of the platform.
 *
 * FILE LOCATION: pages/TermsOfServicePage.tsx
 * VERSION: V06.04
 */

import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfServicePage: React.FC = () => {
  const lastUpdated = 'December 2025';

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 md:p-8">
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-400 mb-8">Last updated: {lastUpdated}</p>

        {/* Agreement */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">1. Agreement to Terms</h2>
          <p className="text-gray-300 mb-3">
            By accessing or using Pickleball Director ("the Platform"), you agree to be bound
            by these Terms of Service and our{' '}
            <Link to="/privacy-policy" className="text-green-400 hover:text-green-300 underline">
              Privacy Policy
            </Link>
            . If you do not agree to these terms, you may not use the Platform.
          </p>
          <p className="text-gray-300 mb-3">
            Pickleball Director is a technology platform that enables organisers to create
            and manage pickleball events. Unless explicitly stated otherwise, Pickleball Director
            is not the organiser of events listed on the Platform.
          </p>
          <p className="text-gray-300">
            We reserve the right to modify these terms at any time. Where reasonable, we will
            notify users of material changes via email or in-app notice. Continued use of the
            Platform after changes constitutes acceptance of the modified terms.
          </p>
        </section>

        {/* Eligibility */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">2. Eligibility</h2>
          <p className="text-gray-300 mb-3">To use the Platform, you must:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Be at least 13 years of age</li>
            <li>Have the legal capacity to enter into a binding agreement</li>
            <li>Not be prohibited from using the Platform under applicable law</li>
          </ul>
          <p className="text-gray-300 mt-3">
            Users under 18 may require parental consent for certain features, including
            payment processing.
          </p>
        </section>

        {/* Account Responsibilities */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">3. Account Responsibilities</h2>
          <p className="text-gray-300 mb-3">When you create an account, you agree to:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Provide accurate and complete information</li>
            <li>Maintain the security of your login credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
            <li>Accept responsibility for all activities under your account</li>
            <li>Not share your account with others</li>
          </ul>
        </section>

        {/* Acceptable Use */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">4. Acceptable Use</h2>
          <p className="text-gray-300 mb-3">You agree not to:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Use the Platform for any illegal purpose</li>
            <li>Harass, abuse, or threaten other users</li>
            <li>Submit false or misleading information</li>
            <li>Attempt to gain unauthorized access to other accounts</li>
            <li>Interfere with the proper functioning of the Platform</li>
            <li>Use automated systems to access the Platform without permission</li>
            <li>Impersonate another person or organization</li>
            <li>Manipulate match results or standings</li>
          </ul>
        </section>

        {/* Tournaments, Leagues & Events */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">5. Tournaments, Leagues & Events</h2>

          <h3 className="text-lg font-medium text-white mt-4 mb-2">For Players</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Registration fees are generally non-refundable unless otherwise stated</li>
            <li>You must comply with event-specific rules set by organizers</li>
            <li>Accurate skill level reporting is expected for fair competition</li>
            <li>No-shows may result in forfeiture and potential account restrictions</li>
          </ul>

          <h3 className="text-lg font-medium text-white mt-4 mb-2">For Organizers</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>You are responsible for running events fairly and professionally</li>
            <li>You must comply with all applicable laws and regulations</li>
            <li>Payment processing fees and Stripe terms apply to collected payments</li>
            <li>You are responsible for resolving disputes with participants</li>
            <li>You must not discriminate against participants unlawfully</li>
          </ul>
        </section>

        {/* Payments */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">6. Payments</h2>
          <p className="text-gray-300 mb-3">
            Payment processing is handled by Stripe. By making or receiving payments through
            the Platform, you also agree to Stripe's terms of service.
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>All prices are displayed in the currency specified by the organizer</li>
            <li>Refund policies are set by individual event organizers</li>
            <li>Organizers receiving payments must maintain a valid Stripe Connected Account</li>
            <li>We are not responsible for disputes between players and organizers</li>
          </ul>
        </section>

        {/* DUPR Integration */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">7. DUPR Integration</h2>
          <p className="text-gray-300 mb-3">
            If you choose to connect your DUPR account:
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>You authorize us to access your DUPR profile and rating</li>
            <li>Your DUPR data may be displayed to other users and organizers</li>
            <li>Match results may be submitted to DUPR if the organizer enables this feature</li>
            <li>You can disconnect your DUPR account at any time</li>
          </ul>
        </section>

        {/* Intellectual Property */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">8. Intellectual Property</h2>
          <p className="text-gray-300 mb-3">
            The Platform, including its design, features, and content, is owned by
            Pickleball Director and protected by intellectual property laws.
          </p>
          <p className="text-gray-300">
            You retain ownership of content you submit (profile photos, event descriptions),
            but grant us a license to use, display, and distribute this content as necessary
            to operate the Platform.
          </p>
        </section>

        {/* Disclaimers */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">9. Disclaimers</h2>
          <p className="text-gray-300 mb-3">
            The Platform is provided "as is" without warranties of any kind. We do not guarantee:
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Uninterrupted or error-free service</li>
            <li>Accuracy of user-submitted information (ratings, skill levels)</li>
            <li>Quality of events organized by third parties</li>
            <li>Safety of in-person events or venues</li>
          </ul>
        </section>

        {/* Limitation of Liability */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">10. Limitation of Liability</h2>
          <p className="text-gray-300 mb-3">
            To the maximum extent permitted by law, Pickleball Director shall not be liable for:
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Indirect, incidental, or consequential damages</li>
            <li>Loss of profits or data</li>
            <li>Injuries occurring at events</li>
            <li>Disputes between users</li>
            <li>Third-party actions or content</li>
          </ul>
          <p className="text-gray-300 mt-3">
            Nothing in these terms excludes or limits liability that cannot be excluded
            under applicable law, including the Consumer Guarantees Act 1993 (New Zealand).
          </p>
        </section>

        {/* Termination */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">11. Termination</h2>
          <p className="text-gray-300 mb-3">
            We may suspend or terminate your account if you violate these terms.
            You may delete your account at any time through your account settings.
          </p>
          <p className="text-gray-300">
            Upon termination, your right to use the Platform ceases immediately.
            Some provisions of these terms will survive termination.
          </p>
        </section>

        {/* Governing Law */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">12. Governing Law</h2>
          <p className="text-gray-300">
            These terms are governed by the laws of New Zealand. Any disputes shall be
            resolved in the courts of New Zealand, unless otherwise required by applicable law.
          </p>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">13. Contact</h2>
          <p className="text-gray-300 mb-4">
            If you have questions about these Terms of Service, please contact us:
          </p>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-white font-medium">Pickleball Director</p>
            <p className="text-green-400">support@pickleballdirector.com</p>
          </div>
        </section>

        {/* Related Links */}
        <div className="pt-6 border-t border-gray-700 flex flex-col sm:flex-row gap-4">
          <Link
            to="/privacy-policy"
            className="text-green-400 hover:text-green-300"
          >
            Read our Privacy Policy →
          </Link>
          <Link
            to="/"
            className="text-gray-400 hover:text-gray-300 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
