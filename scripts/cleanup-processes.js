import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dryRun = process.argv.includes("--dry-run");
const stopAll = process.argv.includes("--all") || process.argv.includes("--force");
const currentPid = process.pid;
const parentPid = process.ppid;

if (process.platform !== "win32") {
  console.log("LoreKeeper cleanup is currently implemented for Windows process trees.");
  process.exit(0);
}

const script = String.raw`
$root = "__ROOT__"
$currentPid = __CURRENT_PID__
$parentPid = __PARENT_PID__
$dryRun = __DRY_RUN__
$stopAll = __STOP_ALL__
$escapedRoot = [regex]::Escape($root)

$repoProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  if ($_.ProcessId -eq $currentPid -or $_.ProcessId -eq $parentPid) { return $false }
  $name = $_.Name
  $cmd = [string]$_.CommandLine
  if ($name -notmatch '^(electron|node|cmd|wscript|cscript)\.exe$') { return $false }
  if ($cmd -match 'node_repl|OpenAI\\Codex') { return $false }
  if ($cmd -match $escapedRoot) { return $true }
  if ($cmd -match 'scripts[\\/]+serve\.js\s+41(7[3-9]|8[0-9]|9[0-2])') { return $true }
  return $false
})

$healthyElectronPids = @(
  $repoProcesses |
    Where-Object { $_.Name -eq 'electron.exe' -and ([string]$_.CommandLine) -match $escapedRoot } |
    Select-Object -ExpandProperty ProcessId
)

$preserved = @()
$targets = $repoProcesses | Where-Object {
  if ($stopAll) { return $true }
  $cmd = [string]$_.CommandLine
  if ($_.Name -eq 'electron.exe') {
    $preserved += $_
    return $false
  }
  if ($_.Name -eq 'node.exe' -and $cmd -match 'scripts[\\/]+serve\.js' -and ($healthyElectronPids -contains $_.ParentProcessId)) {
    $preserved += $_
    return $false
  }
  return $true
}

if ($preserved.Count -gt 0) {
  $preservedRoots = @($preserved | Where-Object { $_.Name -eq 'electron.exe' -and ([string]$_.CommandLine) -match 'electron\.exe \.($| )' })
  $preservedApis = @($preserved | Where-Object { $_.Name -eq 'node.exe' -and ([string]$_.CommandLine) -match 'scripts[\\/]+serve\.js|serve\.js' })
  $preservedRoots | ForEach-Object {
    Write-Output ("Preserved healthy desktop app: {0} {1}" -f $_.ProcessId, $_.CommandLine)
  }
  $preservedApis | ForEach-Object {
    Write-Output ("Preserved owned API server: {0} {1}" -f $_.ProcessId, $_.CommandLine)
  }
  $otherCount = $preserved.Count - $preservedRoots.Count - $preservedApis.Count
  if ($otherCount -gt 0) {
    Write-Output ("Preserved healthy Electron subprocesses: {0}" -f $otherCount)
  }
}

$targets | ForEach-Object {
  Write-Output ("Stopping process: {0} {1} {2}" -f $_.ProcessId, $_.Name, $_.CommandLine)
  if (-not $dryRun) {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
`
  .replace("__ROOT__", rootDir.replace(/"/g, "`\""))
  .replace("__CURRENT_PID__", String(currentPid))
  .replace("__PARENT_PID__", String(parentPid))
  .replace("__DRY_RUN__", dryRun ? "$true" : "$false")
  .replace("__STOP_ALL__", stopAll ? "$true" : "$false");

const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
  cwd: rootDir,
  encoding: "utf8",
  windowsHide: true,
});

if (result.stdout.trim()) {
  console.log(result.stdout.trim());
} else {
  console.log("No LoreKeeper process footprints found.");
}

if (result.stderr.trim()) {
  console.error(result.stderr.trim());
}

process.exit(result.status ?? 0);
