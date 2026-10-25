param([string]$Version = '', [string]$OutputDirectory = 'dist/desktop', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This package target requires Windows x64.'
}
$packageVersion = (Get-Content frontend/package.json -Raw | ConvertFrom-Json).version
[xml]$pom = Get-Content backend/pom.xml -Raw
$backendVersion = $pom.SelectSingleNode("/*[local-name()='project']/*[local-name()='version']").InnerText
if (!$Version) { $Version = $packageVersion }
if ($Version -notmatch '^\d+\.\d+\.\d+$' -or $Version -ne $packageVersion -or $Version -ne $backendVersion) {
    throw 'Version must be numeric X.Y.Z and match frontend/package.json and backend/pom.xml.'
}
$outRoot = if ([IO.Path]::IsPathRooted($OutputDirectory)) { [IO.Path]::GetFullPath($OutputDirectory) } else { [IO.Path]::GetFullPath((Join-Path $root $OutputDirectory)) }
$name = "FigTide-$Version-windows-x64"
$destination = Join-Path $outRoot $name
if (Test-Path -LiteralPath $destination) { throw "Output already exists; choose another -OutputDirectory: $destination" }
$jdk = $env:JAVA_HOME
if (!$jdk -or !(Test-Path (Join-Path $jdk 'bin/jpackage.exe'))) {
    $jdk = (Get-ChildItem .runtime/java -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (!$jdk) { throw 'JDK 21 with jlink, jdeps and jpackage is required to build.' }
$javaVersion = ((Get-Content (Join-Path $jdk 'release') | Where-Object { $_ -match '^JAVA_VERSION=' }) -replace '^JAVA_VERSION="|"$', '')
if ($javaVersion -notmatch '^21[.+-]') { throw "Build requires JDK 21, got $javaVersion" }
foreach ($tool in @('jpackage','jlink','jdeps','java')) {
    if (!(Test-Path (Join-Path $jdk "bin/$tool.exe"))) { throw "Missing build tool: $tool" }
}
$env:JAVA_HOME = $jdk
$env:Path = "$jdk/bin;$env:Path"
if (!$SkipBuild) {
    & (Join-Path $PSScriptRoot 'build-desktop.ps1')
    if ($LASTEXITCODE) { throw 'Desktop JAR build failed.' }
}
$jar = Join-Path $root '.runtime/desktop-build/figtide.jar'
$infoFile = Join-Path $root '.runtime/desktop-build/build-info.json'
if (!(Test-Path $jar) -or !(Test-Path $infoFile)) { throw 'Run build-desktop.ps1 first; JAR and build metadata are required.' }
$build = Get-Content $infoFile -Raw | ConvertFrom-Json
$jarHash = (Get-FileHash $jar -Algorithm SHA256).Hash.ToLowerInvariant()
if ($build.jar_sha256 -ne $jarHash -or !(Test-Path (Join-Path $build.frontend_stage 'node_modules'))) {
    throw 'Build metadata does not match the JAR or its dependency directory; rebuild without -SkipBuild.'
}
$work = Join-Path $root ('.runtime/desktop-package-' + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $work 'classes'
$libraries = Join-Path $work 'lib'
$inputDir = Join-Path $work 'input'
foreach ($dir in @($classes,$libraries,$inputDir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($jar)
try {
    $manifestReader = [IO.StreamReader]::new($archive.GetEntry('META-INF/MANIFEST.MF').Open())
    try { $manifestText = $manifestReader.ReadToEnd() } finally { $manifestReader.Dispose() }
    $mainClass = [regex]::Match($manifestText, '(?m)^Main-Class:\s*([^\r\n]+)').Groups[1].Value.Trim()
    if ($mainClass -ne 'org.springframework.boot.loader.launch.JarLauncher') { throw 'Unexpected executable JAR launcher.' }
    foreach ($entry in $archive.Entries) {
        $target = $null
        if ($entry.FullName -like 'BOOT-INF/lib/*.jar') {
            $target = Join-Path $libraries ([IO.Path]::GetFileName($entry.FullName))
        } elseif ($entry.FullName.StartsWith('BOOT-INF/classes/') -and $entry.FullName.EndsWith('.class')) {
            $target = [IO.Path]::GetFullPath((Join-Path $classes $entry.FullName.Substring(17)))
            if (!$target.StartsWith($classes + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe class path in build JAR.' }
        }
        if ($target) {
            New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target)
        }
    }
} finally { $archive.Dispose() }
$analysis = & "$jdk/bin/jdeps.exe" --multi-release 21 --ignore-missing-deps --recursive --print-module-deps --class-path "$libraries/*" $classes 2> (Join-Path $work 'jdeps.stderr.log')
if ($LASTEXITCODE) { throw "jdeps failed; see $work" }
$detected = $analysis | Where-Object { $_ -match '^[a-zA-Z0-9_.]+(,[a-zA-Z0-9_.]+)*$' } | Select-Object -Last 1
if (!$detected) { throw 'jdeps did not return a module list.' }
# Service loaders, TLS providers, encodings and optional reflective paths are not
# all visible to static dependency analysis. Keep these explicit and smoke-test them.
$extras = @('java.desktop','java.net.http','java.sql','java.naming','java.management','java.xml','java.xml.crypto','jdk.charsets','jdk.crypto.ec','jdk.unsupported','jdk.zipfs')
$modules = @($detected.Split(',') + $extras | Sort-Object -Unique)
$runtime = Join-Path $work 'runtime'
& "$jdk/bin/jlink.exe" --module-path "$jdk/jmods" --add-modules ($modules -join ',') --strip-debug --no-header-files --no-man-pages --compress=2 --output $runtime
if ($LASTEXITCODE) { throw 'jlink failed.' }
$runtimeModules = @(& "$runtime/bin/java.exe" --list-modules | ForEach-Object { ($_ -split '@')[0] })
if ($LASTEXITCODE) { throw 'Trimmed runtime cannot start.' }
$icon = Join-Path $work 'FigTide.ico'
& (Join-Path $PSScriptRoot 'desktop/make-icon.ps1') -Source (Join-Path $root 'frontend/public/figtide-icon-512.png') -Output $icon
Copy-Item -LiteralPath $jar -Destination (Join-Path $inputDir 'figtide.jar')
$imageRoot = Join-Path $work 'image'
& "$jdk/bin/jpackage.exe" --type app-image --name FigTide --app-version $Version --vendor chen0206a --description 'Local scientific plotting workspace' --icon $icon --input $inputDir --main-jar figtide.jar --main-class $mainClass --runtime-image $runtime --dest $imageRoot --java-options '-Duser.timezone=UTC' --java-options '-Dspring.profiles.active=desktop'
if ($LASTEXITCODE) { throw 'jpackage failed.' }
$staged = Join-Path $imageRoot 'FigTide'
# JDK 21 jpackage converts wide arguments through the process ANSI code page.
# A UTF-8 process manifest preserves Chinese/emoji paths on English Windows too.
$launcherManifest = & (Join-Path $PSScriptRoot 'desktop/set-launcher-utf8.ps1') -Executable (Join-Path $staged 'FigTide.exe')
[IO.File]::WriteAllText((Join-Path $staged 'launcher-manifest.xml'), $launcherManifest, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $staged
Copy-Item -LiteralPath (Join-Path $root 'packaging/windows/README.txt') -Destination $staged
& node (Join-Path $PSScriptRoot 'desktop/notices.cjs') --lock (Join-Path $root 'frontend/package-lock.json') --modules (Join-Path $build.frontend_stage 'node_modules') --out (Join-Path $staged 'THIRD-PARTY-NOTICES.txt')
if ($LASTEXITCODE) { throw 'Dependency notice generation failed.' }
$revision = (& git rev-parse HEAD).Trim()
$dirty = [bool](& git status --porcelain)
$metadata = [ordered]@{ product = 'FigTide'; version = $Version; architecture = 'windows-x64'; source_revision = $revision; source_dirty = $dirty; java_version = $javaVersion; jar_sha256 = $jarHash; frontend_lock_sha256 = $build.frontend_lock_sha256; detected_modules = @($detected.Split(',')); reflective_modules = $extras; runtime_modules = $runtimeModules; main_class = $mainClass; java_options = @('-Duser.timezone=UTC','-Dspring.profiles.active=desktop') }
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $staged 'build-info.json'), ($metadata | ConvertTo-Json -Depth 5), $utf8)
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$app = Join-Path $destination 'FigTide'
Copy-Item -LiteralPath $staged -Destination $app -Recurse
$release = Join-Path $destination 'release'
New-Item -ItemType Directory -Path $release -Force | Out-Null
$zipPath = Join-Path $release "$name.zip"
[IO.Compression.ZipFile]::CreateFromDirectory($app, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true)
$metadata['archive'] = [ordered]@{ name = "$name.zip"; bytes = (Get-Item $zipPath).Length; sha256 = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() }
$jsonPath = Join-Path $release "$name.manifest.json"
[IO.File]::WriteAllText($jsonPath, ($metadata | ConvertTo-Json -Depth 5), $utf8)
$jsonHash = (Get-FileHash $jsonPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $release 'SHA256SUMS.txt'), "$($metadata.archive.sha256)  $name.zip`n$jsonHash  $name.manifest.json`n", $utf8)
Write-Host "Packaged application: $app/FigTide.exe"
Write-Host "Release files: $release"
