# deploy-map-dir.ps1 -- migrate ONE already-deployed map directory across machines
#
# Copies <SourceSaveLevel>/<mapId>/ (.gil + external_lua_file/ ... everything except .gsts/)
# into <TargetSaveLevel>/<mapId>/ with per-file SHA256 verification.
# Rule source: references/12-deploy.md section 6 (Linux/Wine -> Win11, 2026-11-25).
#
# Safety:
#   * fail-closed: refuses when the target map dir already exists (never overwrites)
#   * never touches .gip / Temp -- run `gsts maps:resync --map-id <mapId>` afterwards
#   * staged: files land in <mapId>.deploy-tmp first and are renamed into place only
#     after every SHA matches, so the editor never sees a half-copied map
#   * ASCII-only source on purpose: the file is executed by Windows PowerShell 5.1,
#     which mis-decodes BOM-less UTF-8 string literals (paths with CJK come in as args)
#
# Usage:
#   powershell -NoProfile -File deploy-map-dir.ps1 `
#     -SourceSaveLevel <src>/Beyond_Local_Save_Level `
#     -TargetSaveLevel <dst>/Beyond_Local_Save_Level `
#     -MapId 1073741827 [-ManifestPath <file.json>] [-DryRun]
param(
  [Parameter(Mandatory = $true)] [string] $SourceSaveLevel,
  [Parameter(Mandatory = $true)] [string] $TargetSaveLevel,
  [Parameter(Mandatory = $true)] [long] $MapId,
  [string] $ManifestPath = '',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$id = [string]$MapId
$srcDir = Join-Path $SourceSaveLevel $id
$dstDir = Join-Path $TargetSaveLevel $id
$stageDir = Join-Path $TargetSaveLevel ($id + '.deploy-tmp')

function Get-Sha([string] $Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
}

# ---- preflight (fail closed) --------------------------------------------------
if (-not (Test-Path -LiteralPath $srcDir -PathType Container)) { throw "source map dir not found: $srcDir" }
if (-not (Test-Path -LiteralPath (Join-Path $srcDir ($id + '.gil')) -PathType Leaf)) {
  throw "source map gil not found under: $srcDir"
}
if (-not (Test-Path -LiteralPath $TargetSaveLevel -PathType Container)) { throw "target Save_Level not found: $TargetSaveLevel" }
if (Test-Path -LiteralPath $dstDir) { throw "target map dir already exists, refusing to overwrite: $dstDir" }
if (Test-Path -LiteralPath $stageDir) { throw "stale staging dir from an earlier run, remove it first: $stageDir" }

# ---- inventory ------------------------------------------------------------------
$files = @(Get-ChildItem -LiteralPath $srcDir -Recurse -Force -File |
  Where-Object { $_.FullName -notmatch '[\\/]\.gsts[\\/]' } |
  Sort-Object FullName)
if ($files.Count -eq 0) { throw "no files to deploy under: $srcDir" }

$entries = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($srcDir.Length).TrimStart('\', '/')
  $entries += [pscustomobject]@{
    relPath = $rel
    size = $f.Length
    sha256 = Get-Sha $f.FullName
    sourceMtime = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
  }
}

$total = ($entries | Measure-Object -Property size -Sum).Sum
Write-Output ("mapId={0} files={1} totalBytes={2}" -f $id, $entries.Count, $total)
foreach ($e in $entries) {
  Write-Output ("  src  {0}  {1,9} B  {2}  {3}" -f $e.sha256.Substring(0, 16), $e.size, $e.sourceMtime, $e.relPath)
}

if ($DryRun) {
  Write-Output 'DRY-RUN: nothing copied (rerun without -DryRun to deploy)'
  return
}

# ---- staged copy + per-file verification ----------------------------------------
# `maps` only recognises all-digit dir names, so the staging dir is invisible to the CLI,
# and the editor never scans this directory (its list comes from the .gip registry).
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
$deployed = @()
try {
  foreach ($e in $entries) {
    $from = Join-Path $srcDir $e.relPath
    $to = Join-Path $stageDir $e.relPath
    $parent = Split-Path -Parent $to
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $from -Destination $to
    $sha = Get-Sha $to
    $len = (Get-Item -LiteralPath $to).Length
    if ($sha -ne $e.sha256 -or $len -ne $e.size) {
      throw ("SHA/size mismatch after copy: {0} (src {1} {2} B / dst {3} {4} B)" -f $e.relPath, $e.sha256, $e.size, $sha, $len)
    }
    Write-Output ("  dst  {0}  {1,9} B  {2}  OK" -f $sha.Substring(0, 16), $len, $e.relPath)
    $deployed += [pscustomobject]@{ relPath = $e.relPath; size = $len; sha256 = $sha }
  }
  # every file verified -> atomic same-volume rename into place (last statement in try)
  Rename-Item -LiteralPath $stageDir -NewName $id
} catch {
  if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
  throw
}

Write-Output ("deployed: {0} ({1} files, {2} B, all SHA equal to source)" -f $dstDir, $deployed.Count, $total)

if ($ManifestPath -ne '') {
  $manifest = [pscustomobject]@{
    mapId = $MapId
    deployedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    sourceMapDir = $srcDir
    targetMapDir = $dstDir
    excluded = '.gsts/ (CLI backup history; not read by the game; left at the source)'
    fileCount = $deployed.Count
    totalBytes = $total
    files = $deployed
    nextStep = 'gsts maps:resync --map-id ' + $id + '  (gip register + Temp sync; not done by this script)'
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
  Write-Output ("manifest written: {0}" -f $ManifestPath)
}
