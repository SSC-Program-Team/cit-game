# Deploying the preview

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
