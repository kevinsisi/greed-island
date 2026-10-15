"""Source deployment contracts; Docker checks use isolated configuration only.

These checks do not execute PowerShell, deploy a stack or prove rollback.
PowerShell AST parsing is a separate hosted Windows workflow job.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]


class SourceDeploymentContracts(unittest.TestCase):
    def setUp(self):
        self.script = (ROOT / 'scripts/deploy-l390.ps1').read_text()

    def test_multiplayer_healthcheck_start_period_is_at_least_ten_minutes(self):
        compose = (ROOT / 'deploy/l390/docker-compose.yml').read_text()
        multiplayer = compose.split('  multiplayer:\n', 1)[1].split('\n  web:\n', 1)[0]
        healthcheck = multiplayer.split('    healthcheck:\n', 1)[1].split('\n    networks:\n', 1)[0]
        self.assertIn('800k-event cold boot', healthcheck)
        self.assertIn('deferred hydration', healthcheck)
        match = re.search(r'(?m)^\s+start_period:\s*(\d+)\s*([smh]?)\s*$', healthcheck)
        self.assertIsNotNone(match, 'multiplayer healthcheck must declare start_period')
        amount, unit = int(match.group(1)), match.group(2)
        seconds = amount * {'': 1, 's': 1, 'm': 60, 'h': 3600}[unit]
        self.assertGreaterEqual(seconds, 1800)

    def test_startup_and_rollback_health_waits_are_at_least_fifteen_minutes(self):
        match = re.search(r'(?m)^\$StartupWaitSeconds\s*=\s*(\d+)\s*$', self.script)
        self.assertIsNotNone(match, '$StartupWaitSeconds must be the centralized named wait bound')
        self.assertGreaterEqual(int(match.group(1)), 2400)

        self.assertRegex(
            self.script,
            r'(?m)^function Await-Health\(\[bool\]\$Unified,\s*\[int\]\$Seconds=\$StartupWaitSeconds\)',
        )
        self.assertIn('Await-Health $true', self.script)
        self.assertIn("Compose-Arguments $stagedCompose @('--env-file',$envFile,'up','-d','--no-build','--pull','never')) $StartupWaitSeconds)", self.script)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'up','-d','--no-build','--pull','never')) $StartupWaitSeconds)", self.script)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'-f',$rollbackImageOverride,'up','-d','--no-build','--pull','never')) $StartupWaitSeconds)", self.script)
        self.assertIn('Await-Health (-not $isLegacyRoom) $StartupWaitSeconds', self.script)
        self.assertIn('$process.WaitForExit($TimeoutSeconds * 1000)', self.script)

    def test_backup_retention_only_runs_after_success_and_is_contained(self):
        self.assertRegex(self.script, r'(?m)^\$BackupRetentionCount\s*=\s*2\s*$')
        success_path = self.script.split("Write-Json @{ sha=$ExpectedSha; version=$health.version; release=$release; backup=$backup; status='verified'; verifiedAt=", 1)[1].split('Write-Host "Verified exact L390 SHA', 1)[0]
        self.assertIn('Get-ChildItem -LiteralPath $backupRoot -Directory', success_path)
        self.assertIn("$_.Name -cmatch '^\\d{8}T\\d{6}Z-'", success_path)
        self.assertIn('Sort-Object -Property Name -Descending', success_path)
        self.assertIn('Select-Object -Skip $BackupRetentionCount', success_path)
        self.assertIn('Remove-Item -LiteralPath $resolvedOldBackup -Recurse -Force -ErrorAction Stop', success_path)
        self.assertIn('StartsWith($resolvedBackupRoot, [StringComparison]::OrdinalIgnoreCase)', success_path)
        self.assertIn('Write-Warning "Backup retention cleanup failed; deployment remains successful.', success_path)
        self.assertIn("Invoke-Docker @('image','rm',$tag)", success_path)
        self.assertIn("$backendRepositoryName -cne 'greed-island-l390-multiplayer'", success_path)
        self.assertIn("$webRepositoryName -cne 'greed-island-l390-web'", success_path)
        self.assertIn('oldBackup.Name.EndsWith', success_path)
        self.assertIn('rollback-$($oldBackup.Name)', success_path)
        self.assertIn('rollbackBackendTag -cne $expiredBackendTag', success_path)
        self.assertIn('rollbackWebTag -cne $expiredWebTag', success_path)
        rollback_path = self.script.split('\n} catch {\n  $failure = $_', 1)[1]
        self.assertNotIn('BackupRetentionCount', rollback_path)

    def test_multiplayer_replay_has_four_gigabyte_v8_heap(self):
        compose = (ROOT / 'deploy/l390/docker-compose.yml').read_text()
        multiplayer = compose.split('  multiplayer:\n', 1)[1].split('\n  web:\n', 1)[0]
        self.assertIn("# startup-replay-heap: event-log replay can exceed V8's default 2GB heap.", multiplayer)
        self.assertRegex(multiplayer, r'(?m)^\s+NODE_OPTIONS:\s*--max-old-space-size=4096\s*$')

    def test_database_inspection_docker_runs_have_heap_and_timeout(self):
        self.assertRegex(self.script, r"(?m)^\$ProbeNodeOptions\s*=\s*'--max-old-space-size=4096'\s*$")
        self.assertRegex(self.script, r'(?m)^\$DatabaseInspectionTimeoutSeconds\s*=\s*900\s*$')
        self.assertIn('Database inspection replays 1.2M+ events and can take 200+ seconds.', self.script)
        inspection_runs = [
            line for line in self.script.splitlines()
            if "'run'" in line
            and ('$backendImage' in line or '$backend.Image' in line)
            and ('$probe' in line or 'inspectUnifiedDatabase' in line)
        ]
        self.assertEqual(len(inspection_runs), 2, 'both candidate and rollback DB inspection runs must be covered')
        for command in inspection_runs:
            self.assertIn("'--env',\"NODE_OPTIONS=$ProbeNodeOptions\"", command)
            self.assertIn('$DatabaseInspectionTimeoutSeconds)', command)
            self.assertNotIn("'NODE_OPTIONS=' +", command)

    def test_slow_external_disk_timeouts_and_per_call_timing(self):
        self.assertRegex(self.script, r'(?m)^function Invoke-Docker\(\[string\[\]\]\$Arguments, \[int\]\$TimeoutSeconds = 600\)')
        load_timeout = re.search(r"(?m)^\[void\]\(Invoke-Docker @\('load','-i',\$archive\) (\d+)\)$", self.script)
        self.assertIsNotNone(load_timeout, 'docker load must have an explicit timeout')
        self.assertGreaterEqual(int(load_timeout.group(1)), 1800)
        for line in self.script.splitlines():
            if any(f"@('{verb}'" in line for verb in ('run', 'start', 'create', 'cp')):
                self.assertNotRegex(line, r'\)\s*(?:30|120)\)?(?:\s|;|$)')
        self.assertIn('$timer = [Diagnostics.Stopwatch]::StartNew()', self.script)
        self.assertIn('Write-Host "[docker $commandLabel] ${elapsedSeconds}s"', self.script)
        self.assertIn("if ($commandLabel -ceq 'compose')", self.script)
        self.assertIn('$commandLabel = "compose $argument"', self.script)

    def test_rollback_uses_unique_tags_and_never_saves_image_archives(self):
        self.assertNotIn("'save'", self.script)
        self.assertNotIn('prior-images.tar', self.script)
        self.assertIn("$rollbackBackendTag = \"${rollbackBackendRepository}:rollback-$stamp\"", self.script)
        self.assertIn("$rollbackWebTag = \"${rollbackWebRepository}:rollback-$stamp\"", self.script)
        self.assertIn("Invoke-Docker @('tag',$backend.Image,$rollbackBackendTag) 600", self.script)
        self.assertIn("Invoke-Docker @('tag',$web.Image,$rollbackWebTag) 600", self.script)
        self.assertIn("Invoke-Docker @('image','inspect',$rollbackBackendTag)", self.script)
        self.assertIn("Invoke-Docker @('image','inspect',$rollbackWebTag)", self.script)
        self.assertIn('$taggedBackendId -cne $backend.Image -or $taggedWebId -cne $web.Image', self.script)
        self.assertIn("$rollbackModel.services.multiplayer.image -cne $rollbackBackendTag", self.script)
        self.assertIn("$rollbackModel.services.web.image -cne $rollbackWebTag", self.script)
        self.assertIn('rollbackBackendTag=$rollbackBackendTag', self.script)
        self.assertIn('rollbackWebTag=$rollbackWebTag', self.script)
        self.assertNotIn("Invoke-Docker @('image','prune'", self.script)
        self.assertNotIn("Invoke-Docker @('system','prune'", self.script)

    def test_active_rollback_tags_use_image_metadata_and_invalid_tags_fail_closed(self):
        self.assertRegex(self.script, r"(?m)^\$rollbackTagPattern\s*=\s*'\^rollback-\\d\{8\}T\\d\{6\}Z-\[a-f0-9\]\{12\}-\[a-f0-9\]\{32\}\$'\s*$")
        self.assertIn("$previousBackendTag -cmatch '^[a-f0-9]{40}$'", self.script)
        self.assertIn('$previousBackendTag -cmatch $rollbackTagPattern', self.script)
        self.assertIn('$previousBackendTag -ceq $previousWebTag', self.script)
        self.assertIn('$backendBuildSha = Get-ImageBuildSha $backend', self.script)
        self.assertIn('$webBuildSha = Get-ImageBuildSha $web', self.script)
        self.assertIn("if ($labelSha -cmatch '^[a-f0-9]{40}$') { return $labelSha }", self.script)
        self.assertIn("if ($containerSha) { return $containerSha }", self.script)
        self.assertIn("throw 'Unified rollback requires exact-SHA tags or matching rollback-<timestamp>-<sha12>-<id> tags.'", self.script)
        self.assertIn('Cannot determine the build SHA from the running container environment or image revision label.', self.script)

    def test_rollback_uses_active_compose_and_env_with_image_only_override(self):
        self.assertIn('$activeComposeText = Get-Content -Raw -LiteralPath $activeConfig', self.script)
        self.assertIn('$rollbackUsesImageTagVariable', self.script)
        self.assertIn("$env:GREED_L390_IMAGE_TAG = $rollbackImageTag", self.script)
        self.assertIn("$rollbackImageOverride = Join-Path $backup 'rollback-images.override.yml'", self.script)
        self.assertIn('"    image: $rollbackBackendTag"', self.script)
        self.assertIn('"    image: $rollbackWebTag"', self.script)
        self.assertNotIn('Write-Json $activeResolved', self.script)
        self.assertNotIn('$rollbackConfig', self.script)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'-f',$rollbackImageOverride,'up'", self.script)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'up'", self.script)

    def test_stop_attempt_is_marked_before_native_stop(self):
        marker = self.script.index('$stopped = $true')
        stop = self.script.index("'stop','--timeout','30','multiplayer','web'", marker)
        self.assertLess(marker, stop)
        self.assertIn('if ($stopped)', self.script)

    def test_active_env_is_required_before_stop(self):
        env_gate = self.script.index('Test-Path -LiteralPath $activeEnvFile -PathType Leaf')
        self.assertLess(env_gate, self.script.index('$stopped = $true'))

    def test_unified_upgrade_uses_compose_environment_file_without_working_dir_env(self):
        before_stop = self.script.split('$stopped = $true', 1)[0]
        label = "$activeEnvLabel = [string]$backend.Config.Labels.'com.docker.compose.project.environment_file'"
        legacy_detection = "$isLegacyRoom = @($backend.Config.Cmd) -contains 'dist/multiplayer/server.js'"
        legacy_fallback = "if ($isLegacyRoom) { $activeEnvFile = Join-Path $activeDirectory '.env' }"
        unified_fallback = 'else { $activeEnvFile = $envFile }'
        active_gate = 'Test-Path -LiteralPath $activeEnvFile -PathType Leaf'
        self.assertIn(legacy_detection, before_stop)
        self.assertIn(label, before_stop)
        self.assertIn(legacy_fallback, before_stop)
        self.assertIn(unified_fallback, before_stop)
        self.assertLess(before_stop.index(label), before_stop.index(active_gate))
        self.assertLess(before_stop.index(active_gate), before_stop.index("$activeResolved = Invoke-Docker"))
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'config','--format','json')", before_stop)
        self.assertIn('$env:GREED_L390_SOURCE_PATH = $SourcePath', before_stop)
        self.assertLess(before_stop.index('$env:GREED_L390_SOURCE_PATH = $SourcePath'), before_stop.index("$activeResolved = Invoke-Docker"))
        self.assertIn('$activeResolved.services.multiplayer.image -cne $backend.Config.Image', before_stop)
        self.assertIn('$activeResolved.services.web.image -cne $web.Config.Image', before_stop)
        self.assertIn('$activeResolved.services.multiplayer.environment.GREED_ISLAND_BUILD_SHA -cne $previousBuildSha', before_stop)
        self.assertIn("$env:GREED_L390_IMAGE_TAG = $previousImageTag", before_stop)
        self.assertIn("$env:GREED_L390_BUILD_SHA = $previousBuildSha", before_stop)
        self.assertIn("$activeEnvFile = (Resolve-Path -LiteralPath $activeEnvFile).Path", before_stop)
        new_config = before_stop.index('$newResolved = Invoke-Docker')
        active_values_restored = before_stop.index('$env:GREED_L390_IMAGE_TAG = $previousImageTag', new_config)
        self.assertLess(new_config, active_values_restored)
        self.assertIn("@('--env-file',$activeEnvFile,'stop','--timeout','30','multiplayer','web')", self.script)
        self.assertIn("Copy-Item -LiteralPath $envFile -Destination (Join-Path $backup 'source.env')", self.script)
        self.assertNotIn("if (-not (Test-Path -LiteralPath (Join-Path $activeDirectory '.env')", before_stop)
        rollout_start = self.script.index("Compose-Arguments $stagedCompose @('--env-file',$envFile,'up','-d','--no-build','--pull','never')")
        candidate_tag = self.script.rindex('$env:GREED_L390_IMAGE_TAG = $ExpectedSha', 0, rollout_start)
        self.assertLess(self.script.index('$stopped = $true'), candidate_tag)
        self.assertLess(candidate_tag, rollout_start)
        self.assertIn("$rollbackBackendTag = \"${rollbackBackendRepository}:rollback-$stamp\"", before_stop)
        self.assertIn("$rollbackWebTag = \"${rollbackWebRepository}:rollback-$stamp\"", before_stop)

    def test_unified_rollback_reuses_the_preserved_prior_release_compose_and_env(self):
        rollback = self.script.split("if ($stopped) {", 1)[1]
        self.assertIn("$activeEnvLabel = [string]$backend.Config.Labels.'com.docker.compose.project.environment_file'", self.script)
        self.assertIn("$env:GREED_L390_IMAGE_TAG = $rollbackImageTag", rollback)
        self.assertIn("$env:GREED_L390_BUILD_SHA = $previousBuildSha", rollback)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'up','-d','--no-build','--pull','never')", rollback)
        self.assertIn("$env:GREED_L390_IMAGE_TAG = $rollbackImageTag", rollback)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'-f',$rollbackImageOverride,'up','-d','--no-build','--pull','never')", rollback)
        self.assertNotIn('Write-Json $activeResolved', self.script)
        self.assertIn('$rollbackImageOverride', self.script)

        before_stop = self.script.split('$stopped = $true', 1)[0]
        self.assertIn('$activeCaddySource = [string]$caddyMount[0].source', before_stop)
        self.assertIn('type=bind,src=$activeCaddySource,dst=/etc/caddy/Caddyfile,readonly', before_stop)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'config','--format','json')", before_stop)
        self.assertIn("$stagingDirectory = Join-Path $stagingRoot ($ExpectedSha.Substring(0,12) + '-' + $deploymentId)", before_stop)
        self.assertNotIn('Remove-Item -LiteralPath $stagingDirectory', self.script)

    def test_each_deploy_attempt_uses_a_distinct_release_directory_even_for_same_sha(self):
        self.assertIn("$deploymentId = [Guid]::NewGuid().ToString('N')", self.script)
        self.assertIn("$stagingDirectory = Join-Path $stagingRoot ($ExpectedSha.Substring(0,12) + '-' + $deploymentId)", self.script)
        self.assertIn("$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $ExpectedSha.Substring(0,12) + '-' + $deploymentId", self.script)
        self.assertNotIn("$stagingDirectory = Join-Path $stagingRoot $ExpectedSha.Substring(0,12)", self.script)
        before_stop = self.script.split('$stopped = $true', 1)[0]
        self.assertIn('if (-not $isLegacyRoom -and $previousBackendTag -ceq $ExpectedSha)', before_stop)
        self.assertIn('$loadedBackendId -cne $backend.Image -or $loadedWebId -cne $web.Image', before_stop)
        self.assertIn("Invoke-Docker @('tag',$backend.Image,$backend.Config.Image)", before_stop)
        self.assertIn("Invoke-Docker @('tag',$web.Image,$web.Config.Image)", before_stop)
        self.assertIn('Refusing to stop the active stack.', before_stop)

    def test_readonly_volume_and_database_checks_precede_stop(self):
        for marker in ["'volume','inspect',$canonicalVolume", 'inspectUnifiedDatabase(c.databasePath)', "'--network','none'"]:
            self.assertLess(self.script.index(marker), self.script.index('$stopped = $true'))

    def test_rollback_uses_original_compose_and_verifies_prior_image_ids(self):
        self.assertIn("$rollbackModel.services.multiplayer.image -cne $rollbackBackendTag", self.script)
        self.assertIn("$rollbackModel.services.web.image -cne $rollbackWebTag", self.script)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'up','-d','--no-build','--pull','never')", self.script)
        self.assertIn("Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'-f',$rollbackImageOverride,'up','-d','--no-build','--pull','never')", self.script)
        self.assertIn('if (-not $rollbackCompatible)', self.script)
        self.assertIn("(Get-Container 'multiplayer').Image -cne $backend.Image", self.script)
        self.assertIn("(Get-Container 'web').Image -cne $web.Image", self.script)
        self.assertIn('Await-Health (-not $isLegacyRoom) $StartupWaitSeconds', self.script)
        self.assertNotIn('tar -x', self.script)

    def test_local_quiesced_backup_captures_complete_volumes(self):
        self.assertIn('tar -czf /tmp/volume-$index.tgz -C /data .', self.script)
        self.assertIn('gzip -t /tmp/volume-$index.tgz', self.script)
        self.assertIn('"type=volume,src=$name,dst=/data,readonly"', self.script)
        self.assertIn("'cp',\"${container}:/tmp/volume-$index.tgz\",$archivePath", self.script)
        self.assertLess(self.script.index('$stopped = $true'), self.script.index('tar -czf'))
        self.assertIn('LocalApplicationData', self.script)
        self.assertNotIn('Set-Acl', self.script)
        self.assertNotIn('type=bind,src=$backup', self.script)

    def test_release_and_rollback_caddy_mount_only_use_deploypath_staging(self):
        compose = (ROOT / 'deploy/l390/docker-compose.yml').read_text()
        self.assertIn('./Caddyfile.l390:/etc/caddy/Caddyfile:ro', compose)
        self.assertIn('${GREED_L390_SOURCE_PATH:?Source checkout path is required}', compose)
        self.assertIn("$stagingRoot = Join-Path $DeployPath 'release'", self.script)
        self.assertIn("$stagingDirectory = Join-Path $stagingRoot ($ExpectedSha.Substring(0,12) + '-' + $deploymentId)", self.script)
        self.assertIn("$stagedCompose = Join-Path $stagingDirectory 'docker-compose.yml'", self.script)
        self.assertIn("Copy-Item -LiteralPath $sourceConfig -Destination $stagedCompose -Force", self.script)
        self.assertIn('$env:GREED_L390_SOURCE_PATH = $SourcePath', self.script)
        self.assertIn('Compose-Arguments $stagedCompose', self.script)
        self.assertIn("Copy-Item -LiteralPath $caddyMount[0].source -Destination $rollbackCaddyfile -Force", self.script)
        self.assertNotIn('$rollbackStagedCaddyfile', self.script)
        self.assertNotIn("type=bind,src=$(Join-Path $SourcePath", self.script)
        self.assertNotIn('$releaseEnv', self.script)
        self.assertNotIn('$environmentText', self.script)

    def test_daemon_host_path_preflights_finish_before_any_old_container_stops(self):
        stop = self.script.index('$stopped = $true')
        for marker in (
            "$caddyVersion = Invoke-Docker @('run','--rm','--network','none','--mount',\"type=bind,src=$stagedCaddyfile",
            "$caddyContainer = Invoke-Docker @('create'",
            "$copyProbeContainer = Invoke-Docker @('create'",
            "Invoke-Docker @('cp',\"${copyProbeContainer}:/tmp/l390-docker-cp-preflight.txt\",$copyProbe)",
            '$activeCaddyVersion = Invoke-Docker',
            'Copy-Item -LiteralPath $caddyMount[0].source -Destination $rollbackCaddyfile -Force',
        ):
            self.assertLess(self.script.index(marker), stop, marker)
        self.assertIn("finally {", self.script)
        self.assertIn("'rm','-f',$copyProbeContainer", self.script)
        self.assertIn('if ((Get-Content -Raw -LiteralPath $copyProbe) -cne', self.script)

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

    def test_deploy_job_timeout_allows_large_event_log_rollout(self):
        workflow = (ROOT / '.github/workflows/deploy-l390.yml').read_text()
        deploy_job = workflow.split('  deploy:\n', 1)[1]
        self.assertIn('name: Deploy and test only NB-L390', deploy_job)
        match = re.search(r'(?m)^    timeout-minutes:\s*(\d+)\s*$', deploy_job)
        self.assertIsNotNone(match, 'Deploy job must declare its timeout')
        self.assertGreaterEqual(int(match.group(1)), 60)

    def test_process_scope_execution_policy_bypass_is_only_on_self_hosted_deploy(self):
        current = (ROOT / '.github/workflows/deploy-l390.yml').read_text()
        before_deploy, deploy = current.split('  deploy:\n', 1)
        _, syntax = before_deploy.split('  syntax:\n', 1)
        expected = 'shell: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ". \'{0}\'"'
        self.assertIn('runs-on: [self-hosted, Windows, X64, greed-island-l390]', deploy)
        shell_lines = [line.strip() for line in deploy.splitlines() if line.strip().startswith('shell:')]
        self.assertEqual(shell_lines, [expected, expected, expected])
        self.assertEqual(current.count('-ExecutionPolicy Bypass'), 3)
        self.assertNotIn('-ExecutionPolicy', before_deploy)
        self.assertNotIn('Set-ExecutionPolicy', current)
        self.assertNotIn('-Scope', current)
        self.assertIn('shell: powershell\n', syntax)
        self.assertNotIn('ExecutionPolicy Bypass', syntax)

        deploy_script = (ROOT / 'scripts/deploy-l390.ps1').read_text()
        self.assertIn("$ErrorActionPreference = 'Stop'", deploy_script)
        self.assertIn('if ($code -ne 0) { throw', deploy_script)

    def test_l390_package_artifact_explicitly_uploads_archive_and_manifest(self):
        current = (ROOT / '.github/workflows/deploy-l390.yml').read_text()
        package, _ = current.split('  syntax:\n', 1)
        archive_upload = package.split('      - name: Store exact-SHA code image archive\n', 1)[1]
        archive_upload = archive_upload.split('\n      - name: Store exact-SHA image manifest\n', 1)[0]
        self.assertIn('uses: actions/upload-artifact@v4', archive_upload)
        self.assertIn('name: l390-package-${{ steps.current.outputs.sha }}', archive_upload)
        self.assertIn('path: artifacts/l390-package/images.tar', archive_upload)
        self.assertIn('if-no-files-found: error', archive_upload)

        manifest_upload = package.split('      - name: Store exact-SHA image manifest\n', 1)[1]
        self.assertIn('name: l390-manifest-${{ steps.current.outputs.sha }}', manifest_upload)
        self.assertIn('path: artifacts/l390-package/manifest.json', manifest_upload)
        self.assertIn('if-no-files-found: error', manifest_upload)

        deploy = current.split('  deploy:\n', 1)[1]
        run_scoped_path = 'l390-package-${{ github.run_id }}'
        archive_download = deploy.split('name: l390-package-${{ needs.package.outputs.sha }}', 1)[1]
        archive_download = archive_download.split('      - uses: actions/download-artifact@v4', 1)[0]
        manifest_download = deploy.split('name: l390-manifest-${{ needs.package.outputs.sha }}', 1)[1]
        manifest_download = manifest_download.split('      - name: Diagnose downloaded package files before deployment', 1)[0]
        self.assertIn(f'path: {run_scoped_path}', archive_download)
        self.assertIn(f'path: {run_scoped_path}', manifest_download)
        diagnostic = deploy.split('      - name: Diagnose downloaded package files before deployment\n', 1)[1]
        diagnostic = diagnostic.split('      - name: Quiesced local backup', 1)[0]
        self.assertIn('shell: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass', diagnostic)
        self.assertIn('Get-ChildItem -Force -Recurse', diagnostic)
        self.assertIn('Select-Object FullName,Length', diagnostic)
        self.assertIn("Join-Path $packagePath 'manifest.json'", diagnostic)
        self.assertIn('Directory contents are listed above', diagnostic)

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
        env['GREED_L390_SOURCE_PATH'] = str(ROOT)
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
