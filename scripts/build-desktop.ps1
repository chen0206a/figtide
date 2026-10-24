param([string]$BuildDirectory = '.runtime/desktop-build')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$jdk = Get-ChildItem (Join-Path $root '.runtime/java') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($jdk) { $env:JAVA_HOME = $jdk.FullName; $env:Path = "$env:JAVA_HOME/bin;$env:Path" }
$stageRoot = Join-Path $root ('.runtime/desktop-ui-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $stageRoot 'frontend'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot 'docs') -Force | Out-Null
Copy-Item (Join-Path $root 'docs/config-v1.example.json') (Join-Path $stageRoot 'docs')
# npm ci removes node_modules; a running Windows Vite locks native modules there.
# Build an exact copy of the source in an isolated dependency directory instead.
Get-ChildItem (Join-Path $root 'frontend') | Where-Object {
    $_.Name -notin @('node_modules','dist','test-results','playwright-report') -and $_.Name -notlike '*.tsbuildinfo'
} | Copy-Item -Destination $stage -Recurse -Force
Push-Location $stage
try {
    & npm.cmd ci --cache (Join-Path $root '.runtime/npm-cache')
    if ($LASTEXITCODE) { throw 'Frontend dependency installation failed.' }
    & npm.cmd run build
    if ($LASTEXITCODE) { throw 'Frontend build failed.' }
} finally { Pop-Location }
Copy-Item (Join-Path $stage 'dist') (Join-Path $root 'frontend') -Recurse -Force
$output = [IO.Path]::GetFullPath((Join-Path $root $BuildDirectory))
& mvn.cmd -B -f backend/pom.xml -Pdesktop -DskipTests "-Dlabflow.build.directory=$output" package
if ($LASTEXITCODE) { throw 'Desktop JAR build failed.' }
$buildInfo = @{ jar_sha256 = (Get-FileHash (Join-Path $output 'figtide.jar') -Algorithm SHA256).Hash.ToLowerInvariant(); frontend_lock_sha256 = (Get-FileHash (Join-Path $stage 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant(); frontend_stage = $stage; created_at = [DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText((Join-Path $output 'build-info.json'), ($buildInfo | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Write-Host "Desktop JAR: $(Join-Path $output 'figtide.jar')"
