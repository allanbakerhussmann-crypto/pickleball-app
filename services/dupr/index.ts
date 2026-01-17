/**
 * DUPR Integration Service (Client-Side)
 *
 * Handles client-side DUPR interactions:
 * - SSO Login via iframe (Login with DUPR)
 * - Premium/Verified entitlement checks
 * - Rating display helpers
 *
 * V07.54: Removed hardcoded credentials, now uses Vite environment variables
 * - VITE_DUPR_ENV: Environment ('uat' | 'production'), defaults to 'production'
 * - VITE_DUPR_CLIENT_KEY: Client key for SSO iframe URL (semi-public)
 *
 * NOTE: Match submission happens server-side via Cloud Functions only.
 * The clientSecret is NEVER exposed to client code.
 *
 * FILE LOCATION: services/dupr/index.ts
 * VERSION: V07.54
 *
 * API DOCUMENTATION: https://dupr.gitbook.io/dupr-raas
 * SWAGGER PROD: https://prod.mydupr.com/api/swagger-ui/index.html
 *
 * IMPORTANT: Users MUST use SSO to link DUPR accounts.
 * Manual DUPR ID entry is NOT allowed per DUPR requirements.
 */

// ============================================
// CONFIGURATION (from Vite environment variables)
// ============================================

const DUPR_CONFIG = {
  // Environment from Vite env (defaults to production)
  environment: (import.meta.env.VITE_DUPR_ENV || 'production') as 'uat' | 'production',

  uat: {
    baseUrl: 'https://uat.mydupr.com/api',
    loginUrl: 'https://uat.dupr.gg/login-external-app',
    // Client key from env (needed for SSO iframe URL - semi-public, visible in URL)
    clientKey: import.meta.env.VITE_DUPR_CLIENT_KEY || '',
  },

  production: {
    baseUrl: 'https://prod.mydupr.com/api',
    loginUrl: 'https://dashboard.dupr.com/login-external-app',
    // Client key from env (needed for SSO iframe URL - semi-public, visible in URL)
    clientKey: import.meta.env.VITE_DUPR_CLIENT_KEY || '',
  },
};

// API version used in endpoint paths
const API_VERSION = 'v1.0';

// Get current environment config
export const getConfig = () => {
  return DUPR_CONFIG[DUPR_CONFIG.environment];
};

// Get current environment name
export const getEnvironment = () => DUPR_CONFIG.environment;

// Get versioned endpoint path
export const getEndpoint = (path: string) => {
  const config = getConfig();
  // Replace {version} placeholder with actual version
  const versionedPath = path.replace('{version}', API_VERSION);
  return `${config.baseUrl}${versionedPath}`;
};

/**
 * NOTE: getApiToken() has been removed in V07.54
 *
 * All DUPR API calls that require authentication now happen
 * server-side via Cloud Functions. The client never needs
 * to obtain an API token directly.
 *
 * For match submission, use the Cloud Function dupr_submitMatches
 * For rating refresh, use the Cloud Function dupr_refreshMyRating
 */

// ============================================
// TYPES
// ============================================

export interface DuprUser {
  duprId: string;
  odUserId?: string; // Internal ID from DUPR
  firstName?: string;
  lastName?: string;
  fullName: string;
  email?: string;
  imageUrl?: string;
  doublesRating?: number;
  doublesReliability?: number;
  singlesRating?: number;
  singlesReliability?: number;
  isVerified: boolean;
  isPremium: boolean;
  entitlements: DuprEntitlement[];
}

export type DuprEntitlement = 
  | 'PREMIUM_L1'   // DUPR+ subscription
  | 'VERIFIED_L1'; // DUPR Verified status

export interface DuprClubPermission {
  clubId: string;
  clubName: string;
  permission: 'DIRECTOR' | 'ORGANIZER' | 'MEMBER';
}

export type DuprMatchType = 'SINGLES' | 'DOUBLES';

export interface DuprMatchPlayer {
  duprId: string;
}

export interface DuprMatchTeam {
  player1: DuprMatchPlayer;
  player2?: DuprMatchPlayer; // Only for doubles
  score: number[]; // Array of scores per game
}

/**
 * Match source type for DUPR submission
 * - CLUB: Match is from a DUPR-registered club (requires clubId)
 * - PARTNER: Match is from a partner integration (no clubId needed)
 */
export type DuprMatchSource = 'CLUB' | 'PARTNER';

export interface DuprMatchSubmission {
  /** Unique identifier for this match - prevents duplicate submissions */
  identifier: string;
  /** Source type: CLUB (with clubId) or PARTNER (without) */
  matchSource: DuprMatchSource;
  matchType: DuprMatchType;
  matchDate: string; // ISO date string
  eventName?: string;
  location?: string;
  clubId?: string; // DUPR Club ID - required if matchSource is CLUB
  team1: DuprMatchTeam;
  team2: DuprMatchTeam;
  games: Array<{
    team1Score: number;
    team2Score: number;
  }>;
}

export interface DuprMatchResult {
  matchId: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  createdAt: string;
}

// Event data received from DUPR iframe
export interface DuprLoginEvent {
  userToken: string;      // Access token
  refreshToken: string;   // Refresh token
  id: string;             // Internal user ID
  duprId: string;         // Public DUPR ID
  stats?: {
    doublesRating?: number;
    singlesRating?: number;
  };
}

// Event data received from DUPR Premium Login iframe
// Note: Field names TBD from actual DUPR payload - safe logging will reveal structure
export interface DuprPremiumLoginEvent {
  duprId?: string;
  subscriptions?: Array<{
    productId?: string;      // From DUPR API schema (may also be 'product')
    promotionId?: string;    // From DUPR API schema
    status?: string;         // e.g., 'active', 'expired'
    expiresAt?: number;      // Expiry timestamp (if provided)
  }>;
}

// ============================================
// SSO / LOGIN WITH DUPR (IFRAME METHOD)
// ============================================

/**
 * Get the DUPR login iframe URL
 * 
 * DUPR uses an iframe-based implicit OAuth flow.
 * The clientKey must be base64 encoded in the URL.
 */
export function getDuprLoginIframeUrl(): string {
  const config = getConfig();
  
  // Base64 encode the clientKey as required by DUPR
  const encodedClientKey = btoa(config.clientKey);
  
  return `${config.loginUrl}/${encodedClientKey}`;
}

/**
 * Parse DUPR login event from iframe message
 * 
 * When user logs in via iframe, DUPR sends a message event
 * with user info and tokens.
 */
export function parseDuprLoginEvent(event: MessageEvent): DuprLoginEvent | null {
  try {
    // Validate the event origin
    const validOrigins = [
      'https://uat.dupr.gg',
      'https://dashboard.dupr.com',
      'https://dupr.gg',
    ];
    
    if (!validOrigins.some(origin => event.origin.includes(origin.replace('https://', '')))) {
      console.warn('DUPR login event from unexpected origin:', event.origin);
      // Still try to parse in case it's valid
    }
    
    const data = event.data;
    
    // Check if this is a DUPR login event
    if (data && data.duprId && data.userToken) {
      return {
        userToken: data.userToken,
        refreshToken: data.refreshToken,
        id: data.id,
        duprId: data.duprId,
        stats: data.stats,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing DUPR login event:', error);
    return null;
  }
}

// ============================================
// DUPR+ PREMIUM LOGIN (IFRAME METHOD)
// ============================================

/**
 * Get the DUPR Premium Login iframe URL
 *
 * Used to verify DUPR+ subscription status.
 * The clientKey must be base64 encoded in the URL.
 *
 * URLs per DUPR docs:
 * - UAT: https://uat.dupr.gg/premium-login?clientKey=${base64EncodedClientKey}
 * - Prod: https://dashboard.dupr.com/premium-login?clientKey=${base64EncodedClientKey}
 */
export function getDuprPremiumLoginIframeUrl(): string {
  const config = getConfig();

  // Base64 encode the clientKey as required by DUPR
  const encodedClientKey = btoa(config.clientKey);

  // Premium login URL differs from regular login URL
  const baseUrl = DUPR_CONFIG.environment === 'production'
    ? 'https://dashboard.dupr.com/premium-login'
    : 'https://uat.dupr.gg/premium-login';

  return `${baseUrl}?clientKey=${encodedClientKey}`;
}

/**
 * Parse DUPR Premium Login event from iframe message
 *
 * When user completes premium login, DUPR sends a message event
 * with user info and subscription data.
 *
 * IMPORTANT: Field structure is TBD - this includes safe logging
 * to discover the actual payload format during UAT testing.
 */
export function parseDuprPremiumLoginEvent(event: MessageEvent): DuprPremiumLoginEvent | null {
  try {
    // Validate the event origin
    const validOrigins = [
      'uat.dupr.gg',
      'dashboard.dupr.com',
      'dupr.gg',
    ];

    if (!validOrigins.some(origin => event.origin.includes(origin))) {
      console.warn('[DUPR Premium] Login event from unexpected origin:', event.origin);
      return null;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') {
      return null;
    }

    // Safe logging - only log top-level keys (no tokens/secrets)
    console.log('[DUPR Premium] Login event received, keys:', Object.keys(data));

    // Log subscription-related fields for debugging
    if (data.subscriptions) {
      console.log('[DUPR Premium] Subscriptions found:',
        data.subscriptions.map((s: Record<string, unknown>) => ({
          hasProductId: 'productId' in s,
          hasProduct: 'product' in s,
          hasStatus: 'status' in s,
          hasExpiresAt: 'expiresAt' in s,
        }))
      );
    }

    // Extract subscriptions if present
    if (data.subscriptions || data.duprId) {
      return {
        duprId: data.duprId,
        subscriptions: data.subscriptions,
      };
    }

    return null;
  } catch (error) {
    console.error('[DUPR Premium] Error parsing login event:', error);
    return null;
  }
}

// ============================================
// USER PROFILE & RATINGS
// ============================================

/**
 * Get DUPR user profile using access token
 * 
 * Uses the token received from iframe login.
 * Note: This token has read-only permissions.
 */
export async function getDuprUserProfile(accessToken: string): Promise<DuprUser> {
  const config = getConfig();
  
  const response = await fetch(`${config.baseUrl}/player/v1.0/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('DUPR profile fetch failed:', errorText);
    throw new Error('Failed to fetch DUPR profile');
  }
  
  const data = await response.json();
  
  // Handle response structure - DUPR API returns result object
  const result = data.result || data;
  
  return {
    duprId: result.duprId || result.id,
    odUserId: result.id,
    firstName: result.firstName,
    lastName: result.lastName,
    fullName: result.fullName || `${result.firstName || ''} ${result.lastName || ''}`.trim(),
    email: result.email,
    imageUrl: result.imageUrl,
    doublesRating: result.ratings?.doubles || result.doublesRating,
    doublesReliability: result.ratings?.doublesReliability,
    singlesRating: result.ratings?.singles || result.singlesRating,
    singlesReliability: result.ratings?.singlesReliability,
    isVerified: result.entitlements?.includes('VERIFIED_L1') || false,
    isPremium: result.entitlements?.includes('PREMIUM_L1') || false,
    entitlements: result.entitlements || [],
  };
}

/**
 * Get basic user info (public endpoint)
 */
export async function getDuprBasicInfo(accessToken: string): Promise<any> {
  const cfg = getConfig();
  
  const response = await fetch(`${cfg.baseUrl}/player/v1.0/me/basic`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch DUPR basic info');
  }
  
  return response.json();
}

/**
 * Look up a player by DUPR ID (requires partner token)
 */
export async function lookupDuprPlayer(duprId: string): Promise<DuprUser | null> {
  const config = getConfig();

  // Note: Player lookup uses clientKey only (semi-public, read-only API)
  // The x-client-id header is not required for player lookups
  const response = await fetch(`${config.baseUrl}/player/v1.0/${duprId}`, {
    headers: {
      'x-client-key': config.clientKey,
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error('Failed to lookup DUPR player');
  }
  
  const data = await response.json();
  const result = data.result || data;
  
  return {
    duprId: result.duprId || result.id,
    fullName: result.fullName || `${result.firstName || ''} ${result.lastName || ''}`.trim(),
    firstName: result.firstName,
    lastName: result.lastName,
    imageUrl: result.imageUrl,
    doublesRating: result.ratings?.doubles,
    doublesReliability: result.ratings?.doublesReliability,
    singlesRating: result.ratings?.singles,
    singlesReliability: result.ratings?.singlesReliability,
    isVerified: result.entitlements?.includes('VERIFIED_L1') || false,
    isPremium: result.entitlements?.includes('PREMIUM_L1') || false,
    entitlements: result.entitlements || [],
  };
}

// ============================================
// ENTITLEMENT CHECKS
// ============================================

/**
 * Check if user has required entitlement
 */
export function hasEntitlement(
  user: DuprUser, 
  required: 'PREMIUM_L1' | 'VERIFIED_L1'
): boolean {
  return user.entitlements.includes(required);
}

/**
 * Check if user can join a DUPR-gated event
 */
export function canJoinDuprEvent(
  user: DuprUser | null,
  eventRequirements: {
    requiresDupr: boolean;
    requiresPremium?: boolean;
    requiresVerified?: boolean;
    minRating?: number;
    maxRating?: number;
  }
): { canJoin: boolean; reason?: string } {
  if (!eventRequirements.requiresDupr) {
    return { canJoin: true };
  }
  
  if (!user) {
    return { canJoin: false, reason: 'DUPR account required' };
  }
  
  if (eventRequirements.requiresPremium && !hasEntitlement(user, 'PREMIUM_L1')) {
    return { canJoin: false, reason: 'DUPR+ subscription required' };
  }
  
  if (eventRequirements.requiresVerified && !hasEntitlement(user, 'VERIFIED_L1')) {
    return { canJoin: false, reason: 'DUPR Verified status required' };
  }
  
  const rating = user.doublesRating || 0;
  
  if (eventRequirements.minRating && rating < eventRequirements.minRating) {
    return { canJoin: false, reason: `Minimum rating ${eventRequirements.minRating} required` };
  }
  
  if (eventRequirements.maxRating && rating > eventRequirements.maxRating) {
    return { canJoin: false, reason: `Maximum rating ${eventRequirements.maxRating} exceeded` };
  }
  
  return { canJoin: true };
}

// ============================================
// CLUB VERIFICATION
// ============================================

/**
 * Get user's club permissions
 */
export async function getUserClubPermissions(
  accessToken: string
): Promise<DuprClubPermission[]> {
  const config = getConfig();
  
  const response = await fetch(`${config.baseUrl}/club/v1.0/me/memberships`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch club permissions');
  }
  
  const data = await response.json();
  const result = data.result || data;
  
  return result.clubs?.map((club: any) => ({
    clubId: club.id,
    clubName: club.name,
    permission: club.permission,
  })) || [];
}

/**
 * Verify user has permission to manage a specific club
 */
export async function verifyClubPermission(
  accessToken: string,
  duprClubId: string,
  requiredPermission: 'DIRECTOR' | 'ORGANIZER'
): Promise<boolean> {
  const permissions = await getUserClubPermissions(accessToken);
  
  const clubPermission = permissions.find(p => p.clubId === duprClubId);
  
  if (!clubPermission) return false;
  
  if (requiredPermission === 'ORGANIZER') {
    return clubPermission.permission === 'DIRECTOR' || clubPermission.permission === 'ORGANIZER';
  }
  
  return clubPermission.permission === 'DIRECTOR';
}

// ============================================
// MATCH SUBMISSION (DEPRECATED - Use Cloud Functions)
// ============================================

/**
 * @deprecated V07.54: Use Cloud Function dupr_submitMatches instead.
 *
 * Client-side match submission is no longer supported as credentials
 * are now stored server-side only via Firebase Secret Manager.
 *
 * This function is kept for backwards compatibility but will throw an error.
 * Calling code should be updated to use httpsCallable('dupr_submitMatches').
 */
export async function submitMatchToDupr(
  _accessToken: string,
  _match: DuprMatchSubmission
): Promise<DuprMatchResult> {
  console.error('[DUPR] submitMatchToDupr is deprecated. Use dupr_submitMatches Cloud Function.');
  throw new Error(
    '[DUPR] Client-side match submission is deprecated in V07.54. ' +
    'Use the dupr_submitMatches Cloud Function instead. ' +
    'See: https://firebase.google.com/docs/functions/callable'
  );
}

/**
 * @deprecated V07.54: Use Cloud Functions for match deletion.
 *
 * Client-side match deletion is no longer supported as credentials
 * are now stored server-side only.
 */
export async function deleteMatchFromDupr(
  _accessToken: string,
  _duprMatchId: string
): Promise<void> {
  console.error('[DUPR] deleteMatchFromDupr is deprecated. Use Cloud Functions.');
  throw new Error(
    '[DUPR] Client-side match deletion is deprecated in V07.54. ' +
    'Use Cloud Functions instead.'
  );
}

// ============================================
// RATING REFRESH (Cloud Function)
// ============================================

/**
 * Refresh current user's DUPR rating from the DUPR API
 *
 * This calls the `dupr_refreshMyRating` Cloud Function which:
 * 1. Fetches the latest rating from DUPR API
 * 2. Updates the user's profile in Firestore
 * 3. Returns the new rating values
 *
 * Note: The daily auto-sync runs at 3 AM NZ time for all users.
 * This function allows users to manually refresh their rating on-demand.
 */
export const refreshMyDuprRating = async (): Promise<{
  doublesRating?: number;
  singlesRating?: number;
  doublesReliability?: number;
  singlesReliability?: number;
  syncedAt: number;
}> => {
  const { httpsCallable } = await import('@firebase/functions');
  const { functions } = await import('../firebase/config');

  const callable = httpsCallable<
    Record<string, never>,
    {
      doublesRating?: number;
      singlesRating?: number;
      doublesReliability?: number;
      singlesReliability?: number;
      syncedAt: number;
    }
  >(functions, 'dupr_refreshMyRating');

  const result = await callable({});
  return result.data;
};

// ============================================
// HELPERS
// ============================================

/**
 * Format rating for display (e.g., "4.25")
 */
export function formatDuprRating(rating: number | undefined): string {
  if (!rating) return 'NR';
  return rating.toFixed(2);
}

/**
 * Get rating color based on level
 */
export function getDuprRatingColor(rating: number | undefined): string {
  if (!rating) return 'gray';
  if (rating >= 6.0) return 'purple';  // Pro
  if (rating >= 5.0) return 'red';     // Advanced
  if (rating >= 4.0) return 'orange';  // Intermediate-Advanced
  if (rating >= 3.0) return 'yellow';  // Intermediate
  return 'green';                       // Beginner
}

// ============================================
// EXPORTS
// ============================================

export const duprService = {
  // Config
  getConfig,

  // SSO (iframe method)
  getDuprLoginIframeUrl,
  parseDuprLoginEvent,

  // DUPR+ Premium Login (iframe method)
  getDuprPremiumLoginIframeUrl,
  parseDuprPremiumLoginEvent,

  // User
  getDuprUserProfile,
  getDuprBasicInfo,
  lookupDuprPlayer,

  // Entitlements
  hasEntitlement,
  canJoinDuprEvent,

  // Clubs
  getUserClubPermissions,
  verifyClubPermission,

  // Matches (deprecated - use Cloud Functions)
  submitMatchToDupr,     // @deprecated - throws error, use dupr_submitMatches
  deleteMatchFromDupr,   // @deprecated - throws error, use Cloud Functions

  // Rating Refresh
  refreshMyDuprRating,

  // Helpers
  formatDuprRating,
  getDuprRatingColor,
};

export default duprService;