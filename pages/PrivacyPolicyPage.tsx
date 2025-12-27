/**
 * PrivacyPolicyPage - Privacy Policy for Privacy Act 2020 Compliance
 *
 * Addresses the 13 Information Privacy Principles under the
 * New Zealand Privacy Act 2020.
 *
 * FILE LOCATION: pages/PrivacyPolicyPage.tsx
 * VERSION: V06.04
 */

import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicyPage: React.FC = () => {
  const lastUpdated = 'December 2025';

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 md:p-8">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: {lastUpdated}</p>

        {/* Introduction */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">1. Introduction</h2>
          <p className="text-gray-300 mb-3">
            Pickleball Director ("we", "us", "our") is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your
            personal information in accordance with the New Zealand Privacy Act 2020.
          </p>
          <p className="text-gray-300 mb-3">
            We only collect the minimum personal information necessary to provide our services
            and operate the platform effectively.
          </p>
          <p className="text-gray-300">
            By using our platform, you consent to the collection and use of your information
            as described in this policy.
          </p>
        </section>

        {/* What We Collect */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">2. Information We Collect</h2>

          <h3 className="text-lg font-medium text-white mt-4 mb-2">Account Information</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Name and email address</li>
            <li>Phone number (optional)</li>
            <li>Date of birth (for age-restricted divisions)</li>
            <li>Gender (for gendered divisions)</li>
            <li>Profile photo (optional)</li>
            <li>Location (country, region, city)</li>
          </ul>

          <h3 className="text-lg font-medium text-white mt-4 mb-2">Player Information</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Skill level and playing preferences</li>
            <li>DUPR rating (if you connect your DUPR account)</li>
            <li>Match results and tournament history</li>
            <li>League memberships and standings</li>
          </ul>

          <h3 className="text-lg font-medium text-white mt-4 mb-2">Payment Information</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Transaction history (amounts, dates, event registrations)</li>
            <li>Payment method details are processed securely by Stripe and not stored by us</li>
            <li>Stripe Connected Account information (for organizers receiving payments)</li>
          </ul>

          <h3 className="text-lg font-medium text-white mt-4 mb-2">Activity Data</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Tournament and league registrations</li>
            <li>Meetup RSVPs</li>
            <li>Court bookings</li>
            <li>Match scores and game history</li>
          </ul>
        </section>

        {/* Why We Collect */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">3. Why We Collect Your Information</h2>
          <p className="text-gray-300 mb-3">We collect and use your personal information to:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Create and manage your account</li>
            <li>Enable tournament, league, and meetup registration</li>
            <li>Match you with appropriate skill-level opponents</li>
            <li>Process payments for event registrations</li>
            <li>Display standings, rankings, and match results</li>
            <li>Communicate about events you've registered for</li>
            <li>Improve our platform and user experience</li>
          </ul>
        </section>

        {/* Third-Party Services */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">4. Third-Party Services & International Transfers</h2>
          <p className="text-gray-300 mb-4">
            We use third-party services to operate our platform. Your data may be transferred
            to and processed in countries outside New Zealand, including the United States.
          </p>

          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-medium text-white mb-2">Firebase (Google Cloud)</h3>
            <p className="text-gray-400 text-sm mb-2">Location: United States</p>
            <p className="text-gray-300">
              We use Firebase for authentication, database storage, and file storage.
              All user accounts, profiles, tournament data, and uploaded files are stored on Firebase.
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-medium text-white mb-2">Stripe</h3>
            <p className="text-gray-400 text-sm mb-2">Location: United States</p>
            <p className="text-gray-300">
              We use Stripe for payment processing. When you make a payment or set up a
              Connected Account as an organizer, your payment information is processed by Stripe.
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-2">DUPR (Dynamic Universal Pickleball Rating)</h3>
            <p className="text-gray-400 text-sm mb-2">Location: United States</p>
            <p className="text-gray-300">
              If you choose to connect your DUPR account, we access your DUPR player ID,
              rating, and profile information. This is optional and requires your explicit consent.
            </p>
          </div>
        </section>

        {/* Data Retention */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">5. Data Retention</h2>
          <p className="text-gray-300 mb-3">We retain your personal information for as long as:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Your account remains active</li>
            <li>Needed to provide our services to you</li>
            <li>Required by law (e.g., financial records for tax purposes)</li>
            <li>Necessary to resolve disputes or enforce our agreements</li>
          </ul>
          <p className="text-gray-300 mt-3">
            Match results and tournament history may be retained for historical records
            even after account deletion, but will be anonymised or aggregated so they are
            no longer linked to you personally.
          </p>
        </section>

        {/* Your Rights */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">6. Your Rights</h2>
          <p className="text-gray-300 mb-3">
            Under the Privacy Act 2020, you have the following rights:
          </p>

          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">Right to Access</h3>
              <p className="text-gray-400 text-sm">
                You can request a copy of all personal information we hold about you.
                We will respond within 20 working days.
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">Right to Correction</h3>
              <p className="text-gray-400 text-sm">
                You can update your profile information at any time through your account settings.
                For corrections to match results or historical data, please contact us.
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">Right to Deletion</h3>
              <p className="text-gray-400 text-sm">
                You can request deletion of your account and personal data. Some information
                may be retained for legal or legitimate business purposes.
              </p>
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">7. Data Security</h2>
          <p className="text-gray-300 mb-3">We protect your personal information through:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Encrypted data transmission (HTTPS/TLS)</li>
            <li>Firebase Security Rules to control data access</li>
            <li>Secure authentication via Firebase Auth</li>
            <li>Regular security reviews of our codebase</li>
            <li>PCI-DSS compliant payment processing via Stripe</li>
          </ul>
        </section>

        {/* Cookies and Local Storage */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">8. Cookies & Local Storage</h2>
          <p className="text-gray-300 mb-3">We use browser storage to:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>Keep you logged in (authentication tokens)</li>
            <li>Remember your preferences</li>
            <li>Enable core platform functionality</li>
          </ul>
          <p className="text-gray-300 mt-3">
            We do not use tracking cookies for advertising purposes. We may use basic analytics
            (via Firebase) to understand how the platform is used and to improve our services.
            This data is aggregated and does not identify individual users.
          </p>
        </section>

        {/* Children's Privacy */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">9. Children's Privacy</h2>
          <p className="text-gray-300">
            Our platform is not intended for children under 13 years of age. We do not
            knowingly collect personal information from children under 13. If you believe
            a child has provided us with personal information, please contact us.
          </p>
        </section>

        {/* Changes to Policy */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">10. Changes to This Policy</h2>
          <p className="text-gray-300">
            We may update this Privacy Policy from time to time. We will notify you of
            significant changes by posting a notice on our platform or sending you an email.
            Your continued use of the platform after changes constitutes acceptance of the
            updated policy.
          </p>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-3">11. Contact Us</h2>
          <p className="text-gray-300 mb-4">
            If you have questions about this Privacy Policy, want to exercise your rights,
            or have a privacy complaint, please contact our Privacy Officer:
          </p>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-white font-medium">Privacy Officer</p>
            <p className="text-gray-400">Pickleball Director</p>
            <p className="text-green-400">privacy@pickleballdirector.com</p>
          </div>
          <p className="text-gray-400 text-sm mt-4">
            If you are not satisfied with our response, you can lodge a complaint with the
            Office of the Privacy Commissioner at{' '}
            <a
              href="https://www.privacy.org.nz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 underline"
            >
              www.privacy.org.nz
            </a>
          </p>
        </section>

        {/* Back Link */}
        <div className="pt-6 border-t border-gray-700">
          <Link
            to="/"
            className="text-green-400 hover:text-green-300 flex items-center gap-2"
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

export default PrivacyPolicyPage;
