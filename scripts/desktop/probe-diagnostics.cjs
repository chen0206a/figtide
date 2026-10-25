const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function diagnostics(directory) {
  const origin = performance.now();
  const events = [];
  function event(name, detail = {}) {
    const entry = { at: new Date().toISOString(), elapsed_ms: Math.round(performance.now() - origin), event: name, ...detail };
    events.push(entry);
    fs.appendFileSync(path.join(directory, 'events.jsonl'), JSON.stringify(entry) + '\n');
    console.log('[desktop probe] ' + JSON.stringify(entry));
  }
  function command(file, args, output) {
    return new Promise(resolve => execFile(file, args, { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      fs.writeFileSync(path.join(directory, output), `${stdout || ''}\n${stderr || ''}\n${error ? String(error) : ''}`);
      resolve({ output, exit_code: error ? error.code : 0 });
    }));
  }
  async function snapshot(children, app, reason) {
    event('diagnostics-start', { reason });
    const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    const executable = path.join(app, 'FigTide.exe');
    // Restrict command lines to this probe's EXE, never dump unrelated process arguments or environment secrets.
    const ps = `$p = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${executable.replaceAll("'", "''")}' }); $p | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Depth 3`;
    const windows = `
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class ProbeWindows {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, Callback c, IntPtr p);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
'@
$ids = @((Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${executable.replaceAll("'", "''")}' }).ProcessId)
$script:rows = [Collections.Generic.List[object]]::new()
$read = [ProbeWindows+Callback]{param($h,$unused) $s=[Text.StringBuilder]::new(8192); [void][ProbeWindows]::GetWindowText($h,$s,$s.Capacity); if($s.Length){$script:rows.Add($s.ToString())}; return $true}
$top = [ProbeWindows+Callback]{param($h,$unused) [uint32]$owner=0; [void][ProbeWindows]::GetWindowThreadProcessId($h,[ref]$owner); if($ids -contains $owner){[void]$read.Invoke($h,[IntPtr]::Zero); [void][ProbeWindows]::EnumChildWindows($h,$read,[IntPtr]::Zero)}; return $true}
[void][ProbeWindows]::EnumWindows($top,[IntPtr]::Zero)
$script:rows | ConvertTo-Json
`;
    const results = await Promise.all([
      command(path.join(system, 'WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-Command', ps], 'processes.txt'),
      command(path.join(system, 'netstat.exe'), ['-ano', '-p', 'tcp'], 'listeners.txt'),
      command(path.join(system, 'netsh.exe'), ['int', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], 'excluded-ports.txt'),
      command(path.join(system, 'WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-Command', windows], 'native-windows.txt'),
    ]);
    let processes = [];
    try { processes = [].concat(JSON.parse(fs.readFileSync(path.join(directory, 'processes.txt'), 'utf8').trim())); } catch { }
    const localJava = path.join(__dirname, '../../.runtime/java');
    const jdk = process.env.JAVA_HOME || (fs.existsSync(localJava) ? fs.readdirSync(localJava, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(localJava, e.name))[0] : undefined);
    if (jdk && fs.existsSync(path.join(jdk, 'bin/jcmd.exe'))) {
      for (const pid of new Set([...children.map(c => c.pid), ...processes.map(p => p.ProcessId)].filter(Boolean))) {
        results.push(await command(path.join(jdk, 'bin/jcmd.exe'), [String(pid), 'VM.command_line'], `java-command-${pid}.txt`));
      }
    }
    const javaArguments = results.filter(r => r.output.startsWith('java-command-')).map(r => fs.readFileSync(path.join(directory, r.output), 'utf8'));
    fs.writeFileSync(path.join(directory, 'diagnostics.json'), JSON.stringify({ reason, events, commands: results,
      java_arguments_verified: javaArguments.some(text => text.includes('--labflow.desktop.tray=false') && text.includes('--labflow.desktop.open-browser=false')),
      processes: children.map(c => ({ pid: c.pid, running: c.exitCode === null && c.signalCode === null, exit_code: c.exitCode, signal: c.signalCode })) }, null, 2));
    event('diagnostics-complete');
  }
  return { event, snapshot };
}
module.exports = { diagnostics };
