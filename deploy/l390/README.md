# L390 multiplayer
Run PowerShell commands from the repository root.
Setup (`MULTIPLAYER_ALLOWED_ORIGINS` is required):
```powershell
Copy-Item deploy/l390/.env.example deploy/l390/.env
notepad deploy/l390/.env
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml build
docker compose --env-file deploy/l390/.env -f deploy/l390/docker-compose.yml up -d
```
Web is published only at `127.0.0.1:28100` by default.
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
