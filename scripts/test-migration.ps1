param([string]$MySqlBin = '', [switch]$Keep, [int]$DesktopPort = 17870)
$ErrorActionPreference = 'Stop'
# 14-3-4 迁移 E2E：在隔离环境里完整执行「旧版 MySQL → 桌面版 H2」迁移并验收。
# 步骤：清空 labflow_e2e → 起旧版后端(8087) → 种子代表性项目 → 旧库快照(只读校验)
#   → 起桌面版 jar(临时数据目录) → 跑迁移工具(全部成功,退出码 0)
#   → 再跑一次(全部 已迁移,不新建项目) → 篡改一条桌面记录 → --verify 必须失败退出
#   → 旧库快照不变 → Playwright 打开桌面版页面确认图表渲染。
# 绝不触碰真实工作区（8086 / labflow 库）。
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
    throw '找不到 mysql.exe；请用 -MySqlBin 或 $env:LABFLOW_MYSQL_BIN 指定。'
}
$MySqlBin = Resolve-MySqlBin -Explicit $MySqlBin
if (Get-NetTCPConnection -LocalPort 8087 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8087 (isolated old backend) is occupied.' }
if (Get-NetTCPConnection -LocalPort $DesktopPort -State Listen -ErrorAction SilentlyContinue) { throw "Port $DesktopPort (desktop) is occupied." }
if (!(Get-NetTCPConnection -LocalPort 33316 -State Listen -ErrorAction SilentlyContinue)) { throw 'Start the local MySQL instance with scripts/start.ps1 first.' }
$env:JAVA_HOME = (Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$node = (Get-Command node.exe).Source

# 工作目录与证据目录
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidence = Join-Path $root ".runtime/migration-e2e-$stamp"
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$desktopData = Join-Path $root ('.runtime/migration-e2e-data-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $desktopData -Force | Out-Null

# 清空隔离库（10 张表全清，包括 agent_runs / agent_sessions，保证可重复执行）
$oldPassword = $env:MYSQL_PWD
$oldBackend = $null
$desktopBackend = $null
try {
    $env:MYSQL_PWD = 'labflow-root-local'
    "SET FOREIGN_KEY_CHECKS=0; TRUNCATE projects; TRUNCATE datasets; TRUNCATE dataset_versions; TRUNCATE experiments; TRUNCATE experiment_datasets; TRUNCATE charts; TRUNCATE chart_versions; TRUNCATE style_templates; TRUNCATE agent_runs; TRUNCATE agent_sessions; SET FOREIGN_KEY_CHECKS=1;" |
        & "$MySqlBin/mysql.exe" --host=127.0.0.1 --port=33316 --user=root labflow_e2e
    if ($LASTEXITCODE) { throw 'Cannot reset labflow_e2e schema.' }
} finally { $env:MYSQL_PWD = $oldPassword }

try {
    # 旧版后端（当前代码打包；迁移工具只依赖稳定的 GET /projects 与 GET /backup）
    & mvn.cmd -q -f backend/pom.xml package -DskipTests "-Dlabflow.build.directory=$root/.runtime/agent-e2e-build"
    if ($LASTEXITCODE) { throw 'Old-side backend package failed.' }
    $oldBackend = Start-Process "$env:JAVA_HOME/bin/java.exe" -ArgumentList @('-Duser.timezone=UTC','-jar','.runtime/agent-e2e-build/labflow-0.1.0.jar','--server.port=8087','--labflow.frontend-origin=http://127.0.0.1:5178','--spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_e2e','--labflow.test-support=true') -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $evidence 'old-backend.stdout.log') -RedirectStandardError (Join-Path $evidence 'old-backend.stderr.log')
    for ($n=0; $n -lt 120; $n++) {
        if ($oldBackend.HasExited) { throw 'Old backend exited; see evidence logs.' }
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:8087/api/health' -TimeoutSec 2
            if ($health.status -eq 'ok') { break }
        } catch { }
        Start-Sleep -Milliseconds 500
        if ($n -eq 119) { throw 'Old backend did not start.' }
    }

    # 种子：代表性项目（多版本数据集/图表、ROC、混淆矩阵、派生数据、实验+对比快照、
    # 样式模板、归档+特殊字符、接近 64 MiB 的大项目）
    & $node scripts/migration/seed-e2e.cjs --api http://127.0.0.1:8087 --big-mb 30 --out (Join-Path $evidence 'seed.json')
    if ($LASTEXITCODE) { throw 'Representative seeding failed.' }

    # 旧库只读快照（迁移前）
    $oldMysqlBin = $env:LABFLOW_MYSQL_BIN
    $env:MYSQL_PWD = 'labflow-root-local'
    try {
        $env:LABFLOW_MYSQL_BIN = $MySqlBin
        & $node scripts/migration/old-db-check.cjs --out (Join-Path $evidence 'old-db-before.json')
        if ($LASTEXITCODE) { throw 'Old-DB before snapshot failed.' }
    } finally { $env:MYSQL_PWD = $oldPassword; $env:LABFLOW_MYSQL_BIN = $oldMysqlBin }

    # 桌面版（figtide.jar，desktop profile，全新临时数据目录；绝不触碰真实数据目录）
    & (Join-Path $PSScriptRoot 'build-desktop.ps1')
    if ($LASTEXITCODE) { throw 'Desktop package failed.' }
    $desktopBackend = Start-Process "$env:JAVA_HOME/bin/java.exe" -ArgumentList @('-Duser.timezone=UTC','-jar','.runtime/desktop-build/figtide.jar','--spring.profiles.active=desktop',"--labflow.data-dir=$desktopData","--labflow.desktop.port=$DesktopPort",'--labflow.desktop.open-browser=false','--labflow.desktop.tray=false') -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $evidence 'desktop.stdout.log') -RedirectStandardError (Join-Path $evidence 'desktop.stderr.log')
    $desktopUrl = $null
    for ($n=0; $n -lt 120; $n++) {
        if ($desktopBackend.HasExited) { throw 'Desktop backend exited; see evidence logs.' }
        try {
            $record = Get-Content (Join-Path $desktopData 'app.port') -Raw -ErrorAction Stop | ConvertFrom-Json
            $desktopUrl = "http://127.0.0.1:$($record.port)"
            $ping = Invoke-RestMethod "$desktopUrl/api/desktop/ping" -TimeoutSec 2
            if ($ping.instance_id -ne $record.instance_id) { throw 'Desktop identity mismatch' }
            $health = Invoke-RestMethod "$desktopUrl/api/health" -TimeoutSec 2
            if ($health.status -eq 'ok') { break }
        } catch { $desktopUrl = $null }
        Start-Sleep -Milliseconds 500
        if ($n -eq 119) { throw 'Desktop backend did not start.' }
    }
    Write-Host "Desktop side ready: $desktopUrl"

    # 迁移（第一次：全部成功，退出码 0；中文断言在 assert-report.cjs 里做，
    # 因为 PowerShell 5.1 会把无 BOM UTF-8 脚本里的中文字面量错误解码）
    & $node scripts/migration/migrate.cjs --from http://127.0.0.1:8087 --to $desktopUrl --out (Join-Path $evidence 'report-first')
    if ($LASTEXITCODE) { throw "Migration tool exited $LASTEXITCODE (expected 0)." }
    & $node scripts/migration/assert-report.cjs --file (Join-Path (Join-Path $evidence 'report-first') 'migration-report.json') --mode first
    if ($LASTEXITCODE) { throw 'First migration run assertions failed.' }

    # 迁移（第二次：幂等，全部 已迁移，不新建项目）
    $before = Invoke-RestMethod "$desktopUrl/api/projects"
    & $node scripts/migration/migrate.cjs --from http://127.0.0.1:8087 --to $desktopUrl --out (Join-Path $evidence 'report-second')
    if ($LASTEXITCODE) { throw "Idempotent rerun exited $LASTEXITCODE (expected 0)." }
    & $node scripts/migration/assert-report.cjs --file (Join-Path (Join-Path $evidence 'report-second') 'migration-report.json') --mode second
    if ($LASTEXITCODE) { throw 'Idempotent rerun assertions failed.' }
    $after = Invoke-RestMethod "$desktopUrl/api/projects"
    if (@($after).Count -ne @($before).Count) { throw "Rerun changed project count: $(@($before).Count) -> $(@($after).Count)." }

    # 故障路径：篡改一条桌面记录 → --verify 必须失败并给出差异
    & $node scripts/migration/tamper.cjs --api $desktopUrl --project 'rep-experiments'
    if ($LASTEXITCODE) { throw 'Tamper step failed.' }
    & $node scripts/migration/migrate.cjs --from http://127.0.0.1:8087 --to $desktopUrl --verify --out (Join-Path $evidence 'report-verify')
    if ($LASTEXITCODE -eq 0) { throw 'Tampered project verified as clean (expected non-zero exit).' }
    & $node scripts/migration/assert-report.cjs --file (Join-Path (Join-Path $evidence 'report-verify') 'migration-report.json') --mode verify
    if ($LASTEXITCODE) { throw 'Tamper verification assertions failed.' }

    # 旧库只读校验（迁移后快照必须与迁移前一致）
    $oldMysqlBin = $env:LABFLOW_MYSQL_BIN
    $env:MYSQL_PWD = 'labflow-root-local'
    try {
        $env:LABFLOW_MYSQL_BIN = $MySqlBin
        & $node scripts/migration/old-db-check.cjs --out (Join-Path $evidence 'old-db-after.json')
        if ($LASTEXITCODE) { throw 'Old-DB after snapshot failed.' }
    } finally { $env:MYSQL_PWD = $oldPassword; $env:LABFLOW_MYSQL_BIN = $oldMysqlBin }
    $beforeJson = Get-Content (Join-Path $evidence 'old-db-before.json') -Raw
    $afterJson = Get-Content (Join-Path $evidence 'old-db-after.json') -Raw
    $b = $beforeJson | ConvertFrom-Json; $a = $afterJson | ConvertFrom-Json
    if ((ConvertTo-Json $b.counts -Compress) -ne (ConvertTo-Json $a.counts -Compress) -or (ConvertTo-Json $b.checksums -Compress) -ne (ConvertTo-Json $a.checksums -Compress)) {
        throw 'Old database changed during migration (counts/checksums differ).'
    }

    # 浏览器验收：在桌面版页面里打开迁移后的图表
    $oldApi = $env:LABFLOW_API; $oldWeb = $env:LABFLOW_WEB_URL; $oldDesktopMode = $env:LABFLOW_DESKTOP_E2E; $oldNoProxy = $env:NO_PROXY; $oldKey = $env:LABFLOW_AGENT_API_KEY
    try {
        $env:LABFLOW_AGENT_API_KEY = ''
        $env:LABFLOW_API = $desktopUrl
        $env:LABFLOW_WEB_URL = $desktopUrl
        $env:LABFLOW_DESKTOP_E2E = '1'
        $env:LABFLOW_MIGRATION_E2E = '1'
        $env:NO_PROXY = '127.0.0.1,localhost,::1'
        Push-Location frontend
        try { & node node_modules/@playwright/test/cli.js test migration.spec.ts --reporter=list }
        finally { Pop-Location }
        if ($LASTEXITCODE) { throw 'Browser verification failed.' }
    } finally {
        $env:LABFLOW_API = $oldApi; $env:LABFLOW_WEB_URL = $oldWeb; $env:LABFLOW_DESKTOP_E2E = $oldDesktopMode; $env:NO_PROXY = $oldNoProxy; $env:LABFLOW_AGENT_API_KEY = $oldKey
        $env:LABFLOW_MIGRATION_E2E = $null
    }

    # 证据归档（docs/test-evidence，供任务书「带报告样例」）
    New-Item -ItemType Directory -Path (Join-Path $root 'docs/test-evidence') -Force | Out-Null
    Copy-Item (Join-Path (Join-Path $evidence 'report-first') 'migration-report.json') (Join-Path $root 'docs/test-evidence/desktop14-3-migration-first.json') -Force
    Copy-Item (Join-Path (Join-Path $evidence 'report-second') 'migration-report.json') (Join-Path $root 'docs/test-evidence/desktop14-3-migration-second.json') -Force
    Copy-Item (Join-Path (Join-Path $evidence 'report-verify') 'migration-report.json') (Join-Path $root 'docs/test-evidence/desktop14-3-migration-verify.json') -Force
    Copy-Item (Join-Path $evidence 'seed.json') (Join-Path $root 'docs/test-evidence/desktop14-3-migration-seed.json') -Force

    Write-Host ''
    Write-Host 'MIGRATION E2E PASSED: 4/4 成功 → 幂等重跑 → 篡改检出 → 旧库只读 → 浏览器渲染。'
    Write-Host "Evidence: $evidence"
} finally {
    foreach ($owned in @($oldBackend, $desktopBackend)) {
        if ($owned -and !($owned.HasExited)) { Stop-Process -Id $owned.Id; Wait-Process -Id $owned.Id -ErrorAction SilentlyContinue }
    }
    # H2 临时数据目录在进程停止后删除（只删 .runtime 下本脚本创建的叶子目录）
    $resolved = [IO.Path]::GetFullPath($desktopData)
    $allowed = [IO.Path]::GetFullPath((Join-Path $root '.runtime')) + [IO.Path]::DirectorySeparatorChar
    if ($resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf).StartsWith('migration-e2e-data-')) {
        try { Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop }
        catch { Write-Warning "H2 temporary directory preserved: $resolved" }
    }
    if (!$Keep -and (Test-Path $evidence)) {
        # 备份 zip 很大（≈55 MiB），证据 JSON 已复制到 docs/test-evidence；临时目录默认清理。
        try { Remove-Item -LiteralPath $evidence -Recurse -Force -ErrorAction Stop }
        catch { Write-Warning "Evidence directory preserved: $evidence" }
    }
}
