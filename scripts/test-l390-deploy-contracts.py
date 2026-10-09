"""Source deployment contracts; Docker checks use isolated configuration only.

These checks do not execute PowerShell, deploy a stack or prove rollback.
PowerShell AST parsing is a separate hosted Windows workflow job.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]


class SourceDeploymentContracts(unittest.TestCase):
    def setUp(self):
        self.script = (ROOT / 'scripts/deploy-l390.ps1').read_text()

    def test_stop_attempt_is_marked_before_native_stop(self):
        marker = self.script.index('$stopped = $true')
        stop = self.script.index("'stop','--timeout','30','multiplayer','web'", marker)
        self.assertLess(marker, stop)
        self.assertIn('if ($stopped)', self.script)

    def test_active_env_is_required_before_stop(self):
        env_gate = self.script.index('Test-Path -LiteralPath $activeEnvFile -PathType Leaf')
        self.assertLess(env_gate, self.script.index('$stopped = $true'))

    def test_readonly_volume_and_database_checks_precede_stop(self):
        for marker in ["'volume','inspect',$canonicalVolume", 'inspectUnifiedDatabase(c.databasePath)', "'--network','none'"]:
            self.assertLess(self.script.index(marker), self.script.index('$stopped = $true'))

    def test_rollback_uses_captured_resolved_configuration_and_prior_ids(self):
        self.assertIn('$activeResolved.services.multiplayer.image = $backend.Image', self.script)
        self.assertIn('$activeResolved.services.web.image = $web.Image', self.script)
        self.assertIn("Write-Json $activeResolved $rollbackConfig", self.script)
        self.assertIn("Compose-Arguments $rollbackConfig @('up','-d','--no-build','--pull','never')", self.script)
        self.assertIn('if (-not $rollbackCompatible)', self.script)
        self.assertIn('Await-Health (-not $isLegacyRoom) 120', self.script)
        self.assertNotIn('tar -x', self.script)

    def test_local_quiesced_backup_captures_complete_volumes(self):
        self.assertIn('tar -czf /backup/volume-$index.tgz -C /data .', self.script)
        self.assertIn('gzip -t /backup/volume-$index.tgz', self.script)
        self.assertLess(self.script.index('$stopped = $true'), self.script.index('tar -czf'))
        self.assertIn('LocalApplicationData', self.script)
        self.assertNotIn('Set-Acl', self.script)

    def test_trigger_and_target_contracts(self):
        legacy = (ROOT / '.github/workflows/deploy-dev.yml').read_text()
        trigger = legacy.split('on:\n', 1)[1].split('\nconcurrency:', 1)[0]
        self.assertIn('workflow_dispatch:', trigger)
        self.assertNotIn('workflow_run:', trigger)
        current = (ROOT / '.github/workflows/deploy-l390.yml').read_text()
        self.assertIn("github.event.workflow_run.event == 'push'", current)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", current)
        self.assertIn('github.event.workflow_run.head_repository.full_name == github.repository', current)
        self.assertIn('runs-on: [self-hosted, Windows, X64, greed-island-l390]', current)
        self.assertIn('vars.L390_DEPLOY_PATH', current)
        self.assertNotIn('vars.DEPLOY_PATH', current)
        self.assertNotIn('DOCKERHUB', current)
        deploy = current.split('  deploy:\n', 1)[1]
        self.assertNotIn('uses: actions/upload-artifact', deploy)

    def test_native_image_smoke_is_temporary_and_not_production(self):
        smoke = (ROOT / 'scripts/test-l390-image.mjs').read_text()
        self.assertIn('mkdtempSync', smoke)
        self.assertIn('migrateIdentitySchema(db)', smoke)
        self.assertIn('rmSync(directory', smoke)
        self.assertIn('productionData: false', smoke)
        self.assertIn('assert.equal(owner.principal.role, \'player\')', smoke)


class DockerVolumeContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('docker'):
            raise unittest.SkipTest('Docker unavailable; actual Compose contracts not run locally')
        result = subprocess.run(['docker', 'info', '--format', '{{.OSType}}'], text=True, capture_output=True, timeout=20)
        if result.returncode:
            raise unittest.SkipTest('Docker daemon unavailable')

    def compose(self, volume):
        env = dict(os.environ)
        env['GREED_ISLAND_ALLOWED_ORIGINS'] = 'https://synthetic.example.test'
        env['GREED_L390_IMAGE_TAG'] = 'contract-test'
        if volume is None:
            env.pop('GREED_L390_CANONICAL_VOLUME', None)
        else:
            env['GREED_L390_CANONICAL_VOLUME'] = volume
        return subprocess.run(['docker', 'compose', '-p', 'greed-source-contract',
                               '-f', str(ROOT / 'deploy/l390/docker-compose.yml'),
                               'config', '--format', 'json'], env=env, text=True,
                              capture_output=True, timeout=30)

    def test_blank_and_missing_volume_are_rejected(self):
        self.assertNotEqual(self.compose('').returncode, 0)
        self.assertNotEqual(self.compose(None).returncode, 0)

    def test_explicit_volume_is_external_and_exactly_named(self):
        name = 'greed-contract-' + uuid.uuid4().hex
        result = self.compose(name)
        self.assertEqual(result.returncode, 0, 'Compose config must parse with explicit synthetic selection')
        volume = json.loads(result.stdout)['volumes']['canonical-data']
        self.assertIs(volume['external'], True)
        self.assertEqual(volume['name'], name)
        # This same inspect operation is a pre-stop gate in the deployer.
        inspected = subprocess.run(['docker', 'volume', 'inspect', name], capture_output=True, timeout=20)
        self.assertNotEqual(inspected.returncode, 0)
        # No create/up/pull or production-volume operations occur in these tests.


if __name__ == '__main__':
    unittest.main(verbosity=2)
