/**
 * DUPR Integration Service
 * 
 * Handles all DUPR API interactions:
 * - SSO Login (Login with DUPR)
 * - Match submission
 * - Player lookup
 * - Club verification
 * - Premium/Verified entitlement checks
 * 
 * FILE LOCATION: services/dupr/index.ts
 * VERSION: V05.17
 * 
 * IMPORTANT: Users MUST use SSO to link DUPR accounts.
 * Manual DUPR ID entry is NOT allowed per DUPR requirements.
 */

// ============================================
// CONFIGURATION
// ============================================

// UAT (Testing) Configuration - Switch to production after approval
const DUPR_CONFIG = {
  // Set to 'production' after DUPR approves your integration
  environment: 'uat' as 'uat' | 'production',
  
  // Test Club ID for UAT testing
  testClubId: '6915688914',
  
  uat: {
    baseUrl: 'https://api.uat.dupr.gg',
    authUrl: 'https://uat.dupr.gg',
    clientId: '4970118010',
    clientKey: 'test-ck-6181132e-cedf-45a6-fcb0-f88dda516175',
    clientSecret: 'test-cs-a27a555efe6348cff86532526db5cc5d',
  },
  
  production: {
    baseUrl: 'https://api.dupr.gg',
    authUrl: 'https://dupr.gg',
    clientId: '', // Will be provided after UAT approval
    clientKey: '', // Will be provided after UAT approval
    clientSecret: '', // Will be provided after UAT approval
  },
};

// Get current environment config
const getConfig = () => {
  return DUPR_CONFIG[DUPR_CONFIG.environment];
};

// ============================================
// TYPES
// ============================================

export interface DuprUser {
  duprId: string;
  firstName: string;
  lastName: string;
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
  // For doubles, each team has 2 players
}

export interface DuprMatchTeam {
  player1: DuprMatchPlayer;
  player2?: DuprMatchPlayer; // Only for doubles
  score: number[]; // Array of scores per game, e.g., [11, 8, 11]
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

export interface DuprSSOState {
  returnUrl: string;
  nonce: string;
  timestamp: number;
}

// ============================================
// SSO / LOGIN WITH DUPR
// ============================================

/**
 * Generate SSO URL for "Login with DUPR"
 * 
 * IMPORTANT: This is the ONLY way users can link their DUPR account.
 * Manual DUPR ID entry is NOT allowed per DUPR requirements.
 */
export function generateDuprSSOUrl(returnUrl: string): { url: string; state: DuprSSOState } {
  const config = getConfig();
  const nonce = generateNonce();
  
  const state: DuprSSOState = {
    returnUrl,
    nonce,
    timestamp: Date.now(),
  };
  
  // Encode state for URL
  const encodedState = btoa(JSON.stringify(state));
  
  // Build SSO URL
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${window.location.origin}/auth/dupr/callback`,
    response_type: 'code',
    scope: 'openid profile rating clubs',
    state: encodedState,
  });
  
  const url = `${config.authUrl}/oauth/authorize?${params.toString()}`;
  
  return { url, state };
}

/**
 * Generate Premium Login URL for DUPR+ or Verified gating
 * 
 * Required when user needs DUPR+ subscription or Verified status
 * to access premium features/events.
 */
export function generatePremiumLoginUrl(
  returnUrl: string, 
  requiredEntitlement: 'PREMIUM_L1' | 'VERIFIED_L1'
): string {
  const config = getConfig();
  const nonce = generateNonce();
  
  const state: DuprSSOState = {
    returnUrl,
    nonce,
    timestamp: Date.now(),
  };
  
  const encodedState = btoa(JSON.stringify(state));
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${window.location.origin}/auth/dupr/callback`,
    response_type: 'code',
    scope: 'openid profile rating clubs',
    state: encodedState,
    required_entitlement: requiredEntitlement,
    prompt: 'premium', // This shows the premium modal
  });
  
  return `${config.authUrl}/oauth/authorize?${params.toString()}`;
}

/**
 * Handle OAuth callback and exchange code for tokens
 */
export async function handleDuprCallback(
  code: string, 
  state: string
): Promise<{ user: DuprUser; accessToken: string; refreshToken: string }> {
  const config = getConfig();
  
  // Decode and validate state
  const decodedState: DuprSSOState = JSON.parse(atob(state));
  
  // Check state is not expired (5 minute window)
  if (Date.now() - decodedState.timestamp > 5 * 60 * 1000) {
    throw new Error('SSO state expired');
  }
  
  // Exchange code for tokens
  const tokenResponse = await fetch(`${config.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': config.clientId,
      'x-client-key': config.clientKey,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/auth/dupr/callback`,
      client_secret: config.clientSecret,
    }),
  });
  
  if (!tokenResponse.ok) {
    const error = await tokenResponse.json();
    throw new Error(error.message || 'Failed to exchange code for tokens');
  }
  
  const tokens = await tokenResponse.json();
  
  // Get user profile
  const user = await getDuprUserProfile(tokens.access_token);
  
  return {
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

// ============================================
// USER PROFILE & RATINGS
// ============================================

/**
 * Get DUPR user profile from access token
 */
export async function getDuprUserProfile(accessToken: string): Promise<DuprUser> {
  const config = getConfig();
  
  const response = await fetch(`${config.baseUrl}/player/v1.0/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-client-id': config.clientId,
      'x-client-key': config.clientKey,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch DUPR profile');
  }
  
  const data = await response.json();
  
  return {
    duprId: data.id,
    firstName: data.firstName,
    lastName: data.lastName,
    fullName: `${data.firstName} ${data.lastName}`,
    email: data.email,
    imageUrl: data.imageUrl,
    doublesRating: data.ratings?.doubles,
    doublesReliability: data.ratings?.doublesReliability,
    singlesRating: data.ratings?.singles,
    singlesReliability: data.ratings?.singlesReliability,
    isVerified: data.entitlements?.includes('VERIFIED_L1') || false,
    isPremium: data.entitlements?.includes('PREMIUM_L1') || false,
    entitlements: data.entitlements || [],
  };
}

/**
 * Look up a player by DUPR ID
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
  
  return {
    duprId: data.id,
    firstName: data.firstName,
    lastName: data.lastName,
    fullName: `${data.firstName} ${data.lastName}`,
    imageUrl: data.imageUrl,
    doublesRating: data.ratings?.doubles,
    doublesReliability: data.ratings?.doublesReliability,
    singlesRating: data.ratings?.singles,
    singlesReliability: data.ratings?.singlesReliability,
    isVerified: data.entitlements?.includes('VERIFIED_L1') || false,
    isPremium: data.entitlements?.includes('PREMIUM_L1') || false,
    entitlements: data.entitlements || [],
  };
}

// ============================================
// ENTITLEMENT CHECKS
// ============================================

/**
 * Check if user has required entitlement
 * 
 * Used for gating events that require DUPR+ or Verified status
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
 * 
 * Required for validating that organizers can manage clubs
 */
export async function getUserClubPermissions(
  accessToken: string
): Promise<DuprClubPermission[]> {
  const config = getConfig();
  
  const response = await fetch(`${config.baseUrl}/club/v1.0/me/memberships`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-client-id': config.clientId,
      'x-client-key': config.clientKey,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch club permissions');
  }
  
  const data = await response.json();
  
  return data.clubs?.map((club: any) => ({
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
  
  // DIRECTOR has higher permission than ORGANIZER
  if (requiredPermission === 'ORGANIZER') {
    return clubPermission.permission === 'DIRECTOR' || clubPermission.permission === 'ORGANIZER';
  }
  
  return clubPermission.permission === 'DIRECTOR';
}

// ============================================
// MATCH SUBMISSION
// ============================================

/**
 * Submit a match to DUPR
 * 
 * Requirements:
 * - All players must have DUPR IDs
 * - At least one team must score 6+ points
 * - Match type must be specified (SINGLES or DOUBLES)
 */
export async function submitMatchToDupr(
  accessToken: string,
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
  
  // Build request body
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
  
  const response = await fetch(`${config.baseUrl}/match/v1.0/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-client-id': config.clientId,
      'x-client-key': config.clientKey,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit match to DUPR');
  }
  
  const data = await response.json();
  
  return {
    matchId: data.id,
    status: data.status,
    createdAt: data.createdAt,
  };
}

/**
 * Submit multiple matches to DUPR (batch)
 */
export async function submitMatchesToDupr(
  accessToken: string,
  matches: DuprMatchSubmission[]
): Promise<DuprMatchResult[]> {
  const results: DuprMatchResult[] = [];
  
  for (const match of matches) {
    try {
      const result = await submitMatchToDupr(accessToken, match);
      results.push(result);
    } catch (error: any) {
      console.error(`Failed to submit match: ${error.message}`);
      results.push({
        matchId: '',
        status: 'REJECTED',
        createdAt: new Date().toISOString(),
      });
    }
  }
  
  return results;
}

/**
 * Delete a match from DUPR
 */
export async function deleteMatchFromDupr(
  accessToken: string,
  duprMatchId: string
): Promise<void> {
  const config = getConfig();
  
  const response = await fetch(`${config.baseUrl}/match/v1.0/${duprMatchId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-client-id': config.clientId,
      'x-client-key': config.clientKey,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete match from DUPR');
  }
}

// ============================================
// HELPERS
// ============================================

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

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
  // SSO
  generateDuprSSOUrl,
  generatePremiumLoginUrl,
  handleDuprCallback,
  
  // User
  getDuprUserProfile,
  lookupDuprPlayer,
  
  // Entitlements
  hasEntitlement,
  canJoinDuprEvent,
  
  // Clubs
  getUserClubPermissions,
  verifyClubPermission,
  
  // Matches
  submitMatchToDupr,
  submitMatchesToDupr,
  deleteMatchFromDupr,
  
  // Helpers
  formatDuprRating,
  getDuprRatingColor,
};

export default duprService;