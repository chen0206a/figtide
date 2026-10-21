param([string]$BaseUrl = 'https://maas.qianwenaiapi.com/compatible-mode/v1')
# Interactive local bootstrap. The API key is never a command-line argument or file value.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$statusPath = Join-Path $root '.runtime/agent-connection-status.json'
function Write-ConnectionStatus([string]$Phase, [string]$Message) {
    @{phase=$Phase; message=$Message; updated_at=[DateTime]::UtcNow.ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
function Assert-ConnectionAddress([string]$Value) {
    $uri = $null
    if (![Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
        throw 'Use an HTTPS base URL without credentials, query parameters or fragments.'
    }
}
Assert-ConnectionAddress $BaseUrl
New-Item -ItemType Directory -Path (Join-Path $root '.runtime') -Force | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text = 'LabFlow · 模型连接'
$form.ClientSize = New-Object Drawing.Size(620, 405)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI', 10)
function Add-ConnectionLabel([string]$Text, [int]$Y, [int]$Height = 25) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object Drawing.Point(24, $Y)
    $label.Size = New-Object Drawing.Size(572, $Height)
    $form.Controls.Add($label)
}
Add-ConnectionLabel '连接到所选模型服务' 20
Add-ConnectionLabel 'API 地址（密钥只会交给此服务；图表请求由你在工作台发起）' 55
$address = New-Object Windows.Forms.TextBox
$address.Location = New-Object Drawing.Point(24, 82)
$address.Size = New-Object Drawing.Size(572, 30)
$address.Text = $BaseUrl
$address.ReadOnly = $true
$form.Controls.Add($address)
Add-ConnectionLabel '模型 ID · 请填写服务控制台中的准确名称' 124
$model = New-Object Windows.Forms.TextBox
$model.Location = New-Object Drawing.Point(24, 151)
$model.Size = New-Object Drawing.Size(572, 30)
$form.Controls.Add($model)
Add-ConnectionLabel 'API Key · 隐藏输入，不写入聊天、文件或 Git' 194
$key = New-Object Windows.Forms.TextBox
$key.Location = New-Object Drawing.Point(24, 221)
$key.Size = New-Object Drawing.Size(572, 30)
$key.UseSystemPasswordChar = $true
$form.Controls.Add($key)
Add-ConnectionLabel "仅加载到本次后端进程，重启后需重新填写。`n此操作重启 LabFlow 后端，不调用模型、不上传实验数据、不计费。" 272 52
$connect = New-Object Windows.Forms.Button
$connect.Text = '连接并重启后端'
$connect.Location = New-Object Drawing.Point(383, 345)
$connect.Size = New-Object Drawing.Size(213, 38)
$form.Controls.Add($connect)
$cancel = New-Object Windows.Forms.Button
$cancel.Text = '取消'
$cancel.Location = New-Object Drawing.Point(263, 345)
$cancel.Size = New-Object Drawing.Size(100, 38)
$cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancel)
$form.CancelButton = $cancel
$form.AcceptButton = $connect
$connect.Add_Click({
    if (!$model.Text.Trim() -or $model.Text.Trim().Length -gt 200 -or
        $model.Text.Trim() -notmatch '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' -or
        !$key.Text.Trim() -or $key.Text -match '[\r\n]') {
        [Windows.Forms.MessageBox]::Show($form, '请填写准确的模型 ID 和单行 API Key。', 'LabFlow') | Out-Null
        return
    }
    $form.DialogResult = [Windows.Forms.DialogResult]::OK
    $form.Close()
})
Write-ConnectionStatus 'awaiting_input' 'Waiting for local masked model/key input. No model request sent.'
$selected = $form.ShowDialog()
if ($selected -ne [Windows.Forms.DialogResult]::OK) {
    $key.Clear()
    $form.Dispose()
    Write-ConnectionStatus 'cancelled' 'Cancelled. Backend configuration unchanged.'
    exit
}
$chosenModel = $model.Text.Trim()
$chosenKey = $key.Text.Trim()
$key.Clear()
$form.Dispose()
$oldBase = $env:LABFLOW_AGENT_BASE_URL
$oldModel = $env:LABFLOW_AGENT_MODEL
$oldKey = $env:LABFLOW_AGENT_API_KEY
$client = $null
try {
    $statePath = Join-Path $root '.runtime/processes.json'
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $jdk = Get-ChildItem -LiteralPath (Join-Path $root '.runtime/java') -Directory | Select-Object -First 1
    $jar = Join-Path $root 'backend/target/labflow-0.1.0.jar'
    if (!$jdk -or !(Test-Path -LiteralPath $jar)) { throw 'Backend runtime missing.' }
    $owner = Get-NetTCPConnection -LocalPort 8086 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($owner) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($owner.OwningProcess)"
        if ($owner.OwningProcess -ne $state.backend -or !$process -or
            !$process.CommandLine.Contains('backend/target/labflow-0.1.0.jar')) {
            throw 'Refusing to stop an untracked backend.'
        }
        Stop-Process -Id $owner.OwningProcess
        Wait-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
    }
    Write-ConnectionStatus 'starting' 'Loading configuration into the backend process. No model request sent.'
    # Only this Java child inherits the key. Existing frontend/MySQL processes stay untouched.
    $env:LABFLOW_AGENT_BASE_URL = $BaseUrl.TrimEnd('/')
    $env:LABFLOW_AGENT_MODEL = $chosenModel
    $env:LABFLOW_AGENT_API_KEY = $chosenKey
    $backend = Start-Process (Join-Path $jdk.FullName 'bin/java.exe') -ArgumentList '-jar','backend/target/labflow-0.1.0.jar' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root '.runtime/backend.stdout.log') -RedirectStandardError (Join-Path $root '.runtime/backend.stderr.log')
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    $chosenKey = $null
    $state.backend = $backend.Id
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(2)
    $ready = $false
    for ($n=0; $n -lt 60; $n++) {
        if ($backend.HasExited) { break }
        try {
            $public = $client.GetStringAsync('http://127.0.0.1:8086/api/agent/provider').GetAwaiter().GetResult() | ConvertFrom-Json
            if ($public.available -and $public.model -eq $chosenModel) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'Backend configuration did not become available.' }
    Write-ConnectionStatus 'configured' 'Configuration loaded. No inference request sent; provider compatibility not yet verified.'
    [Windows.Forms.MessageBox]::Show('配置已加载。回到绘图编辑器，打开「绘图助手」即可查看。尚未向模型发起请求；生成提案时可能计费。', 'LabFlow · 已连接配置') | Out-Null
} catch {
    # Avoid forwarding exception bodies, URLs, headers, or input values to logs/status/UI.
    Write-ConnectionStatus 'failed' 'Cannot load configuration. Check owned backend process and local runtime logs; credentials were not saved.'
    [Windows.Forms.MessageBox]::Show('配置加载失败。请检查 LabFlow 后端进程与本机运行环境。密钥未写入文件。', 'LabFlow') | Out-Null
} finally {
    $env:LABFLOW_AGENT_BASE_URL = $oldBase
    $env:LABFLOW_AGENT_MODEL = $oldModel
    $env:LABFLOW_AGENT_API_KEY = $oldKey
    $chosenKey = $null
    if ($client) { $client.Dispose() }
}
