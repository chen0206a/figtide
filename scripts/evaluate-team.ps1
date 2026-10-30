param(
    [ValidateSet('replay','live')][string]$Mode='replay',
    [switch]$Live,
    [switch]$NoCostLimit,
    [switch]$UnrestrictedEvaluation,
    [string[]]$Cases,
    [string]$Suite='',
    [decimal]$MaxCostCny=6,
    [decimal]$PricePerMillionCny=8,
    [ValidateRange(1,10)][int]$Repetitions=1,
    [string]$Output='',
    [ValidateSet('mysql','h2')][string]$Database='h2'
)
$ErrorActionPreference='Stop'
if($Mode -eq 'live' -and !$Live){throw 'Live 模式可能计费，必须显式加 -Live；开发验收不要使用此选项。'}
if($Mode -ne 'live' -and $Live){throw '-Live 只能与 -Mode live 一起使用。'}
if($Mode -ne 'live' -and $NoCostLimit){throw '-NoCostLimit 只能与显式 live 模式一起使用。'}
if($UnrestrictedEvaluation -and ($Mode -ne 'live' -or !$Live -or !$NoCostLimit)){throw '-UnrestrictedEvaluation 必须显式指定 -Mode live -Live -NoCostLimit。'}
if($Mode -ne 'live' -and $Repetitions -ne 1){throw '重复试验仅支持 live，原回放保持一遍。'}
if($Suite -and $Mode -ne 'live'){throw '自定义题目集只用于 live 试验（没有录制回放）。'}
if($MaxCostCny -le 0 -or $PricePerMillionCny -le 0){throw '预算上限和假设单价须为正数。'}
foreach($caseId in $Cases){if($caseId -notmatch '^[SMP][0-9]{2}$'){throw 'Cases 仅允许 S01/M01/P01 这样的任务 ID。'}}
$root=Split-Path $PSScriptRoot -Parent
$jdk=Get-ChildItem (Join-Path $root '.runtime/java') -Directory -ErrorAction SilentlyContinue|Select-Object -First 1
$taskOldJava=$env:JAVA_HOME;$taskOldPath=$env:Path;$taskOldDb=$env:LABFLOW_TEST_DB
try{
    if($jdk){$env:JAVA_HOME=$jdk.FullName;$env:Path="$env:JAVA_HOME/bin;$env:Path"}
    $env:LABFLOW_TEST_DB=$Database
    $arguments=@('-B','-f',(Join-Path $root 'backend/pom.xml'),'test','-Dtest=TeamEvaluationTest',"-Dlabflow.team.mode=$Mode")
    if($Cases){$arguments+="-Dlabflow.team.cases=$($Cases -join ',')"}
    if($Suite){$Suite=[IO.Path]::GetFullPath((Join-Path $root $Suite));if(!(Test-Path -LiteralPath $Suite)){throw 'Suite file not found.'};$arguments+="-Dlabflow.team.suite=$Suite"}
    $arguments+="-Dlabflow.team.repetitions=$Repetitions"
    if($Output){$Output=[IO.Path]::GetFullPath($Output);if(Test-Path -LiteralPath $Output){throw 'Output already exists; choose a new trial report path.'};$arguments+="-Dlabflow.team.output=$Output"}
    if($Mode -eq 'live'){
        $arguments+='-Dlabflow.eval.live=true'
        if($NoCostLimit){$arguments+='-Dlabflow.eval.unlimitedCost=true'}
        if($UnrestrictedEvaluation){$arguments+='-Dlabflow.team.unbounded=true'}
        $arguments+="-Dlabflow.eval.maxCostCny=$($MaxCostCny.ToString([Globalization.CultureInfo]::InvariantCulture))"
        $arguments+="-Dlabflow.eval.pricePerMillionCny=$($PricePerMillionCny.ToString([Globalization.CultureInfo]::InvariantCulture))"
    }
    & mvn.cmd @arguments
    if($LASTEXITCODE){throw 'Team evaluation failed; inspect the bounded report in backend/target/agent-eval/team/.'}
    if(!$Output){$Output=Join-Path $root "backend/target/agent-eval/team/$Mode.json"};Write-Output "Report: $Output"
}finally{$env:JAVA_HOME=$taskOldJava;$env:Path=$taskOldPath;$env:LABFLOW_TEST_DB=$taskOldDb}
