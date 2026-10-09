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
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $ExpectedSha.Substring(0,12)
$backup = Join-Path $backupRoot $stamp
New-Item -ItemType Directory -Path $backup | Out-Null
$diagnostic = Join-Path $backup 'docker-diagnostics.log'

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

[void](Invoke-Docker @('run','--rm','--network','none','--mount',"type=bind,src=$(Join-Path $SourcePath 'scripts\test-l390-image.mjs'),dst=/app/l390-smoke.mjs,readonly",'--entrypoint','node',$backendImage,'/app/l390-smoke.mjs') 120)
$backend = Get-Container 'multiplayer'; $web = Get-Container 'web'
if ($backend.State.Status -ne 'running' -or $web.State.Status -ne 'running') { throw 'Existing L390 stack must be running before a controlled cutover.' }
$activeConfigFiles = $backend.Config.Labels.'com.docker.compose.project.config_files'
if (-not $activeConfigFiles -or $activeConfigFiles.Contains(',')) { throw 'Current stack must have one verified Compose file; review multi-file deployments explicitly.' }
$activeConfig = [IO.Path]::GetFullPath($activeConfigFiles)
$activeDirectory = Split-Path -Parent $activeConfig
$envFile = Join-Path $DeployPath 'deploy\l390\.env'
if (-not (Test-Path -LiteralPath $activeConfig -PathType Leaf) -or -not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Existing active Compose configuration and dedicated L390 .env are required.' }
$activeEnvFile = Join-Path $activeDirectory '.env'
if (-not (Test-Path -LiteralPath $activeEnvFile -PathType Leaf)) { throw 'The currently active stack .env must exist before any stop.' }
$activeResolved = Invoke-Docker (Compose-Arguments $activeConfig @('--env-file',$activeEnvFile,'config','--format','json')) | ConvertFrom-Json
$sourceConfig = Join-Path $SourcePath 'deploy\l390\docker-compose.yml'
$env:GREED_L390_IMAGE_TAG = $ExpectedSha; $env:GREED_L390_BUILD_SHA = $ExpectedSha
$newResolved = Invoke-Docker (Compose-Arguments $sourceConfig @('--env-file',$envFile,'config','--format','json')) | ConvertFrom-Json
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
[void](Invoke-Docker @('run','--rm','--network','none','--mount',"type=bind,src=$(Join-Path $SourcePath 'deploy\l390\Caddyfile.l390'),dst=/etc/caddy/Caddyfile,readonly",'--entrypoint','caddy',$webImage,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'))

$oldVolumes = @($backend.Mounts | Where-Object { $_.Type -eq 'volume' } | ForEach-Object { $_.Name })
$isLegacyRoom = @($backend.Config.Cmd) -contains 'dist/multiplayer/server.js'
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
$caddyMount = @($activeResolved.services.web.volumes | Where-Object { $_.type -eq 'bind' -and $_.target -eq '/etc/caddy/Caddyfile' })
if ($caddyMount.Count -ne 1) { throw 'Existing Caddy bind mount must be explicit.' }
Copy-Item -LiteralPath $caddyMount[0].source -Destination (Join-Path $backup 'Caddyfile.l390')
$caddyMount[0].source = Join-Path $backup 'Caddyfile.l390'
Write-Json $activeResolved $rollbackConfig
[IO.File]::WriteAllText((Join-Path $backup '.env'),'',([Text.UTF8Encoding]::new($false)))
$rollbackModel = Invoke-Docker (Compose-Arguments $rollbackConfig @('config','--format','json')) | ConvertFrom-Json
if ($rollbackModel.services.multiplayer.image -cne $backend.Image -or $rollbackModel.services.web.image -cne $web.Image) { throw 'Captured rollback model must round-trip with the exact prior images.' }
[void](Invoke-Docker @('save',$backend.Image,$web.Image,'-o',(Join-Path $backup 'prior-images.tar')) 600)
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

$stopped = $false; $release = Join-Path $DeployPath ("releases\"+$ExpectedSha+"-"+$stamp)
try {
  $stopped = $true
  [void](Invoke-Docker (Compose-Arguments $activeConfig @('--env-file',(Join-Path $activeDirectory '.env'),'stop','--timeout','30','multiplayer','web')) 120)
  $index = 0; $volumeBackups = @()
  foreach ($name in $allVolumes) {
    # Entire quiesced volume, including every SQLite WAL/SHM and account file.
    $container = "greed-l390-backup-$stamp-$index"
    try { [void](Invoke-Docker @('run','--rm','--name',$container,'--network','none','--mount',"type=volume,src=$name,dst=/data,readonly",'--mount',"type=bind,src=$backup,dst=/backup",'--entrypoint','sh',$backendImage,'-c',"tar -czf /backup/volume-$index.tgz -C /data . && gzip -t /backup/volume-$index.tgz") 600) }
    finally { try { [void](Invoke-Docker @('rm','-f',$container) 30) } catch { } }
    $snapshotPath = Join-Path $backup ("volume-$index.tgz")
    $volumeBackups += @{ volume=$name; file="volume-$index.tgz"; sha256=(Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $snapshotPath).Length }
    $index++
  }
  Write-Json $volumeBackups (Join-Path $backup 'volume-manifest.json')
  New-Item -ItemType Directory -Path $release | Out-Null
  Copy-Item -Path (Join-Path $SourcePath '*') -Destination $release -Recurse
  $releaseDirectory = Join-Path $release 'deploy\l390'
  $releaseConfig = Join-Path $releaseDirectory 'docker-compose.yml'
  $releaseEnv = Join-Path $releaseDirectory '.env'
  $environmentText = "GREED_ISLAND_ALLOWED_ORIGINS=$origins`nGREED_L390_CANONICAL_VOLUME=$canonicalVolume`nGREED_L390_HOST_PORT=$publishedPort`nGREED_L390_IMAGE_TAG=$ExpectedSha`nGREED_L390_BUILD_SHA=$ExpectedSha`n"
  [IO.File]::WriteAllText($releaseEnv,$environmentText,([Text.UTF8Encoding]::new($false)))
  [void](Invoke-Docker (Compose-Arguments $releaseConfig @('--env-file',$releaseEnv,'up','-d','--no-build','--pull','never')) 180)
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
      [void](Invoke-Docker (Compose-Arguments (Join-Path $release 'deploy\l390\docker-compose.yml') @('stop','--timeout','30','multiplayer','web')) 120)
    } catch { }
    if (-not $rollbackCompatible) { throw 'Rollout failed and old DB/schema compatibility is unproven. Containers remain stopped; owner-reviewed local restore is required. No automatic database restore was attempted.' }
    try {
      [void](Invoke-Docker (Compose-Arguments $rollbackConfig @('up','-d','--no-build','--pull','never')) 180)
      Await-Health (-not $isLegacyRoom) 120
      if ((Get-Container 'multiplayer').Image -cne $backend.Image -or (Get-Container 'web').Image -cne $web.Image) { throw 'Rollback image identity mismatch.' }
      Write-Host 'Prior images/config restored and verified. Databases were never restored or overwritten.'
    } catch { throw 'Rollback verification failed. Owner action is required; private local backups remain intact.' }
  }
  throw $failure
} finally { $http.Dispose(); $handler.Dispose() }
