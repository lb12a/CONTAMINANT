# Implementation status

State of the project against the two design documents in `Pdfs/` (*Complete Game Plan* and
*UI-Assets und Charakter-Tutorials*), with the decisions taken where the documents leave room and the
limits that remain.

## Implemented

### Rules engine (`packages/engine`)

- 15 × 9 pointy-top hex board (odd-r offset), line of sight, areas (ring, cone, line, burst).
- Simultaneous secret planning, resolution by Priority (+4 deploy … −2) then Effective Speed, per-character
  order kept, Wait / Hold / Rest, Backwards Clock reversal.
- AP economy: base `min(16, 10 + floor((R−1)/2))`, random bonus, Idle Bonus +3…+12, cap 30, KO rewards,
  vacancy tax, paid re-rolls, offer locks.
- Damage `Power × clamp(Atk/Def, 0.5, 2) × T × C × M × L`, hit, crit and status chances, characteristics
  (material, existence, movement, trait, mind), shields, gear.
- All 30 characters with attacks, abilities, forms (Werewolf, Zombie fusions, Pokerface moods) and summons;
  all 70 item cards (character, field, ability, attack, gear, trap, intel) with free-card requirements,
  Tarnish / Midas, attachments; fields with reactions (electrified water, gas detonation, spreading fire …);
  traps with reveal rules.
- Six modes: Contamination, Elimination, Domination, Research, Escape, Anomaly (boss).
- Fog-of-war views (`viewFor`): opponent hand, offers, RNG and hidden units are never exposed.
- Bots (easy, normal, hard, boss) on their own fog-of-war view.
- Progression: collection, levels, chests, gold, trophies, zone milestones, daily missions, decks.
- Testing Chambers: one five-act tutorial per character with checks, rewinds, skip and solution.
- Basic Training scenario (`training.ts`).
- Replays: `replayFrames` re-simulates a stored match (seed + ops + plans) and checks state hashes.

### Server (`packages/server`)

- REST + WebSocket protocol, authoritative rooms with deadlines, plan validation, anti-cheat audit trail.
- Ranked Elo with provisional K, divisions Bronze … Grandmaster / Contaminant Elite with sub-tiers,
  seasons with soft reset and rewards; casual queue with bot fill; friendly lobbies; Team Battles.
- Tournaments: daily / weekly schedules, registration, check-in, MMR seeding, single / double elimination,
  Swiss, automatic match provisioning, prizes, Trophy Hall.
- **Contamination Circuit** (`circuit.ts`): Monthly Majors on the first Saturday of every month from
  November to September (double elimination, minimum 1150 MMR, created two weeks ahead), Circuit Points by
  placement, direct World Cup seeds (every Major champion, then the top 8 of the points race, max 12).
- **World Cup on Halloween** (`worldcup.ts`): opens on 1 October with the direct seeds registered; anyone
  with 1250 MMR or Circuit Points can enter the Last Chance qualifier (Swiss, 29 October); groups on
  30 October, playoffs and final on 31 October; stages wait for their day. Crown, titles, hall of fame,
  reigning champion and champion history (`/api/champions`).
- Teams (`teams.ts`): create / join / leave, captaincy hand-over, team rating, team ladder, Team Battle record.
- Public profiles (`/api/players/:id`): rank, division, record, team, Circuit results, honours, recent matches.
- Telemetry, meta snapshot with Wilson intervals, deck archetypes, log-odds anomaly detection.
- Spectating with broadcast delay, caster feed, OBS overlay, replay verification.
- WebRTC signalling relay for P2P matches.
- Production bundle (`npm run build:server`) and a smoke test (`npm run smoke`).

### Client (`packages/client`)

- PixiJS 2.5D diorama board: tilted board on a painted, feathered ground plate, props on wall hexes and
  around the board, team-coloured glowing hexes with turning rune rings (blue = you, orange = enemy),
  hologram ghosts with order badges for planned positions, footprints for paths, arcing target lines,
  god rays and vignette. Your side is always on the left; on portrait phones the board turns 90° so your
  side is at the bottom.
- Code-driven animation: idle breathing, hops along paths, lunges, hit shakes and flashes, heal glow,
  drop-in on deploy, dissolve with particles on KO, floating damage numbers.
- Full-bleed match layout with floating HUD (AP, scoreboard with VP race and fuse, seal button), unit
  dossier, action order, combat log drawer, dock with offered characters and hand.
- Basic Training with a coach that waits for the player's own actions; Testing Chambers.
- Screens: menu, collection, deck builder, shop, missions, online (ranked, casual, friendly, party, P2P),
  tournaments, World Cup & Circuit, teams, ladder, profiles, replays, spectate, meta, history, settings.
- **P2P friendlies** (`game/p2p.ts`): WebRTC data channel, both peers contribute half of the seed, plans are
  committed as hashes and revealed afterwards, planning ops applied seat by seat, state hashes compared
  every round.
- Offline play with local rewards and history, PWA manifest and service worker, WebAudio sound effects,
  English / German strings for the main flow, `prefers-reduced-motion` respected.

### Desktop (`apps/desktop`)

- Electron 38 shell around the built client, sandboxed renderer with a two-function preload bridge.
- Built-in LAN server (the production server bundle as a Node child process), started from the menu or
  Settings; data in the user-data folder.
- electron-builder: Windows NSIS installer (built and launch-tested), macOS dmg/zip and Linux AppImage/deb
  targets configured.

### Art pipeline (`tools/assetgen`)

- Catalog of prompts for 43 creatures and forms, 18 zone props, 6 ground textures, 2 backdrops,
  3 objective props and icons for all 70 item cards plus the Midas Touch card, in one style (thick
  outlines, flat colours, creepy).
- ComfyUI HTTP client (SDXL DreamShaper XL Lightning, 6 steps), BiRefNet cut-outs inside ComfyUI, trim,
  WebP export, manifest, contact sheets, `picks.json` for candidate selection.

## Decisions where the documents leave room

- **Status durations.** A control or modifier status (Frozen, Silence, Slow, Blind, Fear …) applied in a
  round does not tick down at the end of that round, so "Duration N" means N full following rounds of
  effect. Over-time statuses (Poison, Burn, Bleeding, Infection, Leeched, Echo, Regeneration, Egg) already
  act in the round they are applied, so they tick that round. Both kinds therefore last equally long.
- **Evacuation Order and Spare Battery refunds.** AP is paid for the whole plan when resolution starts and
  unspent AP does not carry over, so a refund only matters if it can pay for something. The refund therefore
  raises the budget of commands planned *after* the card in the same plan and is paid back during
  resolution. If the refund never happens (the evacuated unit was KO'd first, the ability fizzled), the
  borrowed AP is deducted from the next round.
- **Mind's Eye tie order.** A "Speed tie" means equal Effective Speed after rounding. In a tie with the
  chosen friendly character the Ghost Train acts right after that character's chosen action
  (0 = before all of them, default after the first).
- **World Cup calendar.** Season = the Halloween year; Majors run November–September so October belongs to
  the World Cup. Thresholds and point tables live in `CIRCUIT` (`packages/server/src/circuit.ts`).
- **P2P scope.** Both peers hold the full state, so a P2P match is only as secret as the two machines.
  P2P is offered for friendlies; ranked, tournaments and the World Cup always run on the server.

## Known limits

- Generated art is produced locally and varies in quality; prompts are tuned per asset and candidates are
  picked by hand. Animations are code-driven transforms and particles, not frame-by-frame sprite sheets.
- Strict NATs can block direct P2P connections (only STUN is configured, no TURN relay); the panel says so
  and server-hosted friendlies remain available.
- Installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first launch.
  macOS and Linux packages must be built on those platforms.
- German translations cover the main flow; newer screens (circuit, teams, profiles, replays) are English.
- The repository has no git remote configured yet; pushing needs the target repository.

## Verification

- `npm test`: 73 engine tests, 18 server tests.
- `npm run typecheck`: engine, server, client.
- `npm run smoke`: bundled server boots and answers 16 checks.
- `tools/qa`: screenshots of every screen at 1600 × 900 and 390 × 844, Basic Training played by clicks,
  two-browser P2P match with equal hashes after three rounds, desktop app launch with embedded server.
