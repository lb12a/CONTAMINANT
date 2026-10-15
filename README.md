# Contaminant

A dark, hand-drawn horror tactics game in a leaking laboratory. Both players plan their round in secret
(30 seconds by default), then everything resolves at once: Priority first, then Speed. Spend Action Points
to deploy creatures, move, attack and play item cards on a 15 × 9 hex board. First to 100 Victory Points wins.

It runs in the browser, as a desktop app (Windows installer, macOS, Linux) and on phones (installable PWA).
Online play has a ranked ladder with divisions and seasons, automated tournaments, a yearly World Cup on
Halloween with a monthly qualifying circuit, teams, public profiles, spectating with broadcast delay,
verified replays and a live meta dashboard.

The rules come from the two design documents in `Pdfs/`.

## Quick start

Requires Node.js 24 or newer (the TypeScript sources run directly through Node's type stripping).

```bash
npm install
```

```bash
npm run dev
```

Opens the client on http://localhost:5173. Offline play (bots, Basic Training, Testing Chambers, collection,
deck builder, shop) works without a server. For online features start the game server in a second terminal:

```bash
npm run dev:server
```

The server listens on http://localhost:8787. In the client go to **Online**, keep the server address and
connect.

## What is in the repository

| Path | What it is |
| --- | --- |
| `packages/engine` | The complete rules engine: deterministic state, hex math, damage and status formulas, 30 characters, 70 items, fields, traps, AP economy, the Priority → Speed scheduler, fog-of-war views, bots, tutorials, progression, replays. Pure TypeScript, no DOM. |
| `packages/server` | Authoritative game server on `node:http`, `ws` and `node:sqlite`: matchmaking, ranked Elo with divisions and seasons, team battles, friendly lobbies, tournaments (single / double elimination, Swiss), the Contamination Circuit and World Cup, teams, telemetry and meta analysis with anomaly detection, spectator feeds, replay verification, OBS overlay, WebRTC signalling. |
| `packages/client` | React 19 + Vite client. The board is a PixiJS 2.5D "diorama" renderer; the HUD floats over it. Offline matches run the engine in the browser. |
| `apps/desktop` | Electron shell with an optional built-in LAN server and electron-builder installers. |
| `tools/assetgen` | ComfyUI pipeline that generates every creature, prop, ground texture, backdrop and item icon. |
| `tools/qa` | Playwright scripts: screenshots of every screen (desktop + phone), an automated Basic Training run, a two-browser P2P match and a desktop-app launch check. |
| `docs/IMPLEMENTATION_STATUS.md` | What is implemented, design decisions and known limits. |

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` / `npm run dev:server` | Client dev server / game server with telemetry seed |
| `npm test` | Engine and server test suites (`node --test`) |
| `npm run typecheck` | TypeScript checks for engine, server and client |
| `npm run build` | Production client (`packages/client/dist`) and bundled server (`packages/server/dist/server.mjs`) |
| `npm run smoke` | Builds the server bundle, boots it and checks the main endpoints, replay verification and the WebSocket handshake |
| `npm run desktop` | Starts the desktop app from the built client |
| `npm run desktop:dist` | Builds client + server and packages installers into `apps/desktop/release` (Windows NSIS on Windows) |
| `npm run simulate` | Bot-vs-bot balance simulation |
| `npm run assets:generate` | Generates missing art with ComfyUI (see below) |
| `npm run assets:status` | Lists missing generated assets |
| `npm run qa:shots -- http://localhost:5173 out/` | Screenshots of every screen |
| `npm run qa:training` | Plays Basic Training with clicks only |

## Playing

- **Basic Training** (offered on first launch): a guided first match. The coach explains, but every step
  waits until you have done it yourself: deploy, seal, select, move, attack, attach a card, read the result.
- **Testing Chambers**: one five-act tutorial per character.
- **Play vs Bot**: six modes (Contamination, Elimination, Domination, Research, Escape, Anomaly) and four bot levels.
- **Online**: ranked and casual queues, friendly lobbies, two-player Team Battles, and **Direct match (P2P)**:
  a WebRTC connection between two browsers where plans are sealed as hashes before they are revealed.
- **Tournaments**: daily and weekly cups run automatically with check-in, MMR seeding, brackets and prizes.
- **World Cup**: every year on Halloween. From November to September a Monthly Major runs on the first
  Saturday (double elimination, minimum MMR to enter). Placements earn Circuit Points; Major champions and
  the top of the points race are seeded into the World Cup groups, everybody else above the World Cup
  threshold can enter the Last Chance qualifier on 29 October. Groups on 30 October, the final on 31 October.
- **Teams, Ladder, Profiles, Replays, Meta**: team ladder and pages, the global ladder, public profiles
  with honours, step-through replays that re-simulate the match from its seed, and the live meta.

## Desktop app

`npm run desktop:dist` produces `apps/desktop/release/Contaminant-Setup-<version>.exe` on Windows.
In the desktop app, **Settings → LAN server → Host server** (or the *LAN Server* menu) starts the bundled
game server on port 8787; friends on the same network connect to the shown address from their Online screen.
Data of the hosted server lives in the app's user-data folder.

## Generated art (ComfyUI)

All creature, prop, ground, backdrop and item art is generated locally with ComfyUI:

1. Put the SDXL checkpoint `DreamShaperXL_Lightning.safetensors` into ComfyUI's `models/checkpoints`
   (BiRefNet for background removal ships with recent ComfyUI builds).
2. Start ComfyUI (`run_intel_gpu.bat` or `python main.py`), default address `http://127.0.0.1:8188`
   (override with `COMFY_URL`).
3. `npm run assets:generate` renders every missing asset. Prompts live in `tools/assetgen/src/catalog.ts`;
   creatures get two candidates each, `tools/assetgen/picks.json` selects one.
   `node tools/assetgen/src/generate.ts --sheet` writes contact sheets to compare candidates,
   `--only=tokens/vile` limits a run, `--force` regenerates.

The generator runs in a gentle mode by default: one image per job, slightly smaller renders, tiled VAE
decoding and a short pause after every image. On integrated GPUs (tested on an Intel Arc 140T) long GPU
kernels can trip the driver timeout and freeze the machine; start ComfyUI with
`--use-split-cross-attention --reserve-vram 3` as well. `COMFY_GENTLE=0` restores full-size batched renders
on a dedicated GPU, `COMFY_COOLDOWN_MS` sets the pause.

Output goes to `packages/client/public/assets/gen` (WebP + `manifest.json`). The client uses generated art
wherever it exists and falls back to procedural drawings otherwise, so the game always runs.

Art direction: a hand-drawn 2D cartoon look with thick dark outlines and flat colours, creepy creatures
that match their descriptions in the design documents, shown on a tilted diorama board with painted ground,
props, team-coloured glowing hexes, hologram plan previews, warm god rays and a vignette.

## Testing

```bash
npm test
```

73 engine tests (formulas, every major mechanic, tutorials, Basic Training path, refunds, Mind's Eye,
determinism) and 18 server tests (brackets, ratings, tournaments, the circuit and Halloween World Cup, teams,
replay verification, a ranked match over real HTTP and WebSocket).

## Technical notes

- Node 24 type stripping: no build step for engine and server in development (`erasableSyntaxOnly`).
- The engine is deterministic (seeded RNG in the state), so matches are stored as seed + planning ops + plans
  and can be re-simulated anywhere (server verification, client replays, P2P lockstep).
- Clients only ever receive fog-of-war views from the server; plans are validated server-side.
- The client honours `prefers-reduced-motion` (no idle sway, god-ray drift or particles).
