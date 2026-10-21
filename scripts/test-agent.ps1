param([switch]$All, [string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
# Dedicated ports and schema: never redirect or stop the user's running workspace.
foreach ($port in @(8087, 5178, 18769)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Test port $port is already occupied." }
}
if (!(Get-NetTCPConnection -LocalPort 33316 -State Listen -ErrorAction SilentlyContinue)) { throw 'Start the local MySQL instance with scripts/start.ps1 first.' }
$env:JAVA_HOME = (Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$oldPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = 'labflow-root-local'
    "CREATE DATABASE IF NOT EXISTS labflow_e2e CHARACTER SET utf8mb4; GRANT ALL ON labflow_e2e.* TO 'labflow'@'127.0.0.1';" |
        & "$MySqlBin/mysql.exe" --host=127.0.0.1 --port=33316 --user=root
    if ($LASTEXITCODE) { throw 'Cannot prepare isolated labflow_e2e database.' }
} finally { $env:MYSQL_PWD = $oldPassword }
& mvn.cmd -q -f backend/pom.xml package -DskipTests "-Dlabflow.build.directory=$root/.runtime/agent-e2e-build"
if ($LASTEXITCODE) { throw 'Backend package failed.' }
$oldApi = $env:LABFLOW_API
$oldWeb = $env:LABFLOW_WEB_URL
$oldKey = $env:LABFLOW_AGENT_API_KEY
$oldNoProxy = $env:NO_PROXY
$fixture = $null
$backend = $null
try {
    # Neither fixture process receives a real key. Build output also stays separate from the running app.
    $env:LABFLOW_AGENT_API_KEY = ''
    $fixture = Start-Process (Get-Command node.exe).Source -ArgumentList 'frontend/e2e/fixtures/compatible-provider.cjs' -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $backend = Start-Process "$env:JAVA_HOME/bin/java.exe" -ArgumentList '-jar','.runtime/agent-e2e-build/labflow-0.1.0.jar',
        '--server.port=8087','--spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_e2e',
        '--labflow.test-support=true','--labflow.frontend-origin=http://127.0.0.1:5178',
        '--LABFLOW_AGENT_BASE_URL=http://127.0.0.1:18769','--LABFLOW_AGENT_MODEL=labflow-fixture' -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput '.runtime/agent-e2e.stdout.log' -RedirectStandardError '.runtime/agent-e2e.stderr.log'
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    $ready = $false
    for ($n=0; $n -lt 60; $n++) {
        $health = & curl.exe --noproxy '*' --max-time 2 -fs 'http://127.0.0.1:8087/api/health' 2>$null
        if ($LASTEXITCODE -eq 0 -and $health) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'Isolated backend did not start; see .runtime/agent-e2e.stderr.log.' }
    # Ensure an empty test schema has a nonzero cleanup watermark.
    $projects = (& curl.exe --noproxy '*' --max-time 3 -fs 'http://127.0.0.1:8087/api/projects') | ConvertFrom-Json
    if (!$projects.Count) {
        '{"name":"E2E isolated workspace","description":"Test schema only"}' | & curl.exe --noproxy '*' --max-time 3 -fs 'http://127.0.0.1:8087/api/projects' -H 'Content-Type: application/json' --data-binary '@-' | Out-Null
        if ($LASTEXITCODE) { throw 'Cannot seed the isolated workspace.' }
    }
    $env:LABFLOW_API = 'http://127.0.0.1:8087'
    $env:LABFLOW_WEB_URL = 'http://127.0.0.1:5178'
    $env:NO_PROXY = '127.0.0.1,localhost,::1'
    Push-Location frontend
    try {
        if ($All) { & node node_modules/@playwright/test/cli.js test } else { & node node_modules/@playwright/test/cli.js test agent.spec.ts figure-tools.spec.ts }
        if ($LASTEXITCODE) { throw 'Browser verification failed.' }
    } finally { Pop-Location }
} finally {
    $env:LABFLOW_API = $oldApi
    $env:LABFLOW_WEB_URL = $oldWeb
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    $env:NO_PROXY = $oldNoProxy
    foreach ($owned in @($backend, $fixture)) {
        if ($owned -and !( $owned.HasExited )) { Stop-Process -Id $owned.Id; Wait-Process -Id $owned.Id -ErrorAction SilentlyContinue }
    }
}
