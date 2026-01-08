/**
 * DUPR Integration Service
 *
 * Handles all DUPR API interactions:
 * - SSO Login via iframe (Login with DUPR)
 * - Match submission
 * - Player lookup
 * - Club verification
 * - Premium/Verified entitlement checks
 *
 * FILE LOCATION: services/dupr/index.ts
 * VERSION: V07.23 - Updated to use correct RaaS API endpoints per docs
 *
 * API DOCUMENTATION: https://dupr.gitbook.io/dupr-raas
 * SWAGGER UAT: https://uat.mydupr.com/api/swagger-ui/index.html
 * SWAGGER PROD: https://prod.mydupr.com/api/swagger-ui/index.html
 *
 * IMPORTANT: Users MUST use SSO to link DUPR accounts.
 * Manual DUPR ID entry is NOT allowed per DUPR requirements.
 *
 * API VERSION: v1.0 (used in all endpoint paths)
 */

// ============================================
// CONFIGURATION
// ============================================

// UAT (Testing) Configuration - Switch to production after approval
// Based on DUPR RaaS documentation: https://dupr.gitbook.io/dupr-raas
const DUPR_CONFIG = {
  // Set to 'production' after DUPR approves your integration
  environment: 'uat' as 'uat' | 'production',

  // Test Club ID for UAT testing
  testClubId: '6915688914',

  uat: {
    // DUPR RaaS API base URL for UAT
    baseUrl: 'https://uat.mydupr.com/api',
    // DUPR uses iframe login for SSO
    loginUrl: 'https://uat.dupr.gg/login-external-app',
    clientId: '4970118010',
    clientKey: 'test-ck-6181132e-cedf-45a6-fcb0-f88dda516175',
    clientSecret: 'test-cs-a27a555efe6348cff86532526db5cc5d',
  },

  production: {
    // DUPR RaaS API base URL for Production
    baseUrl: 'https://prod.mydupr.com/api',
    loginUrl: 'https://dashboard.dupr.com/login-external-app',
    clientId: '', // Will be provided after UAT approval
    clientKey: '', // Will be provided after UAT approval
    clientSecret: '', // Will be provided after UAT approval
  },
};

// API version used in endpoint paths
const API_VERSION = 'v1.0';

// Cache for API token (valid for 1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get current environment config
export const getConfig = () => {
  return DUPR_CONFIG[DUPR_CONFIG.environment];
};

// Get versioned endpoint path
export const getEndpoint = (path: string) => {
  const config = getConfig();
  // Replace {version} placeholder with actual version
  const versionedPath = path.replace('{version}', API_VERSION);
  return `${config.baseUrl}${versionedPath}`;
};

/**
 * Get API token for DUPR RaaS API calls
 *
 * Per DUPR documentation (https://dupr.gitbook.io/dupr-raas/quick-start-and-token-generation):
 * 1. Base64 encode clientKey:clientSecret
 * 2. POST to /auth/{version}/token with x-authorization header
 * 3. Token is valid for 1 hour, stateless, can be cached/shared
 */
export async function getApiToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const config = getConfig();

  // Base64 encode clientKey:clientSecret
  const credentials = btoa(`${config.clientKey}:${config.clientSecret}`);

  // Use versioned endpoint: /auth/v1.0/token
  const tokenUrl = getEndpoint('/auth/{version}/token');

  console.log('[DUPR] Requesting token from:', tokenUrl);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'x-authorization': credentials,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('[DUPR] Token generation failed:', {
      status: response.status,
      url: tokenUrl,
      error: errorText,
    });
    throw new Error(`Failed to get DUPR API token: ${response.status}`);
  }

  const data = await response.json();
  const token = data.token || data.accessToken || data.result?.token;

  if (!token) {
    throw new Error('No token returned from DUPR API');
  }

  // Cache token for 55 minutes (tokens valid for 1 hour)
  cachedToken = {
    token,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };

  console.log('[DUPR] API token generated successfully');
  return token;
}

/**
 * Test DUPR API connection by attempting token generation
 * Returns diagnostic info for troubleshooting
 */
export async function testDuprConnection(): Promise<{
  success: boolean;
  environment: 'uat' | 'production';
  baseUrl: string;
  tokenUrl: string;
  tokenReceived: boolean;
  error?: string;
  responseStatus?: number;
}> {
  const config = getConfig();
  const tokenUrl = getEndpoint('/auth/{version}/token');

  try {
    // Clear cached token to force fresh request
    cachedToken = null;

    const credentials = btoa(`${config.clientKey}:${config.clientSecret}`);

    console.log('[DUPR] Testing connection to:', tokenUrl);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'x-authorization': credentials,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[DUPR] Connection test failed:', response.status, response.statusText);
      return {
        success: false,
        environment: DUPR_CONFIG.environment,
        baseUrl: config.baseUrl,
        tokenUrl,
        tokenReceived: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseStatus: response.status,
      };
    }

    const data = await response.json();
    const token = data.token || data.accessToken || data.result?.token;

    console.log('[DUPR] Connection test result:', token ? 'SUCCESS' : 'NO TOKEN');

    return {
      success: !!token,
      environment: DUPR_CONFIG.environment,
      baseUrl: config.baseUrl,
      tokenUrl,
      tokenReceived: !!token,
      error: token ? undefined : 'No token in response',
    };
  } catch (error) {
    console.error('[DUPR] Connection test error:', error);
    return {
      success: false,
      environment: DUPR_CONFIG.environment,
      baseUrl: config.baseUrl,
      tokenUrl,
      tokenReceived: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

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
  
  const response = await fetch(`${config.baseUrl}/player/v1.0/${duprId}`, {
    headers: {
      'x-client-id': config.clientId,
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
// MATCH SUBMISSION
// ============================================

/**
 * Submit a match to DUPR using RaaS API
 *
 * Per DUPR documentation (https://dupr.gitbook.io/dupr-raas):
 * - Endpoint: POST /match/{version}/create
 * - Uses token-based authentication (Bearer token from /auth/{version}/token)
 * - All players must have DUPR IDs
 * - At least one team must score 6+ points
 * - No duplicate players in a single submission
 * - No tied games (must have a winner)
 * - Unique identifier per match (prevents duplicates)
 * - matchSource: CLUB (with clubId) or PARTNER (without)
 *
 * @param _accessToken - User's DUPR access token (from SSO login) - kept for backwards compatibility
 * @param match - Match data to submit
 */
export async function submitMatchToDupr(
  _accessToken: string,
  match: DuprMatchSubmission
): Promise<DuprMatchResult> {
  // Validate minimum score requirement
  const hasMinimumScore = match.games.some(
    game => game.team1Score >= 6 || game.team2Score >= 6
  );

  if (!hasMinimumScore) {
    throw new Error('At least one team must score 6 or more points');
  }

  // Validate no tied games
  const hasTiedGame = match.games.some(
    game => game.team1Score === game.team2Score
  );

  if (hasTiedGame) {
    throw new Error('All games must have a winner (no ties allowed)');
  }

  // Validate unique identifier
  if (!match.identifier) {
    throw new Error('Match identifier is required for DUPR submission');
  }

  // Get API token using client credentials
  const apiToken = await getApiToken();

  // Use versioned endpoint: /match/v1.0/create
  const submitUrl = getEndpoint('/match/{version}/create');

  // Build request body per DUPR RaaS API spec
  // See: https://uat.mydupr.com/api/swagger-ui/index.html
  const body: Record<string, unknown> = {
    identifier: match.identifier,
    matchSource: match.matchSource,
    matchType: match.matchType,
    matchDate: match.matchDate,
    eventName: match.eventName,
    location: match.location,
    team1: {
      player1Id: match.team1.player1.duprId,
      player2Id: match.team1.player2?.duprId,
    },
    team2: {
      player1Id: match.team2.player1.duprId,
      player2Id: match.team2.player2?.duprId,
    },
    games: match.games,
  };

  // Only include clubId if matchSource is CLUB
  if (match.matchSource === 'CLUB' && match.clubId) {
    body.clubId = match.clubId;
  }

  console.log('[DUPR] Submitting match:', {
    url: submitUrl,
    identifier: match.identifier,
    matchSource: match.matchSource,
    matchType: match.matchType,
    team1Player1: match.team1.player1.duprId,
    team2Player1: match.team2.player1.duprId,
    gamesCount: match.games.length,
  });

  // DUPR RaaS API endpoint for match creation
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let errorMessage = 'Failed to submit match to DUPR';
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch {
      if (errorText) {
        errorMessage = `DUPR API Error (${response.status}): ${errorText.substring(0, 200)}`;
      } else {
        errorMessage = `DUPR API Error: ${response.status} ${response.statusText}`;
      }
    }
    console.error('[DUPR] Submit failed:', {
      status: response.status,
      statusText: response.statusText,
      url: submitUrl,
      error: errorText.substring(0, 500),
    });
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const result = data.result || data;

  console.log('[DUPR] Match submitted successfully:', result);

  return {
    matchId: result.id || result.matchId,
    status: result.status || 'PENDING',
    createdAt: result.createdAt || new Date().toISOString(),
  };
}

/**
 * Delete a match from DUPR using RaaS API
 *
 * Endpoint: DELETE /match/{version}/delete
 */
export async function deleteMatchFromDupr(
  _accessToken: string,
  duprMatchId: string
): Promise<void> {
  // Get API token using client credentials
  const apiToken = await getApiToken();

  // Use versioned endpoint: /match/v1.0/delete
  // Note: The delete endpoint may require the match ID in the body or as query param
  // Check Swagger docs for exact format
  const deleteUrl = getEndpoint('/match/{version}/delete');

  console.log('[DUPR] Deleting match:', { url: deleteUrl, matchId: duprMatchId });

  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ matchId: duprMatchId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete match from DUPR');
  }

  console.log('[DUPR] Match deleted successfully:', duprMatchId);
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
  getApiToken,
  testDuprConnection,

  // SSO (iframe method)
  getDuprLoginIframeUrl,
  parseDuprLoginEvent,

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

  // Matches
  submitMatchToDupr,
  deleteMatchFromDupr,

  // Rating Refresh
  refreshMyDuprRating,

  // Helpers
  formatDuprRating,
  getDuprRatingColor,
};

export default duprService;