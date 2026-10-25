# Changelog

Each version is a GitHub tag. To install a specific version, see [Versions](README.md#versions) in the README.

## v0.3.0

- `/add steam64:<id> [user]`: adds a Steam account to the table by its Steam64 ID or profile link, without signing in through Steam, and fetches its matches right away. Linking someone else's account requires Manage Server; a Steam account already linked to someone else is refused.

## v0.2.0

- Server tables and player profiles are public: no login needed to see them.
- The landing page has a **See the table** button, or one card per server when the bot is in several.
- The privacy policy says the tables are public.

## v0.1.0

- First version.
- Players link their Steam account on the website (Discord login, then Steam sign-in).
- Matches from Leetify (Premier, Competitive and FACEIT) are fetched every 30 minutes from 16:00 to 04:00 (Lisbon) and kept in SQLite, with a daily request budget and an optional Leetify API key.
- Points per match: win 3, draw 1, loss 0, plus 0–5 for the HLTV Rating 1.0.
- Server table sortable by any column, for this month, last month or all time; player profile with months and last matches.
- Monthly report on the 1st at 12:00: top 10 with the MVP (at least 5 matches) and awards, in Portuguese or English.
- Commands `/link`, `/stats`, `/top`, `/mvp` and `/stats-help`.
- Setup page, bot settings, Proxmox LXC installer, Docker and Cloudflare Tunnel, as in Discord-BOT.
