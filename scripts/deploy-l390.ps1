# Deploy exact CI images on the dedicated NB-L390 runner.
# No live import, credential creation, public binding or backup upload.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$DeployPath,
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][string]$PackagePath,
  [Parameter(Mandatory=$true)][string]$ExpectedSha
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = 'greed-island-l390'
if ($ExpectedSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Exact successful current-main SHA is required.' }
foreach ($path in @($DeployPath, $SourcePath, $PackagePath)) {
  if (-not [IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Container)) { throw 'Every deployment path must already exist and be absolute.' }
}
$DeployPath = (Resolve-Path -LiteralPath $DeployPath).Path
$SourcePath = (Resolve-Path -LiteralPath $SourcePath).Path
$PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path

# Inherit the runner user's private AppData ACL; verify it without changing ACLs.
$backupRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GreedIslandL390\Backups'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$trustedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544', 'S-1-3-0')
foreach ($rule in (Get-Acl -LiteralPath $backupRoot).Access) {
  if ($rule.AccessControlType -eq 'Allow') {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($trustedSids -notcontains $sid) { throw 'Backup directory ACL needs an owner review before secret-bearing local snapshots are allowed. No ACL is changed here.' }
  }
}
$deploymentId = [Guid]::NewGuid().ToString('N')
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $ExpectedSha.Substring(0,12) + '-' + $deploymentId
$backup = Join-Path $backupRoot $stamp
New-Item -ItemType Directory -Path $backup | Out-Null
$diagnostic = Join-Path $backup 'docker-diagnostics.log'
$stagingRoot = Join-Path $DeployPath 'release'
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
$stagingDirectory = Join-Path $stagingRoot ($ExpectedSha.Substring(0,12) + '-' + $deploymentId)
New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
$stagedCaddyfile = Join-Path $stagingDirectory 'Caddyfile.l390'
Copy-Item -LiteralPath (Join-Path $SourcePath 'deploy\l390\Caddyfile.l390') -Destination $stagedCaddyfile -Force
$sourceConfig = Join-Path $SourcePath 'deploy\l390\docker-compose.yml'
$stagedCompose = Join-Path $stagingDirectory 'docker-compose.yml'
Copy-Item -LiteralPath $sourceConfig -Destination $stagedCompose -Force

# Correct Windows argv quoting and bounded native processes. Capture diagnostics
# locally only; never print a resolved Compose environment or account data.
function Quote-Argument([string]$Value) {
  $builder = New-Object Text.StringBuilder
  [void]$builder.Append('"'); $slashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') { $slashes++; continue }
    if ($character -eq '"') { [void]$builder.Append(('\' * ($slashes * 2 + 1))); [void]$builder.Append('"') }
    else { [void]$builder.Append(('\' * $slashes)); [void]$builder.Append($character) }
    $slashes = 0
  }
  [void]$builder.Append(('\' * ($slashes * 2))); [void]$builder.Append('"')
  return $builder.ToString()
}
function Invoke-Docker([string[]]$Arguments, [int]$TimeoutSeconds = 180) {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = 'docker.exe'
  $start.Arguments = (($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $start
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $process.Kill(); $process.WaitForExit()
    throw "Docker $($Arguments[0]) timed out; old data is never restored automatically."
  }
  $output = $stdout.Result; $errorText = $stderr.Result; $code = $process.ExitCode
  $process.Dispose()
  if ($errorText) { Add-Content -LiteralPath $diagnostic -Value ("operation: " + $Arguments[0] + [Environment]::NewLine + $errorText) }
  if ($code -ne 0) { throw "Docker $($Arguments[0]) failed ($code). Diagnostics stay only in the private local backup directory." }
  return $output.Trim()
}
function Write-Json($Value, [string]$Path) {
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 100), ([Text.UTF8Encoding]::new($false)))
}
function Get-Container([string]$Service) {
  $ids = @( (Invoke-Docker @('ps','-q','--filter',"label=com.docker.compose.project=$project",'--filter',"label=com.docker.compose.service=$Service")) -split "\r?\n" | Where-Object { $_ } )
  if ($ids.Count -ne 1) { throw "Expected exactly one existing L390 $Service container." }
  return (Invoke-Docker @('inspect',$ids[0]) | ConvertFrom-Json)[0]
}
function Compose-Arguments([string]$Config, [string[]]$Tail) {
  return @('compose','-p',$project,'-f',$Config) + $Tail
}

$manifest = Get-Content -Raw -LiteralPath (Join-Path $PackagePath 'manifest.json') | ConvertFrom-Json
$archive = Join-Path $PackagePath 'images.tar'
$backendImage = "greed-island-l390-multiplayer:$ExpectedSha"
$webImage = "greed-island-l390-web:$ExpectedSha"
if ($manifest.schemaVersion -ne 1 -or $manifest.sha -cne $ExpectedSha -or
    @($manifest.images).Count -ne 2 -or $manifest.images[0] -cne $backendImage -or $manifest.images[1] -cne $webImage -or
    (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.archiveSha256) { throw 'Package SHA/images/archive integrity mismatch.' }
if ((Invoke-Docker @('info','--format','{{.OSType}}')) -ne 'linux') { throw 'Authorized Linux Docker access is required; no elevation fallback.' }
[void](Invoke-Docker @('load','-i',$archive) 600)
foreach ($image in @($backendImage,$webImage)) {
  $metadata = (Invoke-Docker @('image','inspect',$image) | ConvertFrom-Json)[0]
  if ($metadata.Config.Labels.'org.opencontainers.image.revision' -cne $ExpectedSha) { throw 'Loaded image revision does not equal CI SHA.' }
}

# Probe the exact daemon-visible release path without reading the mounted file.
$caddyVersion = Invoke-Docker @('run','--rm','--network','none','--mount',"type=bind,src=$stagedCaddyfile,dst=/etc/caddy/Caddyfile,readonly",'--entrypoint','caddy',$webImage,'version') 120
Write-Host "Staged Caddyfile bind preflight: $caddyVersion"
$caddyContainer = $null; $caddyFailure = $null
try {
  $caddyContainer = Invoke-Docker @('create','--network','none','--entrypoint','caddy',$webImage,'validate','--config','/tmp/Caddyfile.l390','--adapter','caddyfile') 120
  [void](Invoke-Docker @('cp',$stagedCaddyfile,"${caddyContainer}:/tmp/Caddyfile.l390") 120)
  [void](Invoke-Docker @('start','-a',$caddyContainer) 120)
} catch {
  $caddyFailure = $_
  throw
} finally {
  if ($caddyContainer) {
    try { [void](Invoke-Docker @('rm','-f',$caddyContainer) 30) }
    catch { if (-not $caddyFailure) { throw } }
  }
}

# Verify docker cp can write back to the private backup directory before downtime.
$copyProbe = Join-Path $backup 'docker-cp-preflight.txt'
$copyProbeContainer = $null; $copyProbeFailure = $null
try {
  $copyProbeContainer = Invoke-Docker @('create','--network','none','--entrypoint','sh',$backendImage,'-c',"printf 'l390-docker-cp-preflight\n' > /tmp/l390-docker-cp-preflight.txt") 120
  [void](Invoke-Docker @('start','-a',$copyProbeContainer) 120)
  [void](Invoke-Docker @('cp',"${copyProbeContainer}:/tmp/l390-docker-cp-preflight.txt",$copyProbe) 120)
  if ((Get-Content -Raw -LiteralPath $copyProbe) -cne "l390-docker-cp-preflight`n") { throw 'Private backup docker cp preflight content mismatch.' }
} catch {
  $copyProbeFailure = $_
  throw
} finally {
  if ($copyProbeContainer) {
    try { [void](Invoke-Docker @('rm','-f',$copyProbeContainer) 30) }
    catch { if (-not $copyProbeFailure) { throw } }
  }
  Remove-Item -LiteralPath $copyProbe -Force -ErrorAction SilentlyContinue
}

$smokeContainer = $null; $smokeFailure = $null
try {
  $smokeContainer = Invoke-Docker @('create','--network','none','--entrypoint','node',$backendImage,'/app/l390-smoke.mjs') 120
  [void](Invoke-Docker @('cp',(Join-Path $SourcePath 'scripts\test-l390-image.mjs'),"${smokeContainer}:/app/l390-smoke.mjs") 120)
  [void](Invoke-Docker @('start','-a',$smokeContainer) 120)
} catch {
  $smokeFailure = $_
  throw
} finally {
  if ($smokeContainer) {
    try { [void](Invoke-Docker @('rm','-f',$smokeContainer) 30) }
    catch { if (-not $smokeFailure) { throw } }
  }
}
$backend = Get-Container 'multiplayer'; $web = Get-Container 'web'
if ($backend.State.Status -ne 'running' -or $web.State.Status -ne 'running') { throw 'Existing L390 stack must be running before a controlled cutover.' }
$activeConfigFiles = $backend.Config.Labels.'com.docker.compose.project.config_files'
if (-not $activeConfigFiles -or $activeConfigFiles.Contains(',')) { throw 'Current stack must have one verified Compose file; review multi-file deployments explicitly.' }
$activeConfig = [IO.Path]::GetFullPath($activeConfigFiles)
$activeDirectory = Split-Path -Parent $activeConfig
$isLegacyRoom = @($backend.Config.Cmd) -contains 'dist/multiplayer/server.js'
$envFile = Join-Path $DeployPath 'deploy\l390\.env'
if (-not (Test-Path -LiteralPath $activeConfig -PathType Leaf) -or -not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Existing active Compose configuration and dedicated L390 .env are required.' }

# The active Unified stack is staged under DeployPath and deliberately has no
# .env beside its Compose file. Prefer Compose's recorded env-file label; only
# legacy stacks fall back to the old working-directory .env.
$activeEnvFile = $null
$activeEnvLabel = [string]$backend.Config.Labels.'com.docker.compose.project.environment_file'
if (-not [string]::IsNullOrWhiteSpace($activeEnvLabel)) {
  $activeEnvFile = $activeEnvLabel.Trim()
  if (-not [IO.Path]::IsPathRooted($activeEnvFile)) { $activeEnvFile = Join-Path $activeDirectory $activeEnvFile }
}
if (-not $activeEnvFile -or -not (Test-Path -LiteralPath $activeEnvFile -PathType Leaf)) {
  if ($isLegacyRoom) { $activeEnvFile = Join-Path $activeDirectory '.env' }
  else { $activeEnvFile = $envFile }
}
if (-not [IO.Path]::IsPathRooted($activeEnvFile) -or -not (Test-Path -LiteralPath $activeEnvFile -PathType Leaf)) { throw 'The active stack environment file must exist before any stop.' }
$activeEnvFile = (Resolve-Path -LiteralPath $activeEnvFile).Path

# The active release Compose file requires this interpolation even for
# config/stop. Unified rollback also needs its previous exact image tag.
$env:GREED_L390_SOURCE_PATH = $SourcePath
$previousImageTag = $null
if (-not $isLegacyRoom) {
  $backendImageReference = [string]$backend.Config.Image
  $webImageReference = [string]$web.Config.Image
  $backendTagSeparator = $backendImageReference.LastIndexOf(':')
  $webTagSeparator = $webImageReference.LastIndexOf(':')
  if ($backendTagSeparator -lt 0 -or $webTagSeparator -lt 0) { throw 'Unified rollback requires tagged prior images.' }
  $previousBackendTag = $backendImageReference.Substring($backendTagSeparator + 1)
  $previousWebTag = $webImageReference.Substring($webTagSeparator + 1)
  if ($previousBackendTag -cnotmatch '^[a-f0-9]{40}$' -or $previousWebTag -cne $previousBackendTag) { throw 'Unified rollback requires matching exact-SHA prior image tags.' }
  $previousImageTag = $previousBackendTag
  $env:GREED_L390_IMAGE_TAG = $previousImageTag
  $env:GREED_L390_BUILD_SHA = $previousImageTag
  if ($previousImageTag -ceq $ExpectedSha) {
    $loadedBackendId = (Invoke-Docker @('image','inspect',$backendImage) | ConvertFrom-Json)[0].Id
    $loadedWebId = (Invoke-Docker @('image','inspect',$webImage) | ConvertFrom-Json)[0].Id
    if ($loadedBackendId -cne $backend.Image -or $loadedWebId -cne $web.Image) {
      try {
        [void](Invoke-Docker @('tag',$backend.Image,$backend.Config.Image) 30)
        [void](Invoke-Docker @('tag',$web.Image,$web.Config.Image) 30)
      } catch { throw 'Same-SHA package differs from the running image and prior tags could not be restored. No old container was stopped.' }
      throw 'Same-SHA package differs from the running image; prior image tags were restored. Refusing to stop the active stack.'
    }
  }
}
$activeResolved = Invoke-Docker (Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'config','--format','json')) | ConvertFrom-Json
if (-not $isLegacyRoom -and (
    $activeResolved.services.multiplayer.image -cne $backend.Config.Image -or
    $activeResolved.services.web.image -cne $web.Config.Image -or
    $activeResolved.services.multiplayer.environment.GREED_ISLAND_BUILD_SHA -cne $previousImageTag)) {
  throw 'Active release Compose/env does not resolve to the currently running Unified images and SHA.'
}
$env:GREED_L390_IMAGE_TAG = $ExpectedSha; $env:GREED_L390_BUILD_SHA = $ExpectedSha
$newResolved = Invoke-Docker (Compose-Arguments $stagedCompose @('--env-file',$envFile,'config','--format','json')) | ConvertFrom-Json
if (-not $isLegacyRoom) {
  # Restore active-stack interpolation values for all remaining active-config
  # preflights and the stop command. Candidate values are set again for rollout.
  $env:GREED_L390_IMAGE_TAG = $previousImageTag
  $env:GREED_L390_BUILD_SHA = $previousImageTag
}
$volume = $newResolved.volumes.'canonical-data'
if ($volume.external -ne $true -or -not $volume.name) { throw 'An owner-selected existing external canonical volume is required.' }
$canonicalVolume = [string]$volume.name
[void](Invoke-Docker @('volume','inspect',$canonicalVolume))
$port = @($newResolved.services.web.ports)
if ($port.Count -ne 1 -or $port[0].host_ip -ne '127.0.0.1' -or $port[0].target -ne 80) { throw 'Only the existing loopback web port may be bound.' }
$publishedPort = [int]$port[0].published
$priorBinding = @($web.HostConfig.PortBindings.'80/tcp')
if ($priorBinding.Count -ne 1 -or $priorBinding[0].HostIp -ne '127.0.0.1' -or [int]$priorBinding[0].HostPort -ne $publishedPort) { throw 'Candidate must preserve the current private web binding and port.' }
$origins = [string]$newResolved.services.multiplayer.environment.GREED_ISLAND_ALLOWED_ORIGINS
if (-not $origins) { throw 'Exact browser origins are required.' }
$origin = ($origins -split "[,\n]")[0].Trim()

# Preflight occurs BEFORE any old container stops. There is no production init,
# migration/import or first-signup owner fallback inside the image.
$probe = "import {resolveUnifiedConfig} from './dist/bootstrap/unifiedConfig.js'; import {inspectUnifiedDatabase} from './dist/bootstrap/unifiedServer.js'; const c=resolveUnifiedConfig(); inspectUnifiedDatabase(c.databasePath);"
[void](Invoke-Docker @('run','--rm','--network','none','--mount',"type=volume,src=$canonicalVolume,dst=/probe,readonly",'--env','HOST=0.0.0.0','--env','PORT=4179','--env','GREED_ISLAND_DB_PATH=/probe/greed-island.sqlite','--env',"GREED_ISLAND_ALLOWED_ORIGINS=$origins",'--env',"GREED_ISLAND_BUILD_SHA=$ExpectedSha",'--entrypoint','node',$backendImage,'--input-type=module','-e',$probe) 300)
$oldVolumes = @($backend.Mounts | Where-Object { $_.Type -eq 'volume' } | ForEach-Object { $_.Name })
if ($isLegacyRoom) {
  if ($oldVolumes -contains $canonicalVolume) { throw 'First cutover must use a separately staged canonical volume; legacy source stays untouched.' }
  $reviewPath = Join-Path $DeployPath 'deploy\l390\unified-cutover-review.json'
  if (-not (Test-Path -LiteralPath $reviewPath -PathType Leaf)) { throw 'Owner-reviewed mapping/admin/progress preservation receipt is required before first cutover.' }
  $review = Get-Content -Raw -LiteralPath $reviewPath | ConvertFrom-Json
  if ($review.reviewed -ne $true -or $review.canonicalVolume -cne $canonicalVolume -or -not $review.mappingDigest -or -not $review.progressPreservationDigest -or
      @($review.legacyVolumes).Count -ne $oldVolumes.Count -or @(Compare-Object @($review.legacyVolumes) $oldVolumes).Count) { throw 'First-cutover preservation review does not match the actual volumes.' }
}
$allVolumes = @(@($oldVolumes) + @($canonicalVolume) | Select-Object -Unique)
foreach ($name in $allVolumes) {
  $writers = (Invoke-Docker @('ps','-q','--filter',"volume=$name")) -split "\r?\n" | Where-Object { $_ }
  foreach ($writer in $writers) { if ($writer -ne $backend.Id -and -not $backend.Id.StartsWith($writer)) { throw 'Another running container uses a protected volume; no unreviewed quiesce is allowed.' } }
}
# Backward compatibility is proved read-only, or by disjoint unchanged legacy
# source volumes. A failure does not authorize a database restore.
$rollbackCompatible = $isLegacyRoom
if (-not $isLegacyRoom) {
  try { [void](Invoke-Docker @('run','--rm','--network','none','--mount',"type=volume,src=$canonicalVolume,dst=/probe,readonly",'--entrypoint','node',$backend.Image,'--input-type=module','-e',"import {inspectUnifiedDatabase} from './dist/bootstrap/unifiedServer.js'; inspectUnifiedDatabase('/probe/greed-island.sqlite');")); $rollbackCompatible = $true }
  catch { $rollbackCompatible = $false }
}
$rollbackConfig = Join-Path $backup 'rollback-compose.json'
$activeResolved.services.multiplayer.image = $backend.Image
$activeResolved.services.web.image = $web.Image
$rollbackCaddyfile = Join-Path $backup 'Caddyfile.l390'
$rollbackStagedCaddyfile = Join-Path $stagingDirectory 'rollback-Caddyfile.l390'
$caddyMount = @($activeResolved.services.web.volumes | Where-Object { $_.type -eq 'bind' -and $_.target -eq '/etc/caddy/Caddyfile' })
if ($caddyMount.Count -ne 1) { throw 'Existing Caddy bind mount must be explicit.' }
$activeCaddySource = [string]$caddyMount[0].source
$activeCaddyVersion = Invoke-Docker @('run','--rm','--network','none','--mount',"type=bind,src=$activeCaddySource,dst=/etc/caddy/Caddyfile,readonly",'--entrypoint','caddy',$webImage,'version') 120
Write-Host "Active release Caddy bind preflight: $activeCaddyVersion"
Copy-Item -LiteralPath $caddyMount[0].source -Destination $rollbackCaddyfile -Force
Copy-Item -LiteralPath $rollbackCaddyfile -Destination $rollbackStagedCaddyfile -Force
$rollbackCaddyVersion = Invoke-Docker @('run','--rm','--network','none','--mount',"type=bind,src=$rollbackStagedCaddyfile,dst=/etc/caddy/Caddyfile,readonly",'--entrypoint','caddy',$webImage,'version') 120
Write-Host "Staged rollback Caddyfile bind preflight: $rollbackCaddyVersion"
$caddyMount[0].source = $rollbackStagedCaddyfile
Write-Json $activeResolved $rollbackConfig
[IO.File]::WriteAllText((Join-Path $backup '.env'),'',([Text.UTF8Encoding]::new($false)))
$rollbackModel = Invoke-Docker (Compose-Arguments $rollbackConfig @('config','--format','json')) | ConvertFrom-Json
if ($rollbackModel.services.multiplayer.image -cne $backend.Image -or $rollbackModel.services.web.image -cne $web.Image) { throw 'Captured rollback model must round-trip with the exact prior images.' }
[void](Invoke-Docker @('save',$backend.Image,$web.Image,'-o',(Join-Path $backup 'prior-images.tar')) 600)
# Keep the candidate environment for audit. Unified rollback uses the active
# release Compose file plus activeEnvFile; legacy rollback uses activeResolved.
Copy-Item -LiteralPath $envFile -Destination (Join-Path $backup 'source.env')
Write-Json @{ sha=$ExpectedSha; priorBackendImage=$backend.Image; priorWebImage=$web.Image; canonicalVolume=$canonicalVolume; legacyVolumes=$oldVolumes; rollbackDatabaseCompatible=$rollbackCompatible } (Join-Path $backup 'rollout.json')

Add-Type -AssemblyName System.Net.Http
$handler = New-Object Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$http = [Net.Http.HttpClient]::new($handler)
$http.Timeout = [TimeSpan]::FromSeconds(8)
$base = "http://127.0.0.1:$publishedPort"
function Request([string]$Path, [string]$Method='GET', [string]$Origin='') {
  $message = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method),($base+$Path))
  if ($Origin) { [void]$message.Headers.TryAddWithoutValidation('Origin',$Origin) }
  if ($Method -eq 'POST') { $message.Content = [Net.Http.StringContent]::new('{}',[Text.Encoding]::UTF8,'application/json') }
  try {
    $response = $http.SendAsync($message).GetAwaiter().GetResult()
    try { return @{ status=[int]$response.StatusCode; body=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult(); location=[string]$response.Headers.Location } }
    finally { $response.Dispose() }
  } finally { $message.Dispose() }
}
function Await-Health([bool]$Unified, [int]$Seconds=180) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    try {
      $health = Request '/healthz'
      if ($health.status -eq 200) {
        if (-not $Unified -and (Request '/mp-api/snapshot').status -eq 401) { return }
        if ($Unified) {
          $data = $health.body | ConvertFrom-Json
          if ($data.ok -eq $true -and $data.mode -eq 'unified') { return }
        }
      }
    } catch { }
    Start-Sleep -Seconds 2
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Health verification timed out.'
}

$stopped = $false; $release = $stagingDirectory
try {
  $stopped = $true
  [void](Invoke-Docker (Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'stop','--timeout','30','multiplayer','web')) 120)
  $index = 0; $volumeBackups = @()
  foreach ($name in $allVolumes) {
    # Entire quiesced volume, including every SQLite WAL/SHM and account file.
    $container = $null; $archiveFailure = $null; $archivePath = Join-Path $backup ("volume-$index.tgz")
    try {
      $container = Invoke-Docker @('create','--name',"greed-l390-backup-$stamp-$index",'--network','none','--mount',"type=volume,src=$name,dst=/data,readonly",'--entrypoint','sh',$backendImage,'-c',"tar -czf /tmp/volume-$index.tgz -C /data . && gzip -t /tmp/volume-$index.tgz") 120
      [void](Invoke-Docker @('start','-a',$container) 600)
      [void](Invoke-Docker @('cp',"${container}:/tmp/volume-$index.tgz",$archivePath) 120)
    } catch {
      $archiveFailure = $_
      Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
      throw
    } finally {
      if ($container) {
        try { [void](Invoke-Docker @('rm','-f',$container) 30) }
        catch {
          if (-not $archiveFailure) {
            Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
            throw
          }
        }
      }
    }
    $snapshotPath = Join-Path $backup ("volume-$index.tgz")
    $volumeBackups += @{ volume=$name; file="volume-$index.tgz"; sha256=(Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $snapshotPath).Length }
    $index++
  }
  Write-Json $volumeBackups (Join-Path $backup 'volume-manifest.json')
  $env:GREED_L390_IMAGE_TAG = $ExpectedSha; $env:GREED_L390_BUILD_SHA = $ExpectedSha
  $env:GREED_L390_SOURCE_PATH = $SourcePath
  [void](Invoke-Docker (Compose-Arguments $stagedCompose @('--env-file',$envFile,'up','-d','--no-build','--pull','never')) 180)
  Await-Health $true
  $health = (Request '/healthz').body | ConvertFrom-Json
  if ($health.buildSha -cne $ExpectedSha -or $health.version -cne $manifest.appVersion) { throw 'Running health does not match the exact CI SHA/version.' }
  foreach ($service in @('multiplayer','web')) {
    $running = Get-Container $service
    $expectedImage = if ($service -eq 'multiplayer') { $backendImage } else { $webImage }
    $expectedId = (Invoke-Docker @('image','inspect',$expectedImage) | ConvertFrom-Json)[0].Id
    if ($running.Image -cne $expectedId) { throw 'Running container image is not the packaged CI image.' }
  }
  foreach ($path in @('/api/auth/me','/api/world/snapshot','/api/map')) { if ((Request $path).status -ne 401) { throw 'Unauthenticated endpoint protection failed.' } }
  foreach ($path in @('/mp-api','/mp-api/snapshot','/api/internal/raw-event-log','/api/internal/raw-npc-mind')) { if ((Request $path).status -ne 404) { throw 'Legacy/private route denial failed.' } }
  if ((Request '/api/world/command' 'POST' $origin).status -ne 401) { throw 'Same-origin unauthenticated command must be denied.' }
  if ((Request '/api/world/command' 'POST' 'https://deployment-probe.invalid').status -ne 403) { throw 'Wrong-Origin command must be denied.' }
  $oldPath = Request '/multiplayer-3d'
  if ($oldPath.status -ne 302 -or $oldPath.location -ne '/game' -or (Request '/game').status -ne 200) { throw 'Old game redirect must terminate in one hop.' }
  Write-Json @{ sha=$ExpectedSha; version=$health.version; release=$release; backup=$backup; status='verified'; verifiedAt=[DateTime]::UtcNow.ToString('o') } (Join-Path $DeployPath 'l390-active-release.json')
  Write-Host "Verified exact L390 SHA $ExpectedSha. Backups remain private and local."
} catch {
  $failure = $_
  if ($stopped) {
    try {
      [void](Invoke-Docker (Compose-Arguments $stagedCompose @('--env-file',$envFile,'stop','--timeout','30','multiplayer','web')) 120)
    } catch { }
    if (-not $rollbackCompatible) { throw 'Rollout failed and old DB/schema compatibility is unproven. Containers remain stopped; owner-reviewed local restore is required. No automatic database restore was attempted.' }
    try {
      if ($isLegacyRoom) {
        [void](Invoke-Docker (Compose-Arguments $rollbackConfig @('up','-d','--no-build','--pull','never')) 180)
      } else {
        # Use the still-preserved prior release Compose file and its recorded
        # environment file. Same-SHA image-ID drift is rejected before stop.
        $env:GREED_L390_IMAGE_TAG = $previousImageTag
        $env:GREED_L390_BUILD_SHA = $previousImageTag
        $env:GREED_L390_SOURCE_PATH = $SourcePath
        [void](Invoke-Docker (Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'up','-d','--no-build','--pull','never')) 180)
      }
      Await-Health (-not $isLegacyRoom) 120
      if ((Get-Container 'multiplayer').Image -cne $backend.Image -or (Get-Container 'web').Image -cne $web.Image) { throw 'Rollback image identity mismatch.' }
      Write-Host 'Prior images/config restored and verified. Databases were never restored or overwritten.'
    } catch { throw 'Rollback verification failed. Owner action is required; private local backups remain intact.' }
  }
  throw $failure
} finally { $http.Dispose(); $handler.Dispose() }
