# Stats BOT

A Discord bot and website with CS2 stats leaderboards for your server, powered by [Leetify](https://leetify.com). Each player links their Steam account once; the bot fetches their Premier, Competitive and FACEIT matches from Leetify, shows a table per server and posts the top 10 and the MVP of the month on the 1st.

It runs 24/7 in a Proxmox LXC (or Docker) and is published to the internet through a Cloudflare Tunnel, like [Discord-BOT](https://github.com/F-Branquinho/Discord-BOT).

## How it works

- Players open the website, log in with Discord and **sign in through Steam**. They need a Leetify account with a **public profile** (Leetify → Settings → Privacy). Leetify answers the same way for private and missing profiles, so the site shows "not found or private" for both.
- Every 30 minutes from **16:00 to 04:00** (Lisbon) the bot asks Leetify for each linked player's latest matches and stores the new ones in SQLite (`data/stats.db`). Leetify only returns the last 100 matches, so the history is kept by the bot.
- Only **Premier, Competitive and FACEIT** matches count. Wingman, pro demos, matches with a banned player and matches under 10 rounds are stored but left out of the stats.
- A server's table shows the linked players who are members of that server.

### Points and MVP

Each counted match gives **result points + rating bonus**:

| Result | Win | Draw | Loss |
|---|---|---|---|
| Points | 3 | 1 | 0 |

| HLTV Rating 1.0 | < 0.80 | 0.80–0.95 | 0.95–1.05 | 1.05–1.20 | 1.20–1.40 | ≥ 1.40 |
|---|---|---|---|---|---|---|
| Bonus | 0 | 1 | 2 | 3 | 4 | 5 |

The HLTV Rating 1.0 is computed from Leetify's kills, deaths, rounds and multi-kills (Leetify doesn't give KAST, which 2.0/3.0 need).

The **MVP of the month** is the player with the most points among those with **at least 5 matches** that month. Ties go to more wins, then the higher average HLTV rating, then more matches.

### Monthly report

On the 1st at 12:00 (Lisbon), after a last collection, the bot posts in each server's report channel (in Portuguese or English):

- 🏆 the **top 10 of the month** by points, with W/D/L and average HLTV rating, mentioning each player;
- the awards: 🔫 most kills, 🎯 best aim (accuracy with an enemy on screen), 🧠 best HS%, 💡 flash king (enemies flashed), 🤦 team flash king (teammates flashed), 🎮 most matches.

Only players with 5+ matches compete, except for 🎮. The report is sent once per server and month; if the bot was down at 12:00, it sends it when it's back.

## Commands

| Command | What it does |
|---|---|
| `/link` | Link to connect your Steam account (only you see it) |
| `/add steam64:<id> [user]` | Adds a Steam account to the table by its Steam64 ID (or `steamcommunity.com/profiles/…` link) and fetches its matches right away. With `user:`, links someone else's account (requires **Manage Server**); an admin can also move a Steam account that was linked to the wrong person. The reply shows the Leetify name and says whether the profile is private or has no Leetify account. Unlike `/link`, Steam doesn't confirm the account is yours |
| `/stats [user]` | This month's summary: points, W/D/L, HLTV rating, kills, K/D, HS%, aim, enemies and teammates flashed (with Flash % and TF %), HE damage |
| `/top [category] [period]` | Top 10 by points, kills, aim, HS%, enemies flashed, team flashes or matches; this month, last month or all time |
| `/mvp` | This month's MVP race |
| `/stats-help` | What the bot does and the commands (only you see it) |

Replies use the server's language. Commands never ping anyone.

## Website

- **Landing page** (`/`): a **See the table** button (or one card per server when the bot is in several), plus **Link your Steam account** and **Add to Discord**.
- **Privacy policy** (`/privacy`) and **terms** (`/terms`): paste these in Developer Portal → General Information.
- **Setup page** (`/setup`): the first time, paste the bot token, the OAuth2 client secret, the website's public address and, optionally, a [Leetify API key](https://leetify.com/app/developer) (raises the rate limits). It asks for the **setup code** shown by the installer and in the logs.
- **Steam account** (`/link`): log in with Discord, then sign in through Steam. Shows whether Leetify found the profile. Players can unlink.
- **Servers** (`/dashboard`): servers with the bot, plus the ones you can add it to.
- **Table** (`/s/<server>`): one row per player (points, HLTV, kills, K/D, HS%, aim, flashes, enemies and teammates flashed, Flash % and TF % per flash thrown, HE damage to enemies, per HE and to teammates, Leetify rating), sortable by any column, for this month, last month or all time. Players under 5 matches are greyed out as not eligible for MVP. Emojis next to a name show who is leading each award this month (🏆 🔫 🎯 🧠 💡 🤦 🎮), or who won it last month; hover for the value. **Public**: anyone with the link sees it, without logging in. Each server has its own table with only its members.
- **Player profile** (`/s/<server>/p/<user>`, public): totals, one row per month and the last 20 matches.
- **Server settings** (`/server/<server>`, Manage Server or bot owner): report channel, language, report on/off.
- **Bot settings** (owner of the Discord application): token, client secret, public address, Leetify key and daily request budget.
- `/health` starts with `ok` while the bot is connected, followed by the last collection time and today's Leetify requests.

## Before you install

**Discord** ([Developer Portal](https://discord.com/developers/applications)): create a new application (for example in your team). No privileged intents are needed. You'll paste the bot token and the OAuth2 client secret on the setup page.

**Leetify** (optional): a free API key from [leetify.com/app/developer](https://leetify.com/app/developer). Without it the public rate limits apply; the bot also stops for the day after `LEETIFY_DAILY_BUDGET` requests (3000 by default) and waits when Leetify answers 429.

**Cloudflare** (optional, to reach the site on your domain) — [Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**:

1. **Create a tunnel** → **Cloudflared** → give it a name (e.g. `stats-bot`).
2. Copy the **token** from the install command (the long part after `cloudflared service install`).
3. **Public hostname**: subdomain `stats`, your domain, service **HTTP** → `localhost:3000`.

Use a single-level subdomain (`stats.example.com`): Cloudflare's free certificate doesn't cover `a.b.example.com`.

If the tunnel runs somewhere else (for example, in its own LXC), skip the tunnel token in the installer and point the public hostname at `http://<bot-ip>:3000`.

## One-command install on Proxmox (recommended)

On the **Proxmox host shell** (web UI → node → Shell):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Stats-BOT/main/deploy/proxmox-lxc.sh)"
```

The script only asks for the (optional) Cloudflare tunnel token. It creates a Debian 12 LXC (1 core, 512 MB, 4 GB, DHCP, starts with Proxmox), installs the bot and the tunnel, and ends with the setup page address and code:

```
👉 Finish the setup in your browser:
   http://<container-ip>:3000/setup
   Setup code: ABCD-EFGH
```

After the setup page, add the redirect it shows (`https://stats.yourdomain.com/callback`) in Developer Portal → **OAuth2** → **Redirects**, invite the bot to your server, and pick the report channel in the server settings.

To change the resources: `CTID=151 MEMORY=1024 STORAGE=local-zfs bash -c "$(curl ...)"`. For a static address instead of DHCP: `IP=192.0.2.51/24 GATEWAY=192.0.2.1 bash -c "$(curl ...)"`.

```bash
pct exec <CTID> -- journalctl -u stats-bot -f              # logs (the setup code is here too)
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Stats-BOT/main/deploy/install.sh | bash'   # update to the latest release
```

## Versions

Each version is a GitHub tag (see the [CHANGELOG](CHANGELOG.md)). The bot never updates itself: it only changes version when you run the installer.

```bash
# list the available versions and the installed one
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Stats-BOT/main/deploy/install.sh | bash -s -- --list'

# install a specific version (also works for going back)
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Stats-BOT/main/deploy/install.sh | bash -s -- v0.1.0'
```

`main` installs the latest code, not released yet.

To publish a new version: update `version` in `package.json` and `CHANGELOG.md`, commit, then `git tag vX.Y.Z && git push --tags`.

## Manual install in an LXC

1. In Proxmox: **local → CT Templates → Templates**, download `debian-12-standard`.
2. **Create CT**: unprivileged, 1 core, 512 MB RAM, 4 GB disk, DHCP network. Under **Options**, turn on **Start at boot**.
3. In the LXC console, as root:
   ```bash
   apt update && apt install -y curl
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Stats-BOT/main/deploy/install.sh)"
   bash /opt/stats-bot/deploy/cloudflared.sh     # optional: Cloudflare Tunnel
   ```
4. Open the setup page shown at the end of the install.

The bot runs as a systemd service (`stats-bot`) under its own user, and restarts by itself if it crashes.

```bash
systemctl status stats-bot                       # status
journalctl -u stats-bot -f                       # logs
bash /opt/stats-bot/deploy/install.sh v0.1.0     # switch version (no argument: the latest)
```

## Docker install

On a VM or LXC with Docker and Docker Compose:

```bash
git clone https://github.com/F-Branquinho/Stats-BOT.git stats-bot
cd stats-bot
cp .env.example .env
docker compose up -d --build
docker compose logs | grep -A1 "Setup needed"   # setup page address and code
```

The site is on port 3000 of the host; point the tunnel's public hostname at `http://<host-ip>:3000`.

> In an unprivileged Proxmox LXC, turn on `nesting=1` (and `keyctl=1`) in the container options for Docker to work.

## Configuration (`.env`, optional)

The setup page saves its values in `data/settings.json` (readable only by the bot). Anything set in `.env` wins over the site and can then only be changed in `.env`.

| Variable | Default | Description |
|---|---|---|
| `BOT_TOKEN` | | Bot token |
| `DISCORD_CLIENT_SECRET` | | Developer Portal → OAuth2 → Client Secret |
| `PUBLIC_URL` | | Public address of the site, e.g. `https://stats.yourdomain.com` |
| `LEETIFY_API_KEY` | | Optional Leetify API key |
| `LEETIFY_DAILY_BUDGET` | `3000` | Maximum Leetify requests per day |
| `DATA_DIR` | `./data` | Where the database and settings live |
| `WEB_PORT` | `3000` | Site port |
| `WEB_HOST` | `0.0.0.0` | Interface the site listens on |

## Development

```bash
npm install
npm test           # unit tests (node --test)
npm start          # then open http://localhost:3000/setup
```
