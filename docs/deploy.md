# Deploying

Pull requests run `npm run build` on GitHub (`.github/workflows/check.yml`); nothing is deployed
from GitHub. Hosting is on our own server, below.

## The game — ai.ssc.edu.hk/cit-game (canonical)

Apache on the AI server serves `/var/www/html/cit-game/` directly. `developer` is in
`www-data` and the docroot is group-writable, so this needs no sudo and no service.

```bash
cd ~/cit-game
python3 tools/mockup/export_game.py     # 1:1 chrome-less art into public/img
npm run build                           # dist/  (Vite, base './')
rsync -rc --delete dist/ developer@172.100.0.211:/var/www/html/cit-game/
```

- Game: <https://ai.ssc.edu.hk/cit-game/>
- Design page: <https://ai.ssc.edu.hk/cit-game/design/>

**Two traps, already fixed in the tooling:**

1. The design mockups are **3x** with their own HUD baked in. Loading them into a 384x216
   canvas showed one corner of the map at triple size. `export_game.py` renders `map.png`
   and `job.png` at 1:1 *without* chrome, so the game draws its own HUD.
2. `base: './'` matters — without it the built asset paths resolve from the domain root and
   `/cit-game/` serves a blank page.

## The school server (v0.6): money, the leaderboard, other players

From v0.6 the game talks to a small Node server for everything that changes money, the clock,
answers, gear or the record (`server/main.ts`, rules in `src/rules.ts`). Without it the game
offers solo play (saved on the device, not on the leaderboard). It needs **Node 22.6 or later**
and no packages: `node:http`, `node:sqlite` and its own WebSocket.

```bash
cd ~/cit-game
npm run build                               # dist/, as before
rsync -rc --delete dist/ developer@172.100.0.211:/var/www/html/cit-game/
rsync -rc server src package.json developer@172.100.0.211:~/cit-game/   # the server and the rules it runs
```

On the AI server, run it as a user service (`~/.config/systemd/user/cit-game.service`):

```ini
[Unit]
Description=cit-game school server
After=network.target

[Service]
WorkingDirectory=%h/cit-game
Environment=PORT=8787 HOST=127.0.0.1 STATIC= DB=%h/cit-game-data/cit-game.sqlite
Environment=ADMIN_KEY=change-me-to-something-long
# the school AI marks written answers; without the key they are marked by keywords
Environment=SPARK_URL=https://ai.ssc.edu.hk/spark/v1
Environment=SPARK_API_KEY=put-the-key-here
ExecStart=/usr/bin/node --experimental-strip-types --experimental-sqlite --no-warnings server/main.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now cit-game
loginctl enable-linger developer            # keep it running when nobody is logged in (needs sudo once)
curl -s localhost:8787/cit-game/api/health  # {"ok":true,"online":0,"ai":true}
```

`STATIC=` (empty) because Apache keeps serving the built game; the server only answers `api/`
and `admin`. Apache proxies those, WebSocket included. In the `ai.ssc.edu.hk` vhost (needs
`proxy`, `proxy_http` and `proxy_wstunnel`):

```apache
ProxyPass        /cit-game/api/ws  ws://127.0.0.1:8787/cit-game/api/ws
ProxyPass        /cit-game/api/    http://127.0.0.1:8787/cit-game/api/
ProxyPassReverse /cit-game/api/    http://127.0.0.1:8787/cit-game/api/
ProxyPass        /cit-game/admin   http://127.0.0.1:8787/cit-game/admin
ProxyPreserveHost On
```

- Teacher page: <https://ai.ssc.edu.hk/cit-game/admin> (asks for `ADMIN_KEY`): every player's
  wealth, reputation, class number, earnings, accuracy, mastery by topic, record and last visit;
  rename, change class number, pause or reset.
- Keep `SPARK_API_KEY` in the service file (or an `EnvironmentFile=` readable only by `developer`),
  never in the repo. The key is only ever used by the server: the browser never sees it. If the AI
  cannot be reached, a written answer is marked by its keyword list and the player is told so.
- v0.11 (the one street) starts everyone's progress again: money, exams and jobs from the village
  are not carried over. Names stay; each player is asked once for their class and number.
- The database is one SQLite file (`DB`). Back it up by copying it while the service is stopped,
  or with `sqlite3 cit-game.sqlite ".backup copy.sqlite"` while it runs.
- Try it on one machine first: `npm run build && ADMIN_KEY=test npm run server`, then open
  <http://127.0.0.1:8787/cit-game/> in two browsers. Add `?solo` to the URL to skip the server.

## Retired: the Cloudflare Tunnel preview

`cloudflared-cit` and `cit-game-web` were disabled once the school server took over.
`systemctl --user enable --now cit-game-web cloudflared-cit` brings the old
<https://cit-game.iengineer.cc.cd> back if it is ever useful off the school network.

---

## Deploying the design preview (historic)

The design preview is a static folder served from this machine through a **separate Cloudflare
Tunnel** — deliberately not the `hermes` tunnel, so redeploying it can never drop the Hermes
dashboard session.

| | |
|---|---|
| Public URL | https://cit-game.iengineer.cc.cd |
| Site root | `~/cit-game/site` (committed in this repo) |
| Local server | `cit-game-web.service` → `python3 -m http.server 8090 --bind 127.0.0.1` |
| Tunnel | `cit-game` (`c8743e7d-9392-4503-8b52-5f86d1a81d5a`), config `~/.cloudflared/cit-game.yml` |
| Tunnel service | `cloudflared-cit.service` |

## Update the preview

```bash
cd ~/cit-game
python3 tools/mockup/build.py          # redraw mockups (PIXEL_AUDIT=1 to catch clipping)
cp docs/mockups/*.png site/img/
git add -A && git commit -m "site: refresh mockups" && git push
```

No restart needed: the server reads the folder on every request.

**Bump the image version when you redraw.** Every `<img>` in `site/index.html` carries `?v=N`
because Cloudflare and Safari will happily serve a day-old mockup otherwise — the page looked
correct while the art underneath it was the previous map. Redraw → `cp` → bump `N` in one pass:

```bash
sed -i 's/?v=[0-9]*/?v=6/g' site/index.html   # next version number
```

## Rebuild the hosting from scratch

```bash
cloudflared tunnel create cit-game
# write ~/.cloudflared/cit-game.yml (tunnel id, credentials-file, ingress → http://localhost:8090)
cloudflared tunnel --config ~/.cloudflared/cit-game.yml route dns --overwrite-dns \
  c8743e7d-9392-4503-8b52-5f86d1a81d5a cit-game.iengineer.cc.cd
systemctl --user enable --now cit-game-web.service cloudflared-cit.service
```

**Trap found the first time:** `cloudflared tunnel route dns <name> <host>` silently used the
tunnel from the *default* config (`~/.cloudflared/config.yml` → `hermes`) and registered the CNAME
against the wrong tunnel. Always pass `--config <this tunnel's yml>` **and** the tunnel UUID, and use
`--overwrite-dns` if a record already exists.

## Why not Cloudflare Pages

Pages is the better home for a static site: it needs no machine to be awake, and it caches properly.
It also needs an API token, which is a secret I will not ask you to paste into chat. If you want
Pages instead, connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Pages →
Connect to Git) and it will build `site/` on every push; the tunnel can then be retired.

## Health check

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://cit-game.iengineer.cc.cd/
systemctl --user status cit-game-web cloudflared-cit --no-pager | head -20
```