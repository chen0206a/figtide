param(
    [ValidateSet('replay', 'live')][string]$Mode = 'replay',
    [string]$Cases = '',
    [string]$Baseline = '',
    [string]$Output = ''
)
$ErrorActionPreference = 'Stop'
$Mode = $Mode.ToLowerInvariant()
$root = Split-Path $PSScriptRoot -Parent
$oldJava = $env:JAVA_HOME
$oldPath = $env:Path
$oldNoProxy = $env:NO_PROXY
# Output and baseline paths resolve from the caller's directory, before Maven changes its basedir.
if (!$Output) { $Output = Join-Path $root ".runtime/agent-eval/$Mode" }
$reportPath = [IO.Path]::GetFullPath($Output)
if ($Baseline) { $Baseline = (Resolve-Path -LiteralPath $Baseline).Path }
if ($Cases -and $Cases -notmatch '^[NRC]\d{2}(,[NRC]\d{2})*$') { throw 'Cases must be comma-separated ids, e.g. N01,R01,C03.' }
if ($Mode -eq 'live' -and !$env:LABFLOW_AGENT_MODEL) { throw 'Live mode needs LABFLOW_AGENT_MODEL and an explicitly configured provider. It may incur API charges.' }
try {
    $jdk = Get-ChildItem (Join-Path $root '.runtime/java') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName; $env:Path = "$env:JAVA_HOME\bin;$env:Path" }
    $env:NO_PROXY = '127.0.0.1,localhost,::1'
    $arguments = @('-B', '-f', (Join-Path $root 'backend/pom.xml'), 'test', '-Dtest=AgentEvaluationTest',
        "-Dlabflow.eval.mode=$Mode", "-Dlabflow.eval.output=$reportPath")
    if ($Mode -eq 'live') { $arguments += '-Dlabflow.eval.live=true' }
    if ($Cases) { $arguments += "-Dlabflow.eval.cases=$Cases" }
    if ($Baseline) { $arguments += "-Dlabflow.eval.baseline=$Baseline" }
    & mvn.cmd @arguments
    if ($LASTEXITCODE) { throw "Evaluation failed; inspect $reportPath.md if it was produced." }
    Write-Host "Evaluation reports: $reportPath.md and $reportPath.json"
} finally {
    $env:JAVA_HOME = $oldJava
    $env:Path = $oldPath
    $env:NO_PROXY = $oldNoProxy
}
