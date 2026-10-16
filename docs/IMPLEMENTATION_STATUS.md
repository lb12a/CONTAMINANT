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
- Progression: collection, levels, chests, gold, trophies, zone milestones, daily missions, decks. New subjects
  start with the four lab residents; character decks hold 4–10 characters, item decks 5–20 cards; the first
  chest always holds a new character; fair bot decks (`fairBotDeck`) only use the areas the player has reached.
- Planning follows relocations: after a leap, swap, portal or Trainticket the next command starts from the new tile.
- Testing Chambers: one five-act tutorial per character with checks, rewinds, skip and solution. The Warden can
  prepare an act (souls, broth, weakened enemies, a flooded tile) so every lesson works in one round; a solver
  (`tools/qa/chambers.ts`) proves every chamber can be completed and records walkthroughs the tests replay.
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
- Teams (`teams.ts`): create / join / leave, open or invite-only with a 6-letter invite code, captain and
  officers (promote, demote, kick, hand over the captaincy), banner colour and emblem creature, team rating,
  team ladder, Team Battle record.
- Social (`social.ts`): short friend codes without look-alike letters, friend requests (a mutual request
  becomes a friendship), presence (online / in a match, "friend is online" events), **players nearby** (same
  public address = same Wi-Fi, or any private address on a LAN server), challenges to friends and players
  nearby (an invitation lobby only the invited player can join, decline and auto-decline), public profile
  cards (avatar creature, colour, earned title, motto).
- Daily rewards: seven-day login calendar with streak, a free chest per day, play rewards at 1, 3, 5 and 10
  matches a day (paid automatically after each match).
- Developer accounts (name ending in `#`): everything unlocked, unlimited gold; kept off the ladder, out of
  tournaments, the World Cup, Team Battles, ranked and the meta. Bots never reach the ladder, the halls or the
  public meta either.
- One-click hosting: `/api/health` names the server and its player count; `--lan` announces the server on
  UDP 8788 (`lan.ts`); `--trust-proxy` reads client addresses behind a reverse proxy.
- Public profiles (`/api/players/:id`): rank, division, record, team, Circuit results, honours, recent matches,
  profile card and friend code.
- Telemetry, meta snapshot with Wilson intervals, deck archetypes, log-odds anomaly detection.
- Spectating with broadcast delay, caster feed, OBS overlay, replay verification.
- WebRTC signalling relay for P2P matches.
- Production bundle (`npm run build:server`) and a smoke test (`npm run smoke`).
- Deployment: `Dockerfile` (server + web client in one image), `docker-compose.yml` with an optional Caddy
  HTTPS profile, [DEPLOY.md](DEPLOY.md).

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
- Profiles: the subject file on first start (name, creature, language, `#` developer hint) leads into Basic
  Training; a profile cabinet switches, creates and deletes profiles per device.
- Unlock cutscene: a containment pod shakes and leaks light in the rarity colour, the seal bursts and the new
  character steps out with its name, rarity and area.
- Attacks play as wind-up, flight and impact with a look per damage type (fireball, bolt, toxic glob, acid
  spray, sonic waves, psychic orbs, soul wisp, radiant beam, arrow, rock, blade) and board shake on heavy hits;
  the whole round plays slower so it can be followed. The planning clock starts after the playback.
- Tournament trees: knockout brackets drawn as a tree with glowing winner paths up to the champion; the World
  Cup group stage shows a cross table of who beat whom.
- Loading screen: a walk down the lab corridor (flickering lamps, floor fog, spores, a creature crossing the
  lit door) with a bubbling test tube and rotating tips, shown for at least four seconds.
- Navigation in four sections (Play, Collection, Compete, Watch) with sub-tabs, a phone tab bar and a
  loading screen.
- Screens: home with daily rewards, collection, deck builder, shop, missions, online (**Play online** with
  automatic server discovery, ranked, casual, players nearby, online friends, private lobbies, party, P2P),
  friends, tournaments with live countdowns, World Cup (Halloween stage with live countdown, qualification
  steps, podium) & Circuit, teams with management, ladder, profiles with an editable profile card, replays,
  spectate, meta, history, settings.
- Challenges pop up wherever the player is (accept / decline, auto-decline after a minute); friend events and
  challenges become system notifications while the game is in the background.
- Resolution plays step by step: one beat per action with a caption ("Vile uses Reaper's Slash on Dummy ·
  133 damage · KO"), projectiles, slashes, beams and bursts, HP bars that drain with a trailing ghost bar.
- Planning aids: spawn-round previews of arriving creatures (with Nexus tile re-rolls), a creature-or-tile
  aim chooser when a target tile holds an enemy.
- Interface icons: a hand-built SVG set in the ink style (statuses, damage tags, tiers, modes, interface) —
  no emoji anywhere; status icons above units on the board.
- Twelve languages with dictionaries loaded on demand; the system language is picked on first start.
- **P2P friendlies** (`game/p2p.ts`): WebRTC data channel, both peers contribute half of the seed, plans are
  committed as hashes and revealed afterwards, planning ops applied seat by seat, state hashes compared
  every round.
- Offline play with local rewards and history, PWA manifest and service worker, WebAudio sound effects,
  `prefers-reduced-motion` respected.
- Phone layout: tab bar, a dock that switches between creatures and cards, panels as drawers.

### Desktop (`apps/desktop`)

- Electron 38 shell around the built client, sandboxed renderer with a two-function preload bridge.
- Built-in LAN server (the production server bundle as a Node child process): started by **Play online**
  when no server is found, from the menu or from Settings; announced on the network; the app lists servers
  it hears (`lan()` bridge). Data in the user-data folder.
- electron-builder: Windows NSIS installer (built and launch-tested), macOS dmg/zip and Linux AppImage/deb
  targets configured.

### Android (`apps/android`)

- Capacitor 8 shell around the built client (`npm run android:build` → debug APK), local notifications for
  challenges, friend requests and a daily evening reminder, plain-http LAN servers allowed, launcher icons
  and splash screens composed from the generated art. See [ANDROID.md](ANDROID.md).

### Art pipeline (`tools/assetgen`)

- All 146 assets are generated and shipped (5.5 MB of WebP): 43 creatures and forms, 18 zone props,
  6 ground textures, 2 backdrops, 3 objective props, 3 shop chests and icons for all 70 item cards plus
  the Midas Touch card, in one style (thick outlines, flat colours, creepy).
- ComfyUI HTTP client (SDXL DreamShaper XL Lightning, 6 steps), BiRefNet cut-outs inside ComfyUI, cleanup
  that keeps the main figure, trim, WebP export, manifest, contact sheets, `picks.json` for candidates.
- Gentle mode (default) for integrated GPUs: one image per job, smaller renders, tiled VAE decoding and a
  pause after every image. Full-size batches froze the development machine twice (Intel GPU driver
  timeout, LiveKernelEvent 141); a third hard power-off happened during a gentle-mode icon run on battery,
  so GPU runs on this laptop now only happen on request.
- `appicon.py` composes the app icon (Vile on a toxic hexagon) and splash screens from the existing art.
- On the board, ground textures sit at a fixed size per hex, centred and mirror-tiled; props stand on wall
  hexes and around the board edge.

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

- Generated art varies in how literally it follows a description (the Rotten Flesh Steak is a meat monster
  rather than a literal steak, Ghost Train's palm eyes are missing); prompts and picks can be refined and
  re-rendered per asset. Animations are code-driven transforms and particles, not frame-by-frame sprite
  sheets.
- Strict NATs can block direct P2P connections (only STUN is configured, no TURN relay); the panel says so
  and server-hosted friendlies remain available.
- Installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first launch.
  macOS and Linux packages must be built on those platforms.
- Character, ability and item names and texts stay English in every language (as in the Game Plan); the
  per-character Testing Chamber scripts exist in English and German.
- Three characters (Semi-mechanical Frankenstein, Zombie Brute, Swamp Siren) have new fully clothed prompts
  in `catalog.ts`, but their re-render is pending: ComfyUI crashed the development laptop, so the shipped
  tokens are still the earlier versions until a GPU run is done (`npm run assets:generate -- --only=tokens/frankenstein,tokens/zombie_brute,tokens/swamp_siren`).
  The same applies to generated interface icons (the SVG set is used meanwhile).
- Players nearby relies on the server seeing the same public address for one Wi-Fi; carrier-grade NAT on
  mobile data can group strangers, so the list only offers friendly challenges.

## Verification

- `npm test`: engine and server suites (friends, nearby, challenges, team management, daily rewards, Testing
  Chamber walkthroughs, all modes with small and full decks included). `node tools/qa/chambers.ts` re-solves
  the chambers after a change.
- `npm run qa:i18n`: every interface string exists in all twelve languages.
- `npm run typecheck`: engine, server, client.
- `npm run smoke`: bundled server boots and answers 16 checks.
- `tools/qa`: screenshots of every screen at 1600 × 900 and 390 × 844, Basic Training played by clicks from a
  brand-new profile, frames of every attack effect (`fx.ts`),
  two-browser P2P match with equal hashes after three rounds, desktop app launch with embedded server.
