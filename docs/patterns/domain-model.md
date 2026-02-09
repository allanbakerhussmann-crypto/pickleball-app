# Domain Model

## User System

- **UserProfile**: Player data, DUPR rating, location, skill level
- **UserRole**: `'player'` | `'organizer'` | `'app_admin'`
- DUPR integration for verified ratings

## Competition Formats (10 total)

| Format | Description |
|--------|-------------|
| `pool_play_medals` | Pool stage → single elimination bracket with medals |
| `round_robin` | Everyone plays everyone |
| `singles_elimination` | Single-elimination bracket |
| `doubles_elimination` | Double-elimination bracket |
| `swiss` | Swiss system pairing by record |
| `ladder` | Ranking ladder with challenges |
| `king_of_court` | Winners stay, challengers rotate |
| `rotating_doubles_box` | Small groups, rotating partners |
| `fixed_doubles_box` | Small groups, fixed teams |
| `team_league_interclub` | Club vs club team matches |

## Tournament Structure

- **Tournament**: Main event container
- **Division**: Skill/gender/age groupings
- **Team**: Players grouped for competition
- **Match**: Individual games with scores and scheduling
- **StandingsEntry**: Rankings within a division

## League Formats (4 primary)

| Format | Description |
|--------|-------------|
| Ladder | Challenge-based ranking with rank ranges |
| Round Robin | Everyone plays everyone, optional pools |
| Swiss | Paired by similar records each round |
| Box League | Multiple boxes with promotion/relegation |

## League Entities

- **League**: Container with format, settings, schedule
- **LeagueMember**: Player with stats, ranking, partner info
- **LeagueMatch**: Match with verification status
- **LeagueChallenge**: Ladder challenges between players

## Club System

- **Club**: Organization with courts, members, settings
- **ClubMember**: Member with role (owner, admin, member)
- **ClubCourt**: Court definition with surface, hourly rate
- **CourtBooking**: Reservation for specific court/time

## Meetups

- **Meetup**: Casual or competitive social event
- **MeetupRSVP**: Player attendance with payment status
- **MeetupCompetitionType**: casual, round_robin, elimination, etc.

## Scoring System

- **GameScore**: Individual game result (scoreA, scoreB)
- **GameSettings**: Points per game (11/15/21), win by (1/2), best of (1/3/5)
- **ScoreVerificationSettings**: Confirmation/dispute workflow
- **MatchVerificationData**: Dispute tracking and resolution

---

## Match Format

> **CRITICAL**: See [Unified Match Format](../../CLAUDE.md#unified-match-format-critical) in CLAUDE.md for the canonical Match interface that MUST be used for all matches.

The `Match` interface in `types/game/match.ts` is THE standard for ALL matches across tournaments, leagues, and meetups. Key points:

- Always use `sideA`/`sideB` (not legacy `teamAId`/`teamBId`)
- Always use `scores[]` array (not legacy `scoreTeamAGames`)
- Always use `winnerId` (not legacy `winnerTeamId`)
