/**
 * Comms Token Definitions
 *
 * Shared token configuration for SMS/Email template system.
 * Tokens are displayed as user-friendly labels in the UI but stored
 * as {{tokenName}} format for backend processing.
 *
 * SCOPING RULES (non-negotiable):
 * ─────────────────────────────────────────────────────────────────
 * A message can only use data that exists at send time.
 *
 * Scope determines:
 *   - Which players are recipients
 *   - Which data exists
 *   - Which insert options are shown
 *
 * | Scope              | Available Tokens                           |
 * |--------------------|-------------------------------------------|
 * | Event/League-wide  | Player Name, Event Name, Venue            |
 * | Division message   | + Division Name                           |
 * | Match reminder     | + Court, Match Time, Team A, Team B       |
 *
 * UI: Only show tokens valid for current scope (first line of defence)
 * Backend: Validate data exists before sending (last line of defence)
 * ─────────────────────────────────────────────────────────────────
 *
 * @file services/comms/tokens.ts
 * @version 07.50
 */

// ============================================
// TYPES
// ============================================

export type TokenContext = 'league' | 'tournament';

export interface TokenOptions {
  /** True ONLY when composing from a specific match */
  hasMatchContext?: boolean;
}

export interface TokenItem {
  /** User-friendly display label */
  label: string;
  /** Internal token (e.g., 'playerName' -> stored as {{playerName}}) */
  token: string;
  /** Optional description for tooltip */
  description?: string;
  /** Icon identifier for the token */
  icon?: 'user' | 'event' | 'location' | 'calendar' | 'court' | 'team' | 'link';
}

export interface TokenGroup {
  /** Group name displayed in dropdown */
  group: string;
  /** Color theme for this group */
  color: 'lime' | 'cyan' | 'purple' | 'amber' | 'rose';
  /** Tokens in this group */
  items: TokenItem[];
}

// ============================================
// TOKEN DEFINITIONS
// ============================================

/** Player tokens - always guaranteed per-recipient */
const PLAYER_TOKENS: TokenItem[] = [
  { label: 'Player Name', token: 'playerName', description: 'Recipient\'s full name', icon: 'user' },
];

/** Event tokens - guaranteed from league/tournament data */
const EVENT_TOKENS: TokenItem[] = [
  { label: 'Event Name', token: 'eventName', description: 'Name of the league or tournament', icon: 'event' },
  { label: 'Venue', token: 'venueName', description: 'Event venue/location', icon: 'location' },
];

/** Match tokens - ONLY when hasMatchContext is true */
const MATCH_TOKENS: TokenItem[] = [
  { label: 'Court', token: 'courtNumber', description: 'Assigned court number/name', icon: 'court' },
  { label: 'Match Time', token: 'matchTime', description: 'Scheduled match time', icon: 'calendar' },
  { label: 'Team A', token: 'teamA', description: 'First team name', icon: 'team' },
  { label: 'Team B', token: 'teamB', description: 'Second team name', icon: 'team' },
];

/**
 * Backward-compatible aliases (not shown in dropdown)
 * Maps legacy tokens to their display labels for storageToDisplay
 */
const LEGACY_TOKEN_ALIASES: Record<string, string> = {
  leagueName: 'Event Name',
  tournamentName: 'Event Name',
  firstName: 'Player Name',
  divisionName: 'Division',
  poolGroup: 'Pool',
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Get available token groups for a given context and scope
 *
 * @param context - 'league' or 'tournament'
 * @param options - { hasMatchContext: true } ONLY when composing from a match
 * @returns Array of token groups with their items
 */
export function getTokenGroups(
  _context: TokenContext,
  options?: TokenOptions
): TokenGroup[] {
  const groups: TokenGroup[] = [
    {
      group: 'Player',
      color: 'lime',
      items: PLAYER_TOKENS,
    },
    {
      group: 'Event',
      color: 'cyan',
      items: EVENT_TOKENS,
    },
  ];

  // Match tokens ONLY when explicitly composing from a match
  if (options?.hasMatchContext) {
    groups.push({
      group: 'Match',
      color: 'amber',
      items: MATCH_TOKENS,
    });
  }

  return groups;
}

/**
 * Get flat list of all available tokens for a context
 */
export function getAvailableTokens(
  context: TokenContext,
  options?: TokenOptions
): TokenItem[] {
  return getTokenGroups(context, options).flatMap(g => g.items);
}

/**
 * Find a token by its internal name
 */
export function findToken(
  tokenName: string,
  context: TokenContext,
  options?: TokenOptions
): TokenItem | undefined {
  const tokens = getAvailableTokens(context, options);
  return tokens.find(t => t.token === tokenName);
}

/**
 * Get the display label for a token (includes legacy aliases)
 */
export function getTokenLabel(
  tokenName: string,
  context: TokenContext,
  options?: TokenOptions
): string {
  if (LEGACY_TOKEN_ALIASES[tokenName]) {
    return LEGACY_TOKEN_ALIASES[tokenName];
  }
  const token = findToken(tokenName, context, options);
  return token?.label || tokenName;
}

/**
 * Convert display format to storage format
 * [Player Name] -> {{playerName}}
 */
export function displayToStorage(
  text: string,
  context: TokenContext,
  options?: TokenOptions
): string {
  const tokens = getAvailableTokens(context, options);
  let result = text;

  for (const token of tokens) {
    const displayPattern = new RegExp(`\\[${escapeRegex(token.label)}\\]`, 'g');
    result = result.replace(displayPattern, `{{${token.token}}}`);
  }

  return result;
}

/**
 * Convert storage format to display format
 * {{playerName}} -> [Player Name]
 * Also handles legacy aliases: {{leagueName}} -> [Event Name]
 */
export function storageToDisplay(
  text: string,
  context: TokenContext,
  options?: TokenOptions
): string {
  const tokens = getAvailableTokens(context, options);
  let result = text;

  // Handle current tokens
  for (const token of tokens) {
    const storagePattern = new RegExp(`\\{\\{${escapeRegex(token.token)}\\}\\}`, 'g');
    result = result.replace(storagePattern, `[${token.label}]`);
  }

  // Handle legacy aliases
  for (const [legacyToken, displayLabel] of Object.entries(LEGACY_TOKEN_ALIASES)) {
    const storagePattern = new RegExp(`\\{\\{${escapeRegex(legacyToken)}\\}\\}`, 'g');
    result = result.replace(storagePattern, `[${displayLabel}]`);
  }

  return result;
}

/**
 * Extract token names from storage format text
 */
export function extractTokens(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

/**
 * Get color classes for a token group
 */
export function getTokenColorClasses(color: TokenGroup['color']): {
  bg: string;
  text: string;
  border: string;
  hover: string;
} {
  const colors = {
    lime: {
      bg: 'bg-lime-500/20',
      text: 'text-lime-400',
      border: 'border-lime-500/30',
      hover: 'hover:bg-lime-500/30',
    },
    cyan: {
      bg: 'bg-cyan-500/20',
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      hover: 'hover:bg-cyan-500/30',
    },
    purple: {
      bg: 'bg-purple-500/20',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      hover: 'hover:bg-purple-500/30',
    },
    amber: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      hover: 'hover:bg-amber-500/30',
    },
    rose: {
      bg: 'bg-rose-500/20',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      hover: 'hover:bg-rose-500/30',
    },
  };
  return colors[color];
}

/**
 * Find which group a token belongs to
 */
export function getTokenGroup(
  tokenName: string,
  context: TokenContext,
  options?: TokenOptions
): TokenGroup | undefined {
  const groups = getTokenGroups(context, options);
  return groups.find(g => g.items.some(t => t.token === tokenName));
}

// Helper
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
