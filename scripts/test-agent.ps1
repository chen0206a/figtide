param([switch]$All, [string]$MySqlBin = '', [int]$FixturePort = 18769, [string[]]$Specs, [switch]$Production, [ValidateSet('mysql','h2')][string]$Database = 'mysql')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
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
if ($Database -eq 'mysql') { $MySqlBin = Resolve-MySqlBin -Explicit $MySqlBin }
# 14-1-4.5：-Database h2 用 desktop profile + 每次全新的临时数据目录（文件库，重启
# 持久，供 audit-restart 验证），结束后删除；数据库名仍叫 labflow_e2e 以满足
# TestSupportController 的测试库守卫（真实工作区库无论 MySQL/H2 都拒绝）。
$dataDir = $null
if ($Database -eq 'h2') {
    $dataDir = Join-Path $root ('.runtime/agent-e2e-h2-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
# Dedicated ports and schema: never redirect or stop the user's running workspace.
foreach ($port in @(8087, 5178, $FixturePort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Test port $port is already occupied." }
}
if ($Database -eq 'mysql' -and !(Get-NetTCPConnection -LocalPort 33316 -State Listen -ErrorAction SilentlyContinue)) { throw 'Start the local MySQL instance with scripts/start.ps1 first.' }
$env:JAVA_HOME = (Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
if ($Database -eq 'mysql') {
    $oldPassword = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = 'labflow-root-local'
        "CREATE DATABASE IF NOT EXISTS labflow_e2e CHARACTER SET utf8mb4; GRANT ALL ON labflow_e2e.* TO 'labflow'@'127.0.0.1';" |
            & "$MySqlBin/mysql.exe" --host=127.0.0.1 --port=33316 --user=root
        if ($LASTEXITCODE) { throw 'Cannot prepare isolated labflow_e2e database.' }
    } finally { $env:MYSQL_PWD = $oldPassword }
}
& mvn.cmd -q -f backend/pom.xml package -DskipTests "-Dlabflow.build.directory=$root/.runtime/agent-e2e-build"
if ($LASTEXITCODE) { throw 'Backend package failed.' }
$oldApi = $env:LABFLOW_API
$oldWeb = $env:LABFLOW_WEB_URL
$oldKey = $env:LABFLOW_AGENT_API_KEY
$oldNoProxy = $env:NO_PROXY
$oldFixturePort = $env:LABFLOW_FIXTURE_PORT
$fixture = $null
$backend = $null
$ownedWeb = $null
function Start-AgentTestBackend {
    $args = @('-jar','.runtime/agent-e2e-build/labflow-0.1.0.jar',
        '--server.port=8087',
        '--labflow.test-support=true','--labflow.frontend-origin=http://127.0.0.1:5178',
        "--LABFLOW_AGENT_BASE_URL=http://127.0.0.1:$FixturePort",'--LABFLOW_AGENT_MODEL=labflow-fixture')
    if ($Database -eq 'h2') {
        # desktop profile 提供 H2 数据源与 db/migration-h2 迁移；URL 改指向本次
        # 临时目录下的 labflow_e2e 文件库（TestSupportController 守卫只放行测试库）。
        $h2Path = ($dataDir -replace '\\','/') + '/labflow_e2e'
        $args += @('--spring.profiles.active=desktop',
            "--spring.datasource.url=jdbc:h2:file:$h2Path;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE")
    } else {
        $args += '--spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_e2e'
    }
    Start-Process "$env:JAVA_HOME/bin/java.exe" -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput '.runtime/agent-e2e.stdout.log' -RedirectStandardError '.runtime/agent-e2e.stderr.log'
}
function Wait-AgentTestBackend {
    for ($n=0; $n -lt 60; $n++) {
        $health = & curl.exe --noproxy '*' --max-time 2 -fs 'http://127.0.0.1:8087/api/health' 2>$null
        if ($LASTEXITCODE -eq 0 -and $health) { return }
        Start-Sleep -Milliseconds 500
    }
    throw 'Isolated backend did not start; see .runtime/agent-e2e.stderr.log.'
}
try {
    # Neither fixture process receives a real key. Build output also stays separate from the running app.
    $env:LABFLOW_AGENT_API_KEY = ''
    $env:LABFLOW_FIXTURE_PORT = [string]$FixturePort
    $fixture = Start-Process (Get-Command node.exe).Source -ArgumentList 'frontend/e2e/fixtures/compatible-provider.cjs' -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $backend = Start-AgentTestBackend
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    Wait-AgentTestBackend
    # Ensure an empty test schema has a nonzero cleanup watermark.
    $projects = (& curl.exe --noproxy '*' --max-time 3 -fs 'http://127.0.0.1:8087/api/projects') | ConvertFrom-Json
    if (!$projects.Count) {
        '{"name":"E2E isolated workspace","description":"Test schema only"}' | & curl.exe --noproxy '*' --max-time 3 -fs 'http://127.0.0.1:8087/api/projects' -H 'Content-Type: application/json' --data-binary '@-' | Out-Null
        if ($LASTEXITCODE) { throw 'Cannot seed the isolated workspace.' }
    }
    $env:LABFLOW_API = 'http://127.0.0.1:8087'
    $env:LABFLOW_WEB_URL = 'http://127.0.0.1:5178'
    $env:NO_PROXY = '127.0.0.1,localhost,::1'
    if ($Production) {
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
    & node frontend/e2e/fixtures/audit-restart.cjs verify
    if ($LASTEXITCODE) { throw 'Process restart verification failed.' }
} finally {
    $env:LABFLOW_API = $oldApi
    $env:LABFLOW_WEB_URL = $oldWeb
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    $env:NO_PROXY = $oldNoProxy
    $env:LABFLOW_FIXTURE_PORT = $oldFixturePort
    foreach ($owned in @($backend, $fixture, $ownedWeb)) {
        if ($owned -and !( $owned.HasExited )) { Stop-Process -Id $owned.Id; Wait-Process -Id $owned.Id -ErrorAction SilentlyContinue }
    }
    # 14-1-4.5：H2 临时数据目录在进程停止后整体删除；删不掉只警告，不影响测试结论。
    if ($dataDir -and (Test-Path $dataDir)) {
        try { Remove-Item -Recurse -Force $dataDir -ErrorAction Stop }
        catch { Write-Warning "H2 临时数据目录未删除（可能仍被占用）：$dataDir" }
    }
}
