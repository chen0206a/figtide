param([Parameter(Mandatory=$true)][string]$Application)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$app = [IO.Path]::GetFullPath($Application)
if (!(Test-Path (Join-Path $app 'FigTide.exe'))) { throw 'Pass the application folder containing FigTide.exe.' }
$metadata = Get-Content (Join-Path $app 'build-info.json') -Raw | ConvertFrom-Json
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $app 'FigTide.exe'))
if (!$version.ProductVersion.StartsWith($metadata.version)) { throw 'EXE product version differs from build metadata.' }
$icon = Join-Path $root '.runtime/desktop-package-expected.ico'
& (Join-Path $PSScriptRoot 'desktop/make-icon.ps1') -Source (Join-Path $root 'frontend/public/figtide-icon-512.png') -Output $icon
$release = Join-Path (Split-Path $app -Parent) 'release'
foreach ($line in Get-Content (Join-Path $release 'SHA256SUMS.txt')) {
    if ($line -notmatch '^([a-f0-9]{64})  ([^/\\]+)$') { throw 'Malformed checksum entry.' }
    if ((Get-FileHash (Join-Path $release $Matches[2]) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Matches[1]) { throw 'Release checksum mismatch.' }
}
$manifest = Get-Content (Join-Path $release "FigTide-$($metadata.version)-windows-x64.manifest.json") -Raw | ConvertFrom-Json
if ($manifest.jar_sha256 -ne (Get-FileHash (Join-Path $app 'app/figtide.jar') -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'JAR checksum mismatch.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $release $manifest.archive.name))
try {
    $entries = @($archive.Entries | ForEach-Object FullName)
    foreach ($required in @('FigTide/FigTide.exe','FigTide/app/figtide.jar','FigTide/runtime/bin/server/jvm.dll','FigTide/LICENSE','FigTide/THIRD-PARTY-NOTICES.txt')) {
        if ($entries -notcontains $required) { throw "Release archive is missing $required" }
    }
    if (@($entries | Where-Object { $_ -notlike 'FigTide/*' -or $_ -match '(^|/)\.\./' }).Count) { throw 'Unsafe release archive structure.' }
} finally { $archive.Dispose() }
$node = (Get-Command node.exe).Source
& $node (Join-Path $PSScriptRoot 'desktop/probe.cjs') --app $app --icon $icon --out (Join-Path $root '.runtime/desktop-package-smoke.json')
if ($LASTEXITCODE) { throw 'Packaged application verification failed.' }
