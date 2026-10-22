# Stats BOT — Design

Date: 2026-10-22
Status: awaiting review

## Goal

A Discord bot plus website (`stats.fzz-tools.com`) that shows CS2 leaderboards for the members of a Discord server, using match data from the Leetify public API, and posts a monthly report on the 1st with the top 10 and category awards.

Success looks like: friends link their Steam account once, the server table fills itself in during the evening, and on the 1st of each month the channel gets a report that ranks who played best and most.

## Decisions already made

| Topic | Decision |
|---|---|
| Data source | Leetify public API (`https://api-public.cs-prod.leetify.com`), FACEIT + Premier/Competitive matches |
| Account link | Log in with Discord on the site, then Steam OpenID. Leetify profile must be public |
| Architecture | One Node.js process (bot + web + scheduler + SQLite), same layout and deploy as Discord-BOT |
| Deploy | Proxmox LXC installer, setup page, tag-based versions, Cloudflare Tunnel, Docker as an alternative |
| Repo | `F-Branquinho/Stats-BOT`, public. Separate Discord application in team Fzz Dev |
| Languages | Commands, panel, code and README in English. Report language per server: Portuguese or English |

## Scoring (MVP)

Each counted match gives the player:

- **Result points:** win 3, draw 1, loss 0. Result comes from `rounds_won` vs `rounds_lost`.
- **Rating bonus** from the match's **HLTV Rating 1.0**:

| HLTV 1.0 | < 0.80 | 0.80–0.95 | 0.95–1.05 | 1.05–1.20 | 1.20–1.40 | ≥ 1.40 |
|---|---|---|---|---|---|---|
| Bonus | 0 | 1 | 2 | 3 | 4 | 5 |

Lower bound inclusive, upper bound exclusive (0.95 → 2, 1.05 → 3).

**HLTV Rating 1.0** (computed from Leetify fields; 2.0/3.0 need KAST and per-round data the API does not provide):

```
R = rounds_count
killRating     = (total_kills / R) / 0.679
survivalRating = ((R - total_deaths) / R) / 0.317
rmk            = ((multi1k + 4*multi2k + 9*multi3k + 16*multi4k + 25*multi5k) / R) / 1.277
hltv1          = (killRating + 0.7 * survivalRating + rmk) / 2.7
```

Stored rounded to 2 decimals; the bonus uses the rounded value.

**Monthly ranking:** sum of match points in the calendar month (Europe/Lisbon). Eligible players have **at least 5 counted matches** in that month. Tie-break: more wins, then higher average HLTV rating, then more matches. The 1st place is the **MVP**.

## Counted matches

A stored match counts for stats only if:

- `has_banned_player` is false;
- its `data_source` is one of the FACEIT / Premier / Competitive sources (allowlist in `rating.js`). Wingman, pro demos (`hltv`) and anything else are excluded. The exact `data_source` strings are confirmed against a real group member's matches at the start of implementation;
- `rounds_count >= 10` (drops warmups and abandoned games).

Non-counted matches are stored (flag `counted = 0`) but excluded from every aggregate.

## Architecture

One process, same structure as Discord-BOT:

```
src/
  index.js          start bot, web server and scheduler
  config.js         .env plus settings saved by the setup page
  db.js             SQLite (better-sqlite3), schema and migrations
  leetify.js        API client: profile, matches, optional API key, 429 handling, daily request budget
  rating.js         HLTV 1.0, match result, bonus tiers, match points (pure functions)
  collector.js      scheduled collection: new matches per linked player
  leaderboard.js    aggregates per guild and period (this month, last month, all time)
  report.js         monthly report: top 10 and awards (pure selection + Discord message builder)
  scheduler.js      collection slots, monthly report, catch-up after downtime
  i18n.js           PT/EN strings for the report and bot replies
  bot.js            Discord client, guild member cache
  commands.js       slash commands
  web/
    server.js       Express app, sessions, /health
    auth.js         Discord OAuth2 and Steam OpenID
    views.js        HTML templates (server-rendered, no build step)
    pages.js        landing, privacy, terms, setup, link, leaderboard, profile, dashboard
deploy/             proxmox-lxc.sh, install.sh, stats-bot.service, cloudflared.sh (adapted from Discord-BOT)
test/               node --test
```

### Data model (SQLite, `data/stats.db`)

- `players(discord_id PK, steam64_id UNIQUE, name, avatar, linked_at, leetify_status, last_fetched_at)` — `leetify_status`: `ok`, `private`, `not_found`.
- `matches(id PK, finished_at, map_name, data_source, has_banned_player)` — one row per Leetify match id.
- `player_matches(match_id, steam64_id, PK(match_id, steam64_id), kills, deaths, assists, hs_kills, rounds, rounds_won, rounds_lost, multi1k..multi5k, dpr, leetify_rating, accuracy_head, shots_fired_enemy_spotted, shots_hit_enemy_spotted, preaim, reaction_time, flash_thrown, flash_hit_foe, flash_hit_friend, flash_leading_to_kill, he_thrown, smoke_thrown, molotov_thrown, result, hltv_rating, points, counted)`.
- `player_profile(steam64_id PK, aim, utility, positioning, premier, faceit_elo, updated_at)` — latest Leetify profile ratings, for the "aim" column.
- `guilds(guild_id PK, report_channel_id, language, report_enabled)`.
- `reports(guild_id, month, sent_at, PK(guild_id, month))` — prevents repeats.
- Bot token, client secret, public URL, Leetify key and daily budget live in `data/settings.json` (or `.env`), using Discord-BOT's `settings.js`, not in SQLite.
- `api_usage(day PK, requests)`.

A player appears in a guild's table if they are linked and are a member of that guild (checked with the bot's member cache).

## Collection

- **Schedule:** every 30 minutes from 16:00 to 04:00 Europe/Lisbon (16:00, 16:30, …, 04:00 — 25 runs per day).
- Each run walks the linked players with status `ok` (and retries `private` ones once per day), 2 s between requests, calls `/v3/profile/matches`, and inserts matches whose id is not stored yet. Once per day it also refreshes `/v3/profile` for the aim/utility ratings.
- **Outside the window**, requests happen only when someone links their account (immediate fetch of profile + last 100 matches) and in the final collection right before the monthly report.
- **Optional Leetify API key** on the setup page (`_leetify_key` header). Without it the bot uses the public limits.
- **Daily budget:** configurable, default 3000 requests/day. When reached, scheduled runs are skipped until midnight; `/health` and the dashboard show it.
- **429:** stop the current run, wait `Retry-After` (or 10 minutes), resume.
- **Other errors** (5xx, timeouts): log, skip that player, continue; the next slot retries.
- Private/missing profile: mark the player; the site and `/stats` explain how to make the Leetify profile public.

## Website (`stats.fzz-tools.com`)

- `/` landing page (what it does, commands, **Add to Discord**), `/privacy`, `/terms`.
- `/setup` first-run page, like Discord-BOT: bot token, OAuth2 client secret, public URL, optional Leetify key, setup code shown by the installer and logs. Everything is validated before saving.
- `/link` — Discord login, then **Link Steam** (Steam OpenID). After linking, the site checks Leetify and shows the result. Users can unlink.
- `/s/:guildId` — server table, visible to logged-in members of that guild.
  - Columns: player, matches, W/D/L, points, avg HLTV rating, kills, K/D, HS%, aim (Leetify), flashes thrown, enemies flashed, team flashes, avg Leetify rating.
  - Sort by any column (default: points). Period: **this month** (default), **last month**, **all time**.
  - Players under 5 matches in a monthly period are greyed out with "not eligible for MVP".
- `/s/:guildId/p/:discordId` — player profile: totals, one row per month (points, rating, matches), last 20 matches (map, result, score, HLTV rating, points).
- `/dashboard` — servers where the user has **Manage Server** (bot owner sees all): report channel, language, report on/off, missing-permission warnings.
- `/health` — `ok` while connected, plus last successful collection time and budget state.

## Discord commands

| Command | What it does |
|---|---|
| `/link` | Sends the link to connect Steam (ephemeral) |
| `/stats [user]` | This month's summary: points, W/D/L, HLTV rating, kills, K/D, aim, flashes, team flashes |
| `/top [category] [period]` | Top 10 by points, kills, aim, hs, flashes, teamflash or matches; period this month / last month / all time |
| `/mvp` | Current month's provisional top 10 by points |
| `/stats-help` | What the bot does and the commands (ephemeral) |

## Monthly report

- On the 1st at 12:00 Europe/Lisbon, for each guild with the report enabled. A final collection runs first.
- Content (in the guild's language), mentioning each listed player:
  - **Top 10 of the month by points** — 1st place highlighted as 🏆 MVP. Each line: points, W/D/L, average HLTV rating.
  - **Awards:** 🔫 most kills, 🎯 best aim (see below), 🧠 best HS%, 💡 flash king (most enemies flashed), 🤦 team flash king (most teammates flashed), 🎮 most matches.
  - Only eligible players (≥ 5 matches) compete, except 🎮 most matches.
- Sent once per guild and month (`reports` table). If the bot was down at 12:00, it sends on startup that day or any later day in the same month.
- If nobody is eligible, it posts a short "not enough matches this month" message.

**Aim award metric:** Leetify's `rating.aim` exists only on the profile (current value, not per month). The monthly 🎯 award therefore uses the month's **`accuracy_enemy_spotted`** (sum of `shots_hit_enemy_spotted` / sum of `shots_fired_enemy_spotted` over counted matches). HS% is likewise sum of `total_hs_kills` / sum of `total_kills`. The table's "aim" column shows the current Leetify profile aim.

## Testing

`node --test`, no external services:

- `rating.js`: HLTV 1.0 against hand-computed values; every tier boundary (0.80, 0.95, 1.05, 1.20, 1.40); win/draw/loss; match points.
- `leaderboard.js` / `report.js`: in-memory SQLite with fixture matches — period filters (Lisbon month boundaries), eligibility (≥ 5), top 10 order and tie-breaks, each award, nobody-eligible case.
- `collector.js`: fake Leetify client — no duplicates across runs, 429 stops the run, budget stops runs, private profile marking.
- `scheduler.js`: slot list for the 16:00–04:00 window and report catch-up logic, with an injected clock.

## Out of scope (for now)

- Head-to-head between friends, match-level pages, charts beyond the per-month rows.
- Stats from sources other than Leetify.
- Per-guild custom scoring.
