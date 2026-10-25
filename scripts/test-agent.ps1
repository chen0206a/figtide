param([switch]$All, [string]$MySqlBin = '', [int]$FixturePort = 18769, [string[]]$Specs, [switch]$Production, [ValidateSet('mysql','h2')][string]$Database = 'mysql', [switch]$Desktop, [switch]$Packaged, [string]$Application = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$appVersion = & (Join-Path $PSScriptRoot 'get-version.ps1')
Set-Location $root
function Resolve-MySqlBin {
    param([string]$Explicit)
    if ($Explicit) {
        if (Test-Path (Join-Path $Explicit 'mysql.exe')) { return $Explicit }
        throw "-MySqlBin 指向的目录里没有 mysql.exe：$Explicit"
    }
    if ($env:LABFLOW_MYSQL_BIN) {
        if (Test-Path (Join-Path $env:LABFLOW_MYSQL_BIN 'mysql.exe')) { return $env:LABFLOW_MYSQL_BIN }
        throw "LABFLOW_MYSQL_BIN 指向的目录里没有 mysql.exe：$($env:LABFLOW_MYSQL_BIN)"
    }
    $onPath = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($onPath) { return (Split-Path $onPath.Source -Parent) }
    $fallback = 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
    if (Test-Path (Join-Path $fallback 'mysql.exe')) { return $fallback }
    throw @'
找不到 mysql.exe。请任选一种方式指定 MySQL 的 bin 目录：
  1. 加参数：.\scripts\test-agent.ps1 -MySqlBin "C:\Program Files\MySQL\MySQL Server 8.0\bin"
  2. 设环境变量：$env:LABFLOW_MYSQL_BIN = "C:\Program Files\MySQL\MySQL Server 8.0\bin"
  3. 把 MySQL 的 bin 目录加入 PATH
'@
}
$desktopMode = $Desktop -or $Packaged -or $Database -eq 'h2'
if ($Packaged) {
    if (!$Application) { throw '-Packaged requires -Application pointing to the folder containing FigTide.exe.' }
    $Application = [IO.Path]::GetFullPath($Application)
    if (!(Test-Path (Join-Path $Application 'FigTide.exe')) -or !(Test-Path (Join-Path $Application 'build-info.json'))) { throw 'Packaged application or metadata missing.' }
} elseif ($Application) { throw '-Application is only valid with -Packaged.' }
if ($desktopMode) { $Database = 'h2' }
if ($Database -eq 'mysql') { $MySqlBin = Resolve-MySqlBin -Explicit $MySqlBin }
# 14-1-4.5：-Database h2 用 desktop profile + 每次全新的临时数据目录（文件库，重启
# 持久，供 audit-restart 验证），结束后删除；数据库名仍叫 labflow_e2e 以满足
# TestSupportController 的测试库守卫（真实工作区库无论 MySQL/H2 都拒绝）。
$dataDir = $null
$testRoot = $null
if ($Database -eq 'h2') {
    $testRoot = Join-Path $root ('.runtime/agent-e2e-h2-' + [guid]::NewGuid().ToString('N'))
    $dataDir = Join-Path $testRoot 'data'
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
# Dedicated ports and schema: never redirect or stop the user's running workspace.
$ports = if ($desktopMode) { @($FixturePort) } else { @(8087, 5178, $FixturePort) }
foreach ($port in $ports) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Test port $port is already occupied." }
}
if ($Database -eq 'mysql' -and !(Get-NetTCPConnection -LocalPort 33316 -State Listen -ErrorAction SilentlyContinue)) { throw 'Start the local MySQL instance with scripts/start.ps1 first.' }
if (!$Packaged) {
    $env:JAVA_HOME = (Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}
if ($Database -eq 'mysql') {
    $oldPassword = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = 'labflow-root-local'
        "CREATE DATABASE IF NOT EXISTS labflow_e2e CHARACTER SET utf8mb4; GRANT ALL ON labflow_e2e.* TO 'labflow'@'127.0.0.1';" |
            & "$MySqlBin/mysql.exe" --host=127.0.0.1 --port=33316 --user=root
        if ($LASTEXITCODE) { throw 'Cannot prepare isolated labflow_e2e database.' }
    } finally { $env:MYSQL_PWD = $oldPassword }
}
if (!$desktopMode) {
    & mvn.cmd -q -f backend/pom.xml package -DskipTests "-Dlabflow.build.directory=$root/.runtime/agent-e2e-build"
    if ($LASTEXITCODE) { throw 'Backend package failed.' }
}
$oldApi = $env:LABFLOW_API
$oldWeb = $env:LABFLOW_WEB_URL
$oldKey = $env:LABFLOW_AGENT_API_KEY
$oldNoProxy = $env:NO_PROXY
$oldFixturePort = $env:LABFLOW_FIXTURE_PORT
$oldDesktopMode = $env:LABFLOW_DESKTOP_E2E
$oldPackageApp = $env:LABFLOW_PACKAGE_APP
$fixture = $null
$backend = $null
$ownedWeb = $null
$script:ownedLaunchers = [Collections.Generic.List[Diagnostics.Process]]::new()
$script:baseUrl = 'http://127.0.0.1:8087'
function Start-AgentTestBackend {
    $launchArgs = @('-Duser.timezone=UTC','-jar')
    if ($desktopMode) {
        # desktop profile 提供 H2 数据源与 db/migration-h2 迁移；URL 改指向本次
        # 临时目录下的 labflow_e2e 文件库（TestSupportController 守卫只放行测试库）。
        $h2Path = ($dataDir -replace '\\','/') + '/labflow_e2e'
        # WRITE_DELAY=0：audit-restart 会强杀后端再重启，H2 默认的写缓冲会丢掉
        # 强杀前最后约 1 秒已提交的数据（实测复现）；提交即落盘后重启不丢。
        if ($Packaged) { $launchArgs = @() }
        else { $launchArgs += @('.runtime/desktop-build/figtide.jar','--spring.profiles.active=desktop') }
        $launchArgs += @(
            "--labflow.data-dir=$dataDir",'--labflow.desktop.open-browser=false','--labflow.desktop.tray=false',
            "--spring.datasource.url=jdbc:h2:file:$h2Path;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;WRITE_DELAY=0")
    } else {
        $launchArgs += @(".runtime/agent-e2e-build/labflow-$appVersion.jar",'--server.port=8087',
            '--labflow.frontend-origin=http://127.0.0.1:5178','--spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_e2e')
    }
    $launchArgs += @('--labflow.test-support=true',"--LABFLOW_AGENT_BASE_URL=http://127.0.0.1:$FixturePort",'--LABFLOW_AGENT_MODEL=labflow-fixture')
    $quotedArgs = $launchArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_.Replace('"','\"') + '"' } else { $_ } }
    if ($Packaged) {
        # Only the EXE child loses system Java; Node/Chrome in the developer harness
        # keep their normal environment. Never inherit JVM injection options.
        $saved = @{}
        foreach ($name in @('Path','JAVA_HOME','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS')) {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        }
        try {
            $env:Path = Join-Path $env:SystemRoot 'System32'
            $env:JAVA_HOME = Join-Path $testRoot 'no-system-java'
            $env:JAVA_TOOL_OPTIONS = ''; $env:JDK_JAVA_OPTIONS = ''; $env:_JAVA_OPTIONS = ''
            $launcher = Start-Process (Join-Path $Application 'FigTide.exe') -ArgumentList $quotedArgs -WorkingDirectory $testRoot -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput (Join-Path $root '.runtime/agent-e2e.stdout.log') -RedirectStandardError (Join-Path $root '.runtime/agent-e2e.stderr.log')
            $script:ownedLaunchers.Add($launcher)
            $launcher
        } finally {
            foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
        }
    } else {
        Start-Process "$env:JAVA_HOME/bin/java.exe" -ArgumentList $quotedArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput '.runtime/agent-e2e.stdout.log' -RedirectStandardError '.runtime/agent-e2e.stderr.log'
    }
}
function Wait-AgentTestBackend {
    for ($n=0; $n -lt 60; $n++) {
        if ($backend.HasExited) { throw 'Isolated backend exited; see .runtime/agent-e2e logs.' }
        try {
            if ($desktopMode) {
                $record = Get-Content (Join-Path $dataDir 'app.port') -Raw -ErrorAction Stop | ConvertFrom-Json
                if ($record.port -lt 1 -or $record.port -gt 65535) { throw 'Invalid desktop port' }
                $script:baseUrl = "http://127.0.0.1:$($record.port)"
                $ping = Invoke-RestMethod "$script:baseUrl/api/desktop/ping" -TimeoutSec 2
                if ($ping.instance_id -ne $record.instance_id) { throw 'Desktop identity mismatch' }
            }
            $health = Invoke-RestMethod "$script:baseUrl/api/health" -TimeoutSec 2
            if ($health.status -eq 'ok') {
                if ($Packaged) {
                    $listener = Get-NetTCPConnection -LocalPort ([Uri]$script:baseUrl).Port -State Listen | Select-Object -First 1
                    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
                    # jpackage's Windows GUI launcher can fork another copy of itself.
                    # Accept only that direct child and the exact packaged executable.
                    if ($listener.LocalAddress -ne '127.0.0.1' -or
                        $process.ExecutablePath -ne (Join-Path $Application 'FigTide.exe') -or
                        ($process.ProcessId -ne $backend.Id -and $process.ParentProcessId -ne $backend.Id)) {
                        throw 'Packaged listener is not our owned executable or its direct child.'
                    }
                    $script:backend = Get-Process -Id $process.ProcessId
                }
                return
            }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw 'Isolated backend did not start; see .runtime/agent-e2e.stderr.log.'
}
try {
    # Neither fixture process receives a real key. Build output also stays separate from the running app.
    $env:LABFLOW_AGENT_API_KEY = ''
    $env:LABFLOW_FIXTURE_PORT = [string]$FixturePort
    $env:NO_PROXY = '127.0.0.1,localhost,::1'
    if ($desktopMode -and !$Packaged) {
        & (Join-Path $PSScriptRoot 'build-desktop.ps1')
        if ($LASTEXITCODE) { throw 'Desktop package failed.' }
    }
    $fixture = Start-Process (Get-Command node.exe).Source -ArgumentList 'frontend/e2e/fixtures/compatible-provider.cjs' -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $backend = Start-AgentTestBackend
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    Wait-AgentTestBackend
    # Ensure an empty test schema has a nonzero cleanup watermark.
    $projects = Invoke-RestMethod "$script:baseUrl/api/projects"
    if (!$projects.Count) {
        Invoke-RestMethod "$script:baseUrl/api/projects" -Method Post -ContentType 'application/json' -Body '{"name":"E2E isolated workspace","description":"Test schema only"}' | Out-Null
    }
    $env:LABFLOW_API = $script:baseUrl
    $env:LABFLOW_WEB_URL = if ($desktopMode) { $script:baseUrl } else { 'http://127.0.0.1:5178' }
    $env:LABFLOW_DESKTOP_E2E = if ($desktopMode) { '1' } else { '' }
    $env:LABFLOW_PACKAGE_APP = if ($Packaged) { $Application } else { '' }
    $env:NO_PROXY = '127.0.0.1,localhost,::1'
    if ($desktopMode) {
        $page = Invoke-WebRequest "$script:baseUrl/" -UseBasicParsing
        if ($page.Content -notmatch 'FigTide') { throw 'Desktop JAR did not serve its frontend' }
        $owner = Get-NetTCPConnection -LocalPort ([Uri]$script:baseUrl).Port -State Listen | Select-Object -First 1
        if ($owner.OwningProcess -ne $backend.Id -or $owner.LocalAddress -ne '127.0.0.1') {
            throw "Desktop transport mismatch: launched PID=$($backend.Id); listener PID=$($owner.OwningProcess), address=$($owner.LocalAddress), executable=$((Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue).Path)"
        }
    } elseif ($Production) {
        if (!(Test-Path 'frontend/dist/index.html')) { throw 'Run npm run build in frontend before a production check.' }
        $ownedWeb = Start-Process (Get-Command node.exe).Source -ArgumentList 'scripts/serve-test-build.cjs' -WorkingDirectory $root -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput '.runtime/production-test.stdout.log' -RedirectStandardError '.runtime/production-test.stderr.log'
        $ready = $false
        for ($attempt=0; $attempt -lt 40; $attempt++) {
            & curl.exe --noproxy '*' --max-time 2 -fs 'http://127.0.0.1:5178/api/health' 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Milliseconds 500
        }
        if (!$ready) { throw 'Production test server did not start; see .runtime/production-test.stderr.log.' }
    }
    @{ mode = $(if ($Packaged) { 'packaged-exe' } elseif ($desktopMode) { 'desktop-jar' } else { 'development-mysql' }); api = $env:LABFLOW_API; web = $env:LABFLOW_WEB_URL;
       database = $Database; fixture_port = $FixturePort; pid = $backend.Id; started = [DateTime]::UtcNow.ToString('o') } |
       ConvertTo-Json | Set-Content '.runtime/test-agent-transport.json'
    Write-Host "E2E transport: $env:LABFLOW_WEB_URL ($Database, desktop=$desktopMode)"
    Push-Location frontend
    try {
        if ($All) { & node node_modules/@playwright/test/cli.js test }
        elseif ($Specs) { & node node_modules/@playwright/test/cli.js test @Specs }
        else { & node node_modules/@playwright/test/cli.js test agent.spec.ts figure-tools.spec.ts model-connection.spec.ts chart-planner.spec.ts }
        if ($LASTEXITCODE) { throw 'Browser verification failed.' }
    } finally { Pop-Location }
    & node frontend/e2e/fixtures/audit-restart.cjs prepare
    if ($LASTEXITCODE) { throw 'Cannot prepare process restart verification.' }
    # This process was created above exclusively for this test schema and port.
    Stop-Process -Id $backend.Id
    Wait-Process -Id $backend.Id -ErrorAction SilentlyContinue
    $env:LABFLOW_AGENT_API_KEY = ''
    $backend = Start-AgentTestBackend
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    Wait-AgentTestBackend
    $env:LABFLOW_API = $script:baseUrl
    & node frontend/e2e/fixtures/audit-restart.cjs verify
    if ($LASTEXITCODE) { throw 'Process restart verification failed.' }
} finally {
    $env:LABFLOW_API = $oldApi
    $env:LABFLOW_WEB_URL = $oldWeb
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    $env:NO_PROXY = $oldNoProxy
    $env:LABFLOW_FIXTURE_PORT = $oldFixturePort
    $env:LABFLOW_DESKTOP_E2E = $oldDesktopMode
    $env:LABFLOW_PACKAGE_APP = $oldPackageApp
    foreach ($owned in (@($backend, $fixture, $ownedWeb) + @($script:ownedLaunchers.ToArray()))) {
        if ($owned -and !( $owned.HasExited )) { Stop-Process -Id $owned.Id; Wait-Process -Id $owned.Id -ErrorAction SilentlyContinue }
    }
    # 14-1-4.5：H2 临时数据目录在进程停止后整体删除；删不掉只警告，不影响测试结论。
    if ($testRoot -and (Test-Path $testRoot)) {
        $resolved = [IO.Path]::GetFullPath($testRoot)
        $allowed = [IO.Path]::GetFullPath((Join-Path $root '.runtime')) + [IO.Path]::DirectorySeparatorChar
        if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or !(Split-Path $resolved -Leaf).StartsWith('agent-e2e-h2-')) {
            throw 'Refusing to remove a directory outside the owned H2 test workspace.'
        }
        try { Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop }
        catch { Write-Warning "H2 temporary directory preserved: $resolved" }
    }
}
