## ADDED Requirements

### Requirement: Deployment unit is Docker compose
The deployment unit SHALL be a single `docker-compose.yml` defining at minimum `server`, `web`, and `caddy` services. Each service MUST run from a built image and MUST NOT require host-side language runtimes.

#### Scenario: Compose file is self-contained
- **WHEN** an operator runs `docker compose up -d` from the deployment directory on a fresh host with Docker installed
- **THEN** all three services MUST start and the app MUST become reachable on the configured port

### Requirement: Persistent state survives container restarts
SQLite databases used by the kernel and the AI key pool SHALL be stored in a host bind-mounted directory or a named Docker volume. Restarting any container MUST NOT drop event log data, kernel state, or stored API keys.

#### Scenario: Restart preserves event log
- **WHEN** the `server` container is stopped and started again
- **THEN** the EventLog and AI key store contents present before the stop MUST be present after the start

### Requirement: `hunter.sisihome.org` is fronted by the existing RPi Caddy reverse proxy
The site `hunter.sisihome.org` SHALL be reverse-proxied by the existing RPi Caddy that already serves the rest of the HomeProject sites. The desktop host SHALL run the Greed Island stack and expose the server's HTTP port on its Tailscale interface; the RPi Caddy MUST proxy to that Tailscale upstream. The desktop compose stack MUST NOT include its own colocated Caddy container in v1.

#### Scenario: RPi Caddy is the public-facing entry point
- **WHEN** an HTTPS request for `hunter.sisihome.org` is received
- **THEN** the request MUST land on the RPi Caddy and MUST be reverse-proxied to the desktop host's Tailscale address on the configured Greed Island server port

#### Scenario: SSE pass-through is configured at the proxy hop
- **WHEN** a client subscribes to `/api/events/stream` through the RPi Caddy
- **THEN** the corresponding RPi Caddy upstream block MUST set `flush_interval -1` (or an equivalent unbuffered streaming directive) so that committed events reach the client without proxy buffering

#### Scenario: Public internet access is not exposed in v1
- **WHEN** the v1 deployment is online
- **THEN** an HTTPS request originating from outside the Tailnet MUST NOT reach the application; only Tailnet-attached clients MUST be able to resolve and reach `hunter.sisihome.org`

### Requirement: Public exposure is a separate later change subject to the deployment hardening gate
The deployment platform SHALL NOT enable public-internet exposure of `hunter.sisihome.org` in v1. Promotion to public exposure MUST be a separately tracked change that satisfies the deployment hardening gate before being deployed.

The hardening gate SHALL include at minimum:
- Super-admin and Admin login surfaces restricted to Tailscale or LAN source ranges.
- SSH on the host restricted to Tailscale or LAN source ranges.
- Correct real-client-IP plumbing through the reverse proxy or tunnel.
- Backup coverage for the SQLite databases, the `.env` file, and any service account credentials.

#### Scenario: Public exposure is not toggled in v1
- **WHEN** the v1 deployment is reviewed
- **THEN** no compose, Caddyfile, DNS, or firewall change MUST exist that exposes `hunter.sisihome.org` beyond the Tailscale network

### Requirement: SSE responses are not buffered by the proxy
The Caddy reverse-proxy configuration SHALL pass Server-Sent Event responses through without response buffering. The `flush_interval -1` directive (or an equivalent unbuffered streaming directive) MUST be applied to the SSE upstream.

#### Scenario: SSE stream is delivered live
- **WHEN** a client subscribes to `/api/events/stream` through Caddy
- **THEN** new events MUST reach the client within the same wall-clock second they are committed by the kernel, with no perceived delay caused by proxy buffering

### Requirement: Deployment targets the desktop host without GPU dependency
The v1 deployment SHALL target the desktop host (AMD 3700X, 48 GB, RTX 2070) but MUST NOT require GPU acceleration. AI inference is performed by remote providers via `MultiProviderClient` and MUST NOT depend on local CUDA, ROCm, or similar runtimes.

#### Scenario: GPU is not required to boot
- **WHEN** the compose stack is brought up on a host without an available GPU
- **THEN** all v1 services MUST start and operate normally
