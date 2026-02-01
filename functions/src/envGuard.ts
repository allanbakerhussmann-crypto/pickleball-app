/**
 * Environment Guard - Cross-Wire Prevention
 *
 * Safety checks to ensure test and production environments
 * never accidentally use each other's credentials.
 *
 * Usage:
 * - Import and call assertEnvSafe() at the start of sensitive handlers
 * - Use ENV.isTest/ENV.isProd to conditionally modify behavior
 *
 * FILE LOCATION: functions/src/envGuard.ts
 */

import * as functions from 'firebase-functions';
import { defineString } from 'firebase-functions/params';

// DUPR environment param
const DUPR_ENV = defineString('DUPR_ENV', { default: 'production' });

// ============================================
// ENVIRONMENT DETECTION
// ============================================

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';

export const isTestProject = PROJECT_ID === 'pickleball-app-test';
export const isProdProject = PROJECT_ID === 'pickleball-app-dev';

// ============================================
// KEY DETECTION (checked at runtime)
// ============================================

function getStripeKey(): string {
  return functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY || '';
}

function getDuprEnv(): string {
  try {
    return DUPR_ENV.value();
  } catch {
    // Param not available yet (cold start timing)
    return process.env.DUPR_ENV || 'production';
  }
}

// ============================================
// COLD START WARNINGS (log but don't throw)
// ============================================

// Run checks after a brief delay to allow config to load
setTimeout(() => {
  const stripeKey = getStripeKey();
  const duprEnv = getDuprEnv();

  const isTestStripeKey = stripeKey.startsWith('sk_test_');
  const isLiveStripeKey = stripeKey.startsWith('sk_live_');

  if (isTestProject && isLiveStripeKey) {
    console.error('🚨 WARNING: Live Stripe key detected in TEST project!');
  }
  if (isProdProject && isTestStripeKey) {
    console.error('🚨 WARNING: Test Stripe key detected in PROD project!');
  }
  if (isTestProject && duprEnv === 'production') {
    console.error('🚨 WARNING: DUPR production env in TEST project!');
  }
  if (isProdProject && duprEnv === 'uat') {
    console.error('🚨 WARNING: DUPR UAT env in PROD project!');
  }

  // Log environment info
  console.log(`📍 Environment: ${isTestProject ? 'TEST' : isProdProject ? 'PROD' : 'UNKNOWN'} (${PROJECT_ID})`);
}, 100);

// ============================================
// RUNTIME ASSERTION (call in handlers)
// ============================================

/**
 * Call this at the start of sensitive handlers (webhooks, payment functions)
 * to hard-fail if the environment is misconfigured.
 *
 * @throws HttpsError if environment is misconfigured
 */
export function assertEnvSafe(): void {
  const stripeKey = getStripeKey();
  const duprEnv = getDuprEnv();

  const isTestStripeKey = stripeKey.startsWith('sk_test_');
  const isLiveStripeKey = stripeKey.startsWith('sk_live_');

  if (isTestProject && isLiveStripeKey) {
    console.error('🚨 FATAL: Refusing to process - Live Stripe key in TEST project!');
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Environment mismatch: Live Stripe key detected in test project. This is a safety violation.'
    );
  }

  if (isProdProject && isTestStripeKey) {
    console.error('🚨 FATAL: Refusing to process - Test Stripe key in PROD project!');
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Environment mismatch: Test Stripe key detected in production project. This is a safety violation.'
    );
  }

  if (isTestProject && duprEnv === 'production') {
    console.error('🚨 FATAL: Refusing to process - DUPR production in TEST project!');
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Environment mismatch: DUPR production environment in test project. This is a safety violation.'
    );
  }
}

/**
 * Same as assertEnvSafe but for use in onRequest handlers
 * Returns false if safe, throws Response if not
 */
export function assertEnvSafeForRequest(res: functions.Response): boolean {
  try {
    assertEnvSafe();
    return true;
  } catch (error) {
    res.status(500).json({
      error: 'Environment configuration error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

// ============================================
// EXPORTED ENVIRONMENT INFO
// ============================================

export const ENV = {
  isTest: isTestProject,
  isProd: isProdProject,
  projectId: PROJECT_ID,

  /** Get current DUPR environment ('uat' or 'production') */
  get duprEnv(): string {
    return getDuprEnv();
  },

  /** Check if Stripe is in test mode */
  get isStripeTest(): boolean {
    return getStripeKey().startsWith('sk_test_');
  },

  /** Check if Stripe is in live mode */
  get isStripeLive(): boolean {
    return getStripeKey().startsWith('sk_live_');
  }
};
