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
 * VERSION: V05.17.1 - Fixed to use iframe-based OAuth per DUPR docs
 * 
 * IMPORTANT: Users MUST use SSO to link DUPR accounts.
 * Manual DUPR ID entry is NOT allowed per DUPR requirements.
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

// Cache for API token (valid for 1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get current environment config
export const getConfig = () => {
  return DUPR_CONFIG[DUPR_CONFIG.environment];
};

/**
 * Get API token for DUPR RaaS API calls
 *
 * Per DUPR documentation:
 * 1. Base64 encode clientKey:clientSecret
 * 2. POST to /token with x-authorization header
 * 3. Token is valid for 1 hour
 */
export async function getApiToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const config = getConfig();

  // Base64 encode clientKey:clientSecret
  const credentials = btoa(`${config.clientKey}:${config.clientSecret}`);

  const response = await fetch(`${config.baseUrl}/token`, {
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
};

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

export interface DuprMatchSubmission {
  matchType: DuprMatchType;
  matchDate: string; // ISO date string
  eventName?: string;
  location?: string;
  clubId?: string; // DUPR Club ID if club match
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
 * Per DUPR documentation:
 * - Uses token-based authentication (get token first, then use Bearer token)
 * - All players must have DUPR IDs
 * - At least one team must score 6+ points
 *
 * @param _accessToken - User's DUPR access token (from SSO login) - kept for backwards compatibility
 * @param match - Match data to submit
 */
export async function submitMatchToDupr(
  _accessToken: string,
  match: DuprMatchSubmission
): Promise<DuprMatchResult> {
  const config = getConfig();

  // Validate minimum score requirement
  const hasMinimumScore = match.games.some(
    game => game.team1Score >= 6 || game.team2Score >= 6
  );

  if (!hasMinimumScore) {
    throw new Error('At least one team must score 6 or more points');
  }

  // Get API token using client credentials
  const apiToken = await getApiToken();

  // Build request body per DUPR RaaS API spec
  const body = {
    matchType: match.matchType,
    matchDate: match.matchDate,
    eventName: match.eventName,
    location: match.location,
    clubId: match.clubId,
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

  console.log('[DUPR] Submitting match:', {
    url: `${config.baseUrl}/result/submit`,
    matchType: match.matchType,
    team1Player1: match.team1.player1.duprId,
    team2Player1: match.team2.player1.duprId,
    gamesCount: match.games.length,
  });

  // DUPR RaaS API endpoint for match submission
  const response = await fetch(`${config.baseUrl}/result/submit`, {
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
      url: response.url,
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
 */
export async function deleteMatchFromDupr(
  _accessToken: string,
  duprMatchId: string
): Promise<void> {
  const config = getConfig();

  // Get API token using client credentials
  const apiToken = await getApiToken();

  // DUPR RaaS API endpoint for match deletion
  const response = await fetch(`${config.baseUrl}/result/${duprMatchId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete match from DUPR');
  }

  console.log('[DUPR] Match deleted successfully:', duprMatchId);
}

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

  // Helpers
  formatDuprRating,
  getDuprRatingColor,
};

export default duprService;