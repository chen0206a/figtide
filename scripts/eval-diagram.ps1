param([ValidateSet('replay','live')][string]$Mode='replay', [string]$MaxCostCny='6', [string]$PricePerMillionCny='8')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location $taskRoot
if(!$env:JAVA_HOME){$env:JAVA_HOME=(Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName}
$env:Path="$env:JAVA_HOME/bin;$env:Path"
$env:LABFLOW_TEST_DB='h2'
$arguments=@('-B','-f','backend/pom.xml','-Dtest=DiagramEvaluationTest')
if($Mode -eq 'live'){
  if(!$env:LABFLOW_AGENT_MODEL -or !$env:LABFLOW_AGENT_BASE_URL){throw 'Live mode needs LABFLOW_AGENT_BASE_URL and LABFLOW_AGENT_MODEL; secrets belong only in environment variables.'}
  $ceiling=0D;$price=0D
  if(![decimal]::TryParse($MaxCostCny,[ref]$ceiling) -or $ceiling -le 0 -or ![decimal]::TryParse($PricePerMillionCny,[ref]$price) -or $price -le 0){throw 'Cost ceiling and price must be positive decimals.'}
  $arguments+=@('-Dlabflow.diagram.eval.live=true',"-Dlabflow.eval.maxCostCny=$MaxCostCny","-Dlabflow.eval.pricePerMillionCny=$PricePerMillionCny")
}
& mvn.cmd @arguments test
if($LASTEXITCODE){throw 'Diagram protocol evaluation failed; preserve the log and local report.'}
Write-Host 'Reports are local only: .runtime/diagram-eval/. Replay is hand-authored protocol, not sampled model quality.'
