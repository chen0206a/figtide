# 任务 14-3-2：旧版（MySQL）→ 桌面版（H2）迁移工具的 PowerShell 包装器。
# 实际逻辑在 scripts/migration/migrate.cjs；这里只负责找到 Node 并透传参数与退出码。
#
# 用法：
#   ./scripts/migrate-to-desktop.ps1 -From http://127.0.0.1:8086 -To http://127.0.0.1:17861 [-DryRun] [-Out <报告目录>] [-Verify]
#
# 设计原则：旧版侧只发 GET（/api/projects、/api/projects/{p}/backup）；
# 不要把 -From 指向真实工作区之外还想当然——工具会拒绝 From==To 和 From 是桌面版的情况。

param(
  [Parameter(Mandatory = $true)][string]$From,
  [Parameter(Mandatory = $true)][string]$To,
  [switch]$DryRun,
  [switch]$Verify,
  [string]$Out
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error '找不到 node（v24），无法运行迁移工具。'
  exit 2
}

$arguments = @("$repo/scripts/migration/migrate.cjs", '--from', $From, '--to', $To)
if ($DryRun) { $arguments += '--dry-run' }
if ($Verify) { $arguments += '--verify' }
if ($Out) { $arguments += @('--out', $Out) }

& node @arguments
exit $LASTEXITCODE
