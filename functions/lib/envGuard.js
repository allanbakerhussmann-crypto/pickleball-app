"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = exports.isProdProject = exports.isTestProject = void 0;
exports.assertEnvSafe = assertEnvSafe;
exports.assertEnvSafeForRequest = assertEnvSafeForRequest;
const functions = __importStar(require("firebase-functions"));
const params_1 = require("firebase-functions/params");
// DUPR environment param
const DUPR_ENV = (0, params_1.defineString)('DUPR_ENV', { default: 'production' });
// ============================================
// ENVIRONMENT DETECTION
// ============================================
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
exports.isTestProject = PROJECT_ID === 'pickleball-app-test';
exports.isProdProject = PROJECT_ID === 'pickleball-app-dev';
// ============================================
// KEY DETECTION (checked at runtime)
// ============================================
function getStripeKey() {
    var _a;
    return ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) || process.env.STRIPE_SECRET_KEY || '';
}
function getDuprEnv() {
    try {
        return DUPR_ENV.value();
    }
    catch (_a) {
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
    if (exports.isTestProject && isLiveStripeKey) {
        console.error('🚨 WARNING: Live Stripe key detected in TEST project!');
    }
    if (exports.isProdProject && isTestStripeKey) {
        console.error('🚨 WARNING: Test Stripe key detected in PROD project!');
    }
    if (exports.isTestProject && duprEnv === 'production') {
        console.error('🚨 WARNING: DUPR production env in TEST project!');
    }
    if (exports.isProdProject && duprEnv === 'uat') {
        console.error('🚨 WARNING: DUPR UAT env in PROD project!');
    }
    // Log environment info
    console.log(`📍 Environment: ${exports.isTestProject ? 'TEST' : exports.isProdProject ? 'PROD' : 'UNKNOWN'} (${PROJECT_ID})`);
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
function assertEnvSafe() {
    const stripeKey = getStripeKey();
    const duprEnv = getDuprEnv();
    const isTestStripeKey = stripeKey.startsWith('sk_test_');
    const isLiveStripeKey = stripeKey.startsWith('sk_live_');
    if (exports.isTestProject && isLiveStripeKey) {
        console.error('🚨 FATAL: Refusing to process - Live Stripe key in TEST project!');
        throw new functions.https.HttpsError('failed-precondition', 'Environment mismatch: Live Stripe key detected in test project. This is a safety violation.');
    }
    if (exports.isProdProject && isTestStripeKey) {
        console.error('🚨 FATAL: Refusing to process - Test Stripe key in PROD project!');
        throw new functions.https.HttpsError('failed-precondition', 'Environment mismatch: Test Stripe key detected in production project. This is a safety violation.');
    }
    if (exports.isTestProject && duprEnv === 'production') {
        console.error('🚨 FATAL: Refusing to process - DUPR production in TEST project!');
        throw new functions.https.HttpsError('failed-precondition', 'Environment mismatch: DUPR production environment in test project. This is a safety violation.');
    }
}
/**
 * Same as assertEnvSafe but for use in onRequest handlers
 * Returns false if safe, throws Response if not
 */
function assertEnvSafeForRequest(res) {
    try {
        assertEnvSafe();
        return true;
    }
    catch (error) {
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
exports.ENV = {
    isTest: exports.isTestProject,
    isProd: exports.isProdProject,
    projectId: PROJECT_ID,
    /** Get current DUPR environment ('uat' or 'production') */
    get duprEnv() {
        return getDuprEnv();
    },
    /** Check if Stripe is in test mode */
    get isStripeTest() {
        return getStripeKey().startsWith('sk_test_');
    },
    /** Check if Stripe is in live mode */
    get isStripeLive() {
        return getStripeKey().startsWith('sk_live_');
    }
};
//# sourceMappingURL=envGuard.js.map