# Playing online and hosting a server

Players never type addresses for the usual cases. **Compete → Online → Play online** looks for a server in
this order and signs in by itself:

1. the server named in the client's `server.json` (the "official" server, see below)
2. the server the page was loaded from (the game server also serves the web version)
3. the server this device played on last time
4. desktop app: any Contaminant server announcing itself on the same Wi-Fi
5. a server on this computer (`localhost:8787`)

If nothing answers, the **desktop app starts its own server** and announces it to the network. Friends on the
same Wi-Fi land on the same server by themselves; the Android app hears the announcement too. Browsers that
cannot hear it find a **Search my Wi-Fi** button and an address field under Settings → Advanced.

Once online, **Players nearby** lists everyone connected from the same network and **Challenge** sends them
a friendly invitation. Friends are added with a 6-letter friend code (Compete → Friends).

## 1. Same Wi-Fi / LAN party (no setup)

Install the desktop app on one PC and start it: it hosts a game server in the background and announces it
on the Wi-Fi. Phones (Android app) and other PCs on the same network go online by themselves or with one
tap on *Play online*. Windows asks once whether the app may use the
network: allow it for private networks. That PC now hosts ladder, tournaments and the World Cup for
everybody on the network. The data lives in `%APPDATA%/Contaminant/server`.

Without the desktop app: `npm run start:server -- --lan` on any computer with Node 24.

## 2. A public server in two clicks (Render)

`render.yaml` describes the server for [Render](https://render.com): create a free account, choose
**New → Blueprint**, pick this repository and confirm. After a few minutes Render shows the address
(for example `https://contaminant.onrender.com`). Put it into `packages/client/public/server.json` and
rebuild the apps: from then on **Play online** connects everyone from anywhere with one tap. The free plan
sleeps after 15 idle minutes and forgets accounts on restarts; a paid plan with a disk keeps them.

## 3. A public server on your own machine (Docker)

On any Linux server or VPS with Docker:

```bash
git clone https://github.com/lb12a/CONTAMINANT.git && cd CONTAMINANT
ADMIN_TOKEN=pick-a-long-secret SERVER_NAME="Contaminant EU" docker compose up -d
```

The game is now at `http://<server-ip>:8787` (web client included). With a domain pointing at the server,
let Caddy fetch an HTTPS certificate:

```bash
DOMAIN=play.example.com ADMIN_TOKEN=pick-a-long-secret docker compose --profile https up -d
```

| Setting (environment) | Meaning |
| --- | --- |
| `SERVER_NAME` | name shown in the server list |
| `ADMIN_TOKEN` | protects `/api/admin/*` (simulations, tournaments, World Cup control) |
| `TRUST_PROXY=1` | take player addresses from `X-Forwarded-For` (needed for *Players nearby* behind a proxy) |
| `PLANNING_SECONDS` | default planning time for ranked matches |

Data (accounts, matches, replays, tournaments) is one SQLite file in the `contaminant-data` volume. Back it up
with `docker compose cp contaminant:/data/contaminant.sqlite ./backup.sqlite`. Update with
`git pull && docker compose up -d --build`.

Without Docker: `npm ci && npm run build && node packages/server/dist/server.mjs --port 8787 --data ./data/contaminant.sqlite --static packages/client/dist`.

## 4. The one config line: point every client at your server

The desktop installer, the Android app and copies of the web client hosted elsewhere read
`packages/client/public/server.json`:

```json
{ "servers": ["https://play.example.com"] }
```

Rebuild the clients after changing it (`npm run desktop:dist`, `npm run android:build`). The web client
served by the game server itself needs no configuration.

Notes

- Browsers only allow a secure (`https://`) page to talk to a secure server. A public server for the web
  version therefore needs HTTPS (the Caddy profile above). The desktop and Android apps can use plain
  `http://` addresses in the home network.
- Ports: `8787/tcp` for the game; the LAN announcement uses `8788/udp` inside the local network only.
