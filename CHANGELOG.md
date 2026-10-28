# Changelog

Each version is a GitHub tag. To install a specific version, see [Versions](README.md#versions) in the README.

## v0.11.1

- `/refresh` (Manage Server): fetches everyone's new matches from Leetify and FACEIT right away, at any time of day, and says how many were new.
- **Collect now** button in Bot settings, which does the same from the website.
- Saving a FACEIT key (setup page or Bot settings) starts a collection right away, instead of waiting for the 16:00–04:00 window.
- `/health` says whether FACEIT is on.

## v0.11.0

- **FACEIT as a second source.** With a FACEIT API key (setup page, Bot settings or `FACEIT_API_KEY`), the bot also fetches each linked player's last 20 FACEIT CS2 matches, for the ones Leetify doesn't have (Leetify only gets FACEIT matches when the player linked FACEIT on Leetify).
  - The same match from Leetify and from FACEIT is stored once; Leetify's version wins, since it has more stats.
  - FACEIT-only matches have kills, deaths, assists, headshots, damage (ADR), multi-kills, MVPs and flashes, and count for points and the MVP. The HLTV 1.0 rating is computed from them.
  - The FACEIT level and ELO now come from FACEIT.
  - The key is checked with FACEIT before it is saved.
- The database is upgraded automatically (v5).

## v0.10.0

- **Match type filter** on the server page: All, Premier, Competitive or FACEIT, for every table and section.
- **Form** (last 5 results as 🟩⬜🟥, with the current streak on hover) and **best win streak** in the main table.
- **🏅 Ranks** table: Premier rating, FACEIT level and ELO, and how much they moved in the period (from a daily snapshot the bot now keeps).
- **⚖️ Sides and more** table: Leetify rating on CT and T, assists, % of rounds survived and bullets that hit teammates.
- **📈 Records**: best match (HLTV), most kills and most damage in a single match in the period.
- **🤝 Duos**: pairs of linked players who played together on the same team, with W/D/L, win % and average HLTV (2+ matches together).
- **🗺️ Maps**: matches, win % and HLTV per map, with the best player on each (3+ matches); the player profile also lists their maps, with the best and worst one.
- The database is upgraded automatically (v4). Duos and sides need the team and side data, which matches get the next time Leetify sends them (its last 100).

## v0.9.0

- The table no longer asks Discord who is a member of the server, which made it take ~5 s to load every 10 minutes. It now shows every linked player and loads right away; the same goes for `/top`, `/mvp` and the monthly report.
- `/remove`: takes a player off the table. Anyone can remove themselves; removing someone else (by user or Steam64 ID) requires Manage Server.
- Security:
  - A malformed cookie (e.g. set by another site on the same domain) no longer breaks the whole site with an error 500.
  - HSTS header when the site is on HTTPS.
  - Steam sign-in also checks that `identity` matches `claimed_id` and that the fields it relies on are signed.

## v0.8.0

- `/table`: a button that opens this server's table on the website.
- `/top` and `/mvp` no longer show the same thing:
  - `/top` now requires a category and no longer has points (that's `/mvp`). New categories: ADR, Flash %, HE damage, ACEs, 3Ks and trade %.
  - `/mvp` shows the top 10 with the gap to 1st, W/D/L and HLTV, who is still short of 5 matches (and how many to go), and who leads each award.

## v0.7.0

- The server page has four tables, each sortable on its own:
  - **Main**: matches, W–D–L, points, HLTV, **ADR** (new), kills, K/D, HS%, aim, Leetify.
  - **💣 Utility**: flashes, enemies flashed, Flash %, blind time, flash → kill, flash assists, team flashes, TF %, HEs, HE damage, HE/nade, HE team, molotovs, smokes, nades per round, unused utility.
  - **🔥 Multi-kills and trades**: 2K, 3K, 4K, ACE, MVP stars, trade kills and %, traded deaths and %, Leetify clutch and opening ratings.
  - **🎯 Aim**: accuracy, accuracy with an enemy spotted, HS%, spray, counter-strafing, preaim and reaction time.
- Leetify doesn't give 1vX clutches or molotov damage, so those aren't shown.
- The database is upgraded automatically; matches stored before get the new columns the next time Leetify sends them (its last 100). Until then they show "—".

## v0.6.1

- The Leetify rating column showed rounded values (+1.00, +5.00); it now shows the real average, e.g. +1.17.

## v0.6.0

- HE grenade damage: new **HE dmg** (total to enemies), **HE/nade** (average per HE) and **HE team** (to teammates) columns, also on the player profile and in `/stats`. Leetify doesn't give molotov damage.
- The database is upgraded automatically; matches stored before get their HE damage the next time Leetify sends them (its last 100).

## v0.5.0

- New **Flash %** and **TF %** columns: enemies and teammates blinded per flash thrown (can go over 100%, since one flash can blind several people). Also on the player profile and in `/stats`. The 💡 and 🤦 awards still use totals.

## v0.4.0

- The table shows an emoji next to whoever is leading each award this month (🏆 MVP, 🔫 kills, 🎯 aim, 🧠 HS%, 💡 enemies flashed, 🤦 team flashes, 🎮 matches), with the same rules as the monthly report. Last month shows the winners; all time shows none.
- `/add`: members with Manage Server can move a Steam account that was linked to the wrong person.
- `/add` replies with the Leetify name of the account and tells a private Leetify profile apart from a Steam account with no Leetify account.

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
