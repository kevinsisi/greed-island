"""Real Caddy route checks on isolated local Docker containers; no production I/O.

The backend is a Caddy stub, not the application. Its 401 checks proxy pass-through
only. Actual auth/Origin rejection needs separate Node 22.23.2 application tests.
Uses Python standard library and existing Docker; run on a Linux GitHub runner.
"""
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/l390-routing'
IMAGE = 'caddy:2.8-alpine'


def docker(*args, check=True):
    result = subprocess.run(['docker', *args], text=True, capture_output=True, timeout=120)
    if check and result.returncode:
        raise RuntimeError(f'docker {args[0]} failed: {result.stderr}')
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
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
    respond /mp-api/snapshot "synthetic-unauthenticated" 401
    respond /mp-api/echo-origin "{http.request.header.Origin}" 200
    respond 404
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
                    if request('/healthz')[0] == 200 and request('/mp-api/snapshot')[0] == 401:
                        break
                except (OSError, urllib.error.URLError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('Isolated Caddy containers did not become ready')
                time.sleep(0.25)

            cases = [
                ('/', 302, ''), ('/account', 302, ''), ('/account?next=/api/npcs', 302, ''),
                ('/old-page', 302, ''), ('/multiplayer-3d-evil', 302, ''),
                ('/multiplayer-3d', 200, 'fixture:index.html'),
                ('/multiplayer-3d/room', 200, 'fixture:index.html'),
                ('/api', 404, ''), ('/api/npcs', 404, ''),
                ('/card-images', 404, ''), ('/card-images/1.png', 404, ''),
                ('/healthz', 200, 'ok'), ('/assets/app.js', 200, 'fixture:asset'),
                ('/assets/missing.js', 404, ''), ('/favicon.ico', 200, 'fixture:favicon.ico'),
                ('/robots.txt', 200, 'fixture:robots.txt'), ('/LICENSE', 200, 'fixture:LICENSE'),
                ('/missing.ico', 302, ''), ('/folder', 302, ''), ('/.env', 302, ''),
                ('/nested/robots.txt', 302, ''), ('/mp-api', 302, ''),
                ('/api%2Fnpcs', 404, ''), ('/card-images%2F1.png', 404, ''),
                ('/multiplayer-3d/../api/npcs', 404, ''),
                ('/mp-api/snapshot', 401, 'synthetic-unauthenticated'),
            ]
            for path, expected, body_marker in cases:
                status, headers, body = request(path)
                record = {'path': path, 'expected': expected, 'actual': status, 'passed': False}
                results.append(record)
                assert status == expected, record
                if expected == 302:
                    assert headers.get('Location') == '/multiplayer-3d', (path, dict(headers))
                    assert headers.get('Cache-Control') == 'no-store', path
                if body_marker:
                    assert body == body_marker, (path, body)
                record['passed'] = True
            origin = 'https://unknown-origin.invalid'
            status, _, body = request('/mp-api/echo-origin', {'Origin': origin})
            assert status == 200 and body == origin, 'Proxy must forward Origin unchanged to backend'
            results.append({'path': '/mp-api/echo-origin', 'passed': True,
                            'meaning': 'Header forwarding only; NOT real backend 403/auth verification'})
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
        'activationRequired': 'Version bind-mounted Caddyfile; validate and reload/recreate web on authorized target'
    }, indent=2) + '\n')
    print(f'PASS: {len(results)} isolated Caddy checks. No real application auth or production tests.')


if __name__ == '__main__':
    main()
