# L390 multiplayer
Run PowerShell commands from the repository root.
Setup (`MULTIPLAYER_ALLOWED_ORIGINS` is required):
```powershell
Copy-Item deploy/l390/.env.example deploy/l390/.env
notepad deploy/l390/.env
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml build
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml up -d
```
Web binds to `GREED_L390_BIND_ADDR` (default `127.0.0.1`); set it to the L390 tailnet IP to bind only to tailnet. Do not use `0.0.0.0` or a LAN address.
Rollback to loopback by setting `GREED_L390_BIND_ADDR=127.0.0.1` in `.env`, then rerun `docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml up -d`.
Restart containers: `docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml restart`
Recreate after `.env` changes: `docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml up -d --force-recreate`
Before an upgrade, save the current images:
```powershell
docker save greed-island-l390-multiplayer:local greed-island-l390-web:local -o .\greed-l390-rollback-images.tar
```
Rollback to those images; `down` keeps the named volume:
```powershell
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml down
docker load -i .\greed-l390-rollback-images.tar
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml up -d
```
Back up the volume while multiplayer is stopped, then start it again:
```powershell
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml stop multiplayer
docker run --rm -v greed-l390-mp-data:/data -v "${PWD}:/backup" alpine:3.20 sh -c "tar -czf /backup/greed-l390-mp-data.tgz -C /data ."
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml start multiplayer
```
Restore with multiplayer stopped using `tar -xzf` and the same volume mounts.
Retrieve fixture credentials (the output is secret; do not paste it into logs or tickets):
```powershell
docker run --rm -v greed-l390-mp-data:/data alpine:3.20 cat /data/credentials.json
```

Known limits:
- Login is limited to 20 attempts per source IP per 60 s (`http.ts:52-59`). Behind Caddy every player shares one source IP, so many logins within a minute get 429; retry after a minute.
- Move commands are limited to one per player per 100 ms tick (429 `MOVE_RATE_LIMIT`); this is a game rule, not an error.
