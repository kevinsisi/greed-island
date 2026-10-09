"""Real Caddy route checks on isolated local Docker containers; no production I/O.

The backend is a Caddy stub, not the application. Its 401 checks proxy pass-through
only. Actual auth/Origin rejection needs separate Node 22.23.2 application tests.
Uses Python standard library and existing Docker; run on a Linux GitHub runner.
"""
import hashlib
import argparse
import ipaddress
import json
import os
import posixpath
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/l390-routing'
IMAGE = 'caddy:2.8-alpine'
BACKEND_FALLTHROUGH = 'synthetic-unreviewed-backend-fallthrough'

# Samples of each real mounted dynamic route shape. The distinctive backend
# fallback proves forwarding without claiming application auth/availability.
REVIEWED_DYNAMIC_PATHS = [
    '/api/admin/users/42/role', '/api/admin/users/42/status', '/api/admin/users/42/reset-password',
    '/api/social/friend-request/42', '/api/social/friend-accept/42', '/api/social/friend-reject/42',
    '/api/social/friends/42', '/api/social/message/42', '/api/social/messages/42', '/api/social/messages/42/read',
    '/api/social/alliance/invite/42', '/api/buildings/b_reviewed', '/api/areas/t_reviewed',
    '/api/area/t_reviewed/ecology', '/api/goods/inventory/42',
    '/api/trade/accept/reviewed', '/api/trade/reject/reviewed', '/api/trade/cancel/reviewed',
    '/api/shop/techniques/42/buy', '/api/admin/cards/42/image', '/api/settings/keys/42',
    '/api/settings/keys/reactivate-all',
    '/api/npc/npc-reviewed/dialog-hold', '/api/npc/npc-reviewed/interact', '/api/npc/npc-reviewed/greet',
    '/api/npc/npc-reviewed/history', '/api/npc/npc-reviewed/intent', '/api/npc/npc-reviewed/beliefs',
    '/api/combat/reviewed', '/api/combat/reviewed/action', '/api/combat/reviewed/play',
    '/api/combat/reviewed/cancel', '/api/combat/reviewed/snapshot', '/api/combat/reviewed/stream',
]
DENIED_API_PATHS = [
    '/api/admin/users/42/extra/role', '/api/admin/users/42/role/extra',
    '/api/social/friend-request/42/extra', '/api/social/friend-accept/42/extra',
    '/api/social/friend-reject/42/extra', '/api/social/friends/42/extra', '/api/social/message/42/extra',
    '/api/social/messages/42/private', '/api/social/messages/42/read/extra', '/api/social/messages/42/extra/read',
    '/api/social/alliance/invite/42/extra',
    '/api/buildings/b_reviewed/apply', '/api/buildings/b_reviewed/quit',
    '/api/buildings/b_reviewed/work', '/api/buildings/b_reviewed/rest',
    '/api/areas/t_reviewed/extra', '/api/area/t_reviewed/extra/ecology', '/api/area/t_reviewed/ecology/extra',
    '/api/goods/inventory/42/extra',
    '/api/trade/accept/reviewed/extra', '/api/trade/reject/reviewed/extra', '/api/trade/cancel/reviewed/extra',
    '/api/shop/techniques/42/extra/buy', '/api/shop/techniques/42/buy/extra',
    '/api/admin/cards/42/extra/image', '/api/admin/cards/42/image/extra', '/api/settings/keys/42/extra',
    '/api/npc/npc-reviewed/extra/history', '/api/npc/npc-reviewed/history/extra',
    '/api/npc/npc-reviewed/private', '/api/combat/reviewed/private',
    '/api/combat/reviewed/action/extra', '/api/combat/reviewed/extra/snapshot',
    '/api/admin/npc-stats', '/api/admin/lineage', '/api/world/chronicle', '/api/world/history-arcs',
    '/api/world/bio-nodes', '/api/settlements', '/api/properties/bindings/npc-reviewed',
    '/api/buildings/', '/api/areas/', '/api/social/message/', '/api/social/friend-request/',
    '/api/social/alliance/invite/', '/api/goods/inventory/', '/api/trade/accept/',
    '/api/settings/keys/', '/api/combat/',
    '/api/admin/users//role', '/api/area//ecology', '/api/shop/techniques//buy',
    '/api/admin/cards//image', '/api/npc//history',
]


def canonical_match_path(path):
    # Caddy 2.8.4 MatchPathRE evaluates URI-decoded cleanPath, which merges
    # repeated slashes/resolves dots but preserves the trailing slash:
    # https://github.com/caddyserver/caddy/blob/v2.8.4/modules/caddyhttp/caddyhttp.go
    decoded = urllib.parse.unquote(path)
    cleaned = posixpath.normpath(re.sub(r'/+', '/', decoded))
    if cleaned != '/' and decoded.endswith('/'):
        cleaned += '/'
    return cleaned


def assert_source_allowlist():
    """Python source-pattern checks only, not real Caddy adaptation/runtime."""
    config = (ROOT / 'deploy/l390/Caddyfile.l390').read_text()
    fixed = re.findall(r'^\s*@unifiedApi path (.+)$', config, re.MULTILINE)
    dynamic = re.findall(r'^\s*@unifiedDynamicApi path_regexp \S+ (.+)$', config, re.MULTILINE)
    assert len(fixed) == 1 and len(dynamic) == 1, 'Expected one fixed and one exact dynamic allowlist'
    paths = fixed[0].split()
    assert len(paths) == len(set(paths)), 'Duplicate fixed proxy path'
    assert all(path.startswith('/api/') and '*' not in path for path in paths), 'Fixed API paths must be exact'
    pattern = dynamic[0]
    assert pattern.startswith('^/api/') and pattern.endswith('$'), 'Dynamic proxy regex must be fully anchored'
    matcher = re.compile(pattern)
    def allowed(path):
        canonical = canonical_match_path(path)
        return canonical.lower() in paths or matcher.fullmatch(canonical) is not None
    for path in REVIEWED_DYNAMIC_PATHS:
        assert allowed(path), f'Reviewed mounted route is denied: {path}'
    for path in DENIED_API_PATHS:
        assert not allowed(path), f'Unreviewed route would reach backend: {path}'
    # Surplus prefixes/suffixes and nested identifiers fail.
    for path in REVIEWED_DYNAMIC_PATHS:
        assert not allowed('/extra' + path), path
        assert not allowed(path + '/extra'), path
    return {'evidence': 'SOURCE_PATTERN_ONLY', 'fixedPaths': len(paths),
            'reviewedDynamicShapes': len(REVIEWED_DYNAMIC_PATHS), 'proxyDeniedShapes': len(DENIED_API_PATHS),
            'excluded': ['real Caddy parser/adaptation', 'Docker HTTP routing', 'application authentication']}


def docker(*args, check=True):
    result = subprocess.run(['docker', *args], text=True, capture_output=True, timeout=120)
    if check and result.returncode:
        raise RuntimeError(f'docker {args[0]} failed: {result.stderr}')
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    assert_source_allowlist()
    OUT.mkdir(parents=True, exist_ok=True)
    config = ROOT / 'deploy/l390/Caddyfile.l390'
    compose = ROOT / 'deploy/l390/docker-compose.yml'
    dockerfile = (ROOT / 'packages/web/Dockerfile').read_text()
    actual_image = re.search(r'^FROM (\S+) AS runtime$', dockerfile, re.MULTILINE).group(1)
    assert actual_image == IMAGE, f'Review runtime image change first: {actual_image}'
    assert './Caddyfile.l390:/etc/caddy/Caddyfile:ro' in compose.read_text()
    suffix = uuid.uuid4().hex[:12]
    network, frontend, backend = (f'l390-{part}-{suffix}' for part in ['net', 'web', 'stub'])
    results = []
    passed = False
    try:
        docker('pull', IMAGE)
        image_info = json.loads(docker('image', 'inspect', IMAGE).stdout)[0]
        run_image = image_info['Id']
        (OUT / 'image.json').write_text(json.dumps({
            'tag': IMAGE, 'id': image_info['Id'], 'repoDigests': image_info.get('RepoDigests', [])
        }, indent=2) + '\n')
        validation = docker('run', '--rm', '--network', 'none',
                            '-v', f'{config}:/etc/caddy/Caddyfile:ro', run_image,
                            'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile', check=False)
        (OUT / 'validate.log').write_text(validation.stdout + validation.stderr)
        assert validation.returncode == 0, 'Caddy validation failed; see validate.log'
        adapted = docker('run', '--rm', '--network', 'none',
                         '-v', f'{config}:/etc/caddy/Caddyfile:ro', run_image,
                         'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile', '--pretty')
        (OUT / 'adapted.json').write_text(adapted.stdout)
        with tempfile.TemporaryDirectory(prefix='l390-routing-') as directory:
            fixture = Path(directory)
            static = fixture / 'static'
            static.mkdir()
            for name in ['index.html', 'favicon.ico', 'robots.txt', 'LICENSE', 'account', 'api', '.env']:
                (static / name).write_text(f'fixture:{name}')
            (static / 'folder').mkdir()
            (static / 'assets').mkdir()
            (static / 'assets/app.js').write_text('fixture:asset')
            stub = fixture / 'stub.Caddyfile'
            stub.write_text('''{
    auto_https off
}
:4179 {
    @protected path /api/auth/me /api/world/snapshot /api/world/stream /api/map /api/admin/users /api/admin/world /api/social/friends /api/social/stream /api/social/messages/1/read
    respond @protected "synthetic-unauthenticated" 401
    @mountedPublic path /api/buildings /api/buildings-catalog /api/areas /api/areas/t_dock /api/area/t_dock/ecology /api/goods/market-prices /api/properties /api/cards/config
    respond @mountedPublic "synthetic-reviewed-mounted-projection" 200
    @mountedPrivate path /api/wallet /api/goods/inventory/self /api/properties/bindings /api/cards/held /api/cards/visit /api/codex /api/trade/list /api/shop/techniques /api/me/techniques /api/settings/keys /api/admin/cards/images /api/admin/cards/1/image /api/admin/sim/advance /api/npc/npc-one/history /api/player/needs /api/player/needs/reconcile /api/world/player-state /api/world/player-action /api/combat/active /api/combat/match-one /api/combat/match-one/stream
    respond @mountedPrivate "synthetic-unauthenticated" 401
    respond /api/auth/login "{http.request.header.Origin}" 403
    respond /api/profile "{http.request.header.Cookie}" 200
    respond /api/auth/forgot-password "ADMIN_RECOVERY_REQUIRED" 403
    respond /api/version "synthetic-version" 200
    @publicCatalog path /api/world /api/npcs /api/events /api/cards /api/world-events /api/dashboard /api/events/stream /api/stream
    respond @publicCatalog "synthetic-reviewed-public-projection" 200
    respond /card-images/1.png "synthetic-reviewed-art" 200
    respond /healthz "synthetic-unified-health" 200
    respond "synthetic-unreviewed-backend-fallthrough" 418
}
''')
            # Internal network blocks outbound traffic; no container port is published.
            # The Linux runner can reach its own internal bridge's container address.
            docker('network', 'create', '--internal', network)
            docker('run', '-d', '--name', backend, '--network', network, '--network-alias', 'multiplayer',
                   '-v', f'{stub}:/etc/caddy/Caddyfile:ro', run_image)
            docker('run', '-d', '--name', frontend, '--network', network,
                   '-v', f'{config}:/etc/caddy/Caddyfile:ro',
                   '-v', f'{static}:/srv/greed-island-web:ro', run_image)
            inspection = json.loads(docker('inspect', frontend).stdout)[0]
            address = inspection['NetworkSettings']['Networks'][network]['IPAddress']
            assert ipaddress.ip_address(address).is_private
            assert not inspection['HostConfig']['PortBindings']
            base = f'http://{address}:80'
            client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

            def request(path, headers=None):
                try:
                    response = client.open(urllib.request.Request(base + path, headers=headers or {}), timeout=5)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    return response.status, response.headers, response.read().decode()

            deadline = time.monotonic() + 30
            while True:
                try:
                    if request('/healthz')[0] == 200 and request('/api/world/snapshot')[0] == 401:
                        break
                except (OSError, urllib.error.URLError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('Isolated Caddy containers did not become ready')
                time.sleep(0.25)

            cases = [
                ('/', 302, ''), ('/account', 302, ''), ('/account?next=/api/npcs', 302, ''),
                ('/old-page', 302, ''), ('/multiplayer-3d-evil', 302, ''), ('/game-evil', 302, ''),
                ('/multiplayer-3d', 302, ''), ('/multiplayer-3d/room', 302, ''),
                ('/prototype-3d', 302, ''), ('/prototype-3d/old-save', 302, ''),
                ('/game', 200, 'fixture:index.html'), ('/game/region', 200, 'fixture:index.html'),
                ('/api', 404, ''), ('/api/npcs', 200, 'synthetic-reviewed-public-projection'), ('/api/events', 200, 'synthetic-reviewed-public-projection'),
                ('/api/world-events', 200, 'synthetic-reviewed-public-projection'), ('/api/admin/users', 401, 'synthetic-unauthenticated'), ('/api/admin/world', 401, 'synthetic-unauthenticated'), ('/api/cards', 200, 'synthetic-reviewed-public-projection'),
                *[(path, 200, 'synthetic-reviewed-mounted-projection') for path in [
                    '/api/buildings', '/api/buildings-catalog', '/api/areas', '/api/areas/t_dock', '/api/area/t_dock/ecology', '/api/goods/market-prices', '/api/properties', '/api/cards/config']],
                *[(path, 401, 'synthetic-unauthenticated') for path in [
                    '/api/wallet', '/api/goods/inventory/self', '/api/properties/bindings', '/api/cards/held', '/api/cards/visit', '/api/codex', '/api/trade/list', '/api/shop/techniques', '/api/me/techniques', '/api/settings/keys', '/api/admin/cards/images', '/api/admin/cards/1/image', '/api/admin/sim/advance', '/api/npc/npc-one/history', '/api/player/needs', '/api/player/needs/reconcile', '/api/world/player-state', '/api/world/player-action', '/api/combat/active', '/api/combat/match-one', '/api/combat/match-one/stream']],
                ('/api/admin/npc-stats', 404, ''), ('/api/admin/lineage', 404, ''), ('/api/world/chronicle', 404, ''), ('/api/world/history-arcs', 404, ''), ('/api/world/bio-nodes', 404, ''), ('/api/settlements', 404, ''),
                ('/api/auth/unknown', 404, ''), ('/api/world/unknown', 404, ''),
                ('/api/npc/private/mind-sheet', 404, ''),
                ('/api/raw-event-log', 404, ''),
                ('/api/world', 200, 'synthetic-reviewed-public-projection'),
                ('/api/dashboard', 200, 'synthetic-reviewed-public-projection'),
                ('/api/events/stream', 200, 'synthetic-reviewed-public-projection'),
                ('/card-images/1.png', 200, 'synthetic-reviewed-art'),
                ('/card-images/101.png', 404, ''),
                ('/card-images/history/1.png', 404, ''),
                ('/api/auth/me', 401, 'synthetic-unauthenticated'),
                ('/api/world/snapshot', 401, 'synthetic-unauthenticated'),
                ('/api/world/stream', 401, 'synthetic-unauthenticated'),
                ('/api/map', 401, 'synthetic-unauthenticated'),
                ('/api/social/friends', 401, 'synthetic-unauthenticated'),
                ('/api/social/stream?expectedAccountId=1', 401, 'synthetic-unauthenticated'),
                ('/api/social/messages/1/read', 401, 'synthetic-unauthenticated'),
                ('/api/social/unknown', 404, ''),
                ('/api/auth/forgot-password', 403, 'ADMIN_RECOVERY_REQUIRED'),
                ('/api/version', 200, 'synthetic-version'),
                ('/card-images', 404, ''), ('/card-images/not-an-image.svg', 404, ''),
                ('/healthz', 200, 'synthetic-unified-health'), ('/assets/app.js', 200, 'fixture:asset'),
                ('/assets/missing.js', 404, ''), ('/favicon.ico', 200, 'fixture:favicon.ico'),
                ('/robots.txt', 200, 'fixture:robots.txt'), ('/LICENSE', 200, 'fixture:LICENSE'),
                ('/missing.ico', 302, ''), ('/folder', 302, ''), ('/.env', 302, ''),
                ('/nested/robots.txt', 302, ''), ('/mp-api', 404, ''), ('/mp-api/snapshot', 404, ''),
                ('/api%2Fnpcs', 200, 'synthetic-reviewed-public-projection'), ('/card-images%2F1.png', 200, 'synthetic-reviewed-art'),
                ('/multiplayer-3d/../api/npcs', 200, 'synthetic-reviewed-public-projection'),
                *[(path, 418, BACKEND_FALLTHROUGH) for path in REVIEWED_DYNAMIC_PATHS],
                *[(path, 404, '') for path in DENIED_API_PATHS],
            ]
            for path, expected, body_marker in cases:
                status, headers, body = request(path)
                record = {'path': path, 'expected': expected, 'actual': status, 'passed': False}
                results.append(record)
                assert status == expected, record
                if expected == 302:
                    assert headers.get('Location') == '/game', (path, dict(headers))
                    assert headers.get('Cache-Control') == 'no-store', path
                if body_marker:
                    assert body == body_marker, (path, body)
                if expected == 404:
                    assert BACKEND_FALLTHROUGH not in body, f'Frontend deny leaked to backend: {path}'
                record['passed'] = True
            origin = 'https://unknown-origin.invalid'
            status, _, body = request('/api/auth/login', {'Origin': origin})
            assert status == 403 and body == origin, 'Proxy must forward Origin unchanged to backend'
            results.append({'path': '/api/auth/login', 'passed': True,
                            'meaning': 'Header forwarding only; NOT real backend 403/auth verification'})
            cookie = 'greed_session=synthetic-fixture-only'
            status, _, body = request('/api/profile', {'Cookie': cookie})
            assert status == 200 and body == cookie, 'Proxy must forward the cookie unchanged'
            results.append({'path': '/api/profile', 'passed': True,
                            'meaning': 'Synthetic cookie forwarding only; NOT application session evidence'})
            # Every legacy redirect must terminate at the active SPA in one hop.
            status, headers, _ = request('/multiplayer-3d')
            assert status == 302 and headers.get('Location') == '/game'
            assert request(headers['Location'])[0] == 200
            results.append({'path': '/multiplayer-3d -> /game', 'passed': True,
                            'meaning': 'Single-hop redirect terminates; no old-MP/game redirect loop'})
            passed = True
    finally:
        for container in [frontend, backend]:
            logs = docker('logs', container, check=False)
            (OUT / f'{container.split("-")[1]}.log').write_text(logs.stdout + logs.stderr)
            print(f'Container {container} logs:\n{logs.stdout}{logs.stderr}')
            docker('rm', '-f', container, check=False)
        docker('network', 'rm', network, check=False)
        (OUT / 'results.json').write_text(json.dumps({'passed': passed, 'checks': results,
            'backend': 'Synthetic Caddy stub. 401 is proxy evidence, not production authentication proof.'}, indent=2) + '\n')
    # Package configuration evidence only after all checks pass. No Release/CD mutation.
    files = {}
    for source in [config, compose]:
        shutil.copy2(source, OUT / source.name)
        files[source.name] = hashlib.sha256(source.read_bytes()).hexdigest()
    (OUT / 'manifest.json').write_text(json.dumps({
        'schemaVersion': 1, 'sourceCommit': os.environ.get('GITHUB_SHA', 'local-unpublished'),
        'target': 'greed-island-l390', 'caddyImage': IMAGE, 'filesSha256': files,
        'verifiedScope': 'Isolated Caddy routing with synthetic static files/backend',
        'deploymentStatus': 'NOT DEPLOYED',
        'activationRequired': 'Owner-approved backup/import/admin/progress and application/native/browser gates before any live reload or recreate'
    }, indent=2) + '\n')
    print(f'PASS: {len(results)} isolated Caddy checks. No real application auth or production tests.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-only', action='store_true', help='Check source patterns only; no Docker/runtime acceptance')
    args = parser.parse_args()
    if args.source_only:
        print(json.dumps(assert_source_allowlist(), indent=2))
    else:
        main()
