# End-to-end check of the Windows keyboard service on a real PC, no hands needed (KE-89).
# Runs in the signed-in user's desktop session (Task Scheduler /IT), never over a bare SSH session.
#   powershell -NoProfile -ExecutionPolicy Bypass -File run-e2e.ps1 -Service <e2e exe> -Profile <profile.json> -Out <result.json> [-Suite templates|mac-import]
# Suites: templates = make-profile.ts default (Windows home-row-starter + easy combos);
#         mac-import = the Mac default profile exported and imported with "Import and swap" (make-profile.ts --import).
# The service must be the test-only build (cargo --features e2e): only it acts on keys tagged E2E_TAG.
# Keys go only to this script's own recorder window; focus is checked before every key and the run aborts otherwise.
param(
  [Parameter(Mandatory)] [string] $Service,
  [Parameter(Mandatory)] [string] $Profile,
  [Parameter(Mandatory)] [string] $Out,
  [ValidateSet('templates', 'mac-import')] [string] $Suite = 'templates'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class UkE2E {
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  // Must match native/service-win/src/win/hook.rs E2E_TAG.
  public const ulong E2E_TAG = 0x55554B45;
  public static bool Key(ushort scan, bool up) {
    var i = new INPUT[1];
    i[0].type = 1;
    i[0].u.ki.wScan = scan;
    i[0].u.ki.dwFlags = 0x0008u | (up ? 0x0002u : 0u); // SCANCODE | KEYUP
    i[0].u.ki.dwExtraInfo = new UIntPtr(E2E_TAG);
    return SendInput(1, i, Marshal.SizeOf(typeof(INPUT))) == 1;
  }
}
'@

$pipeName = 'ultimatekeyboards-remapper'
function Send-Request([hashtable] $req) {
  $c = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None, [System.Security.Principal.TokenImpersonationLevel]::Identification)
  $c.Connect(3000)
  $w = New-Object System.IO.StreamWriter($c); $w.AutoFlush = $true
  $r = New-Object System.IO.StreamReader($c)
  $w.WriteLine(($req | ConvertTo-Json -Compress -Depth 20))
  $line = $r.ReadLine()
  $c.Dispose()
  return ($line | ConvertFrom-Json)
}

$result = [ordered]@{ ok = $false; started = (Get-Date).ToString('o'); cases = @(); error = $null; status = $null }
$svc = $null
$form = $null
try {
  if (Get-Process -Name 'ultimate-keyboards-remapper-win' -ErrorAction SilentlyContinue) { throw 'the installed keyboard service is running; stop remapping first' }
  $svc = Start-Process -FilePath $Service -PassThru -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(10)
  do { Start-Sleep -Milliseconds 200; $ready = [System.IO.Directory]::GetFiles('\\.\pipe\') -contains "\\.\pipe\$pipeName" } until ($ready -or (Get-Date) -gt $deadline)
  if (-not $ready) { throw 'test service did not open its pipe' }

  $profileObj = Get-Content $Profile -Raw | ConvertFrom-Json
  $applied = Send-Request @{ version = 1; command = 'apply'; profile = $profileObj; enable = $true }
  if (-not $applied.ok) { throw "apply refused: $($applied.error)" }

  # Recorder window: logs every key Windows delivers, with the modifiers held at that moment.
  $events = New-Object System.Collections.ArrayList
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'Ultimate Keyboards test - please do not type'
  $form.TopMost = $true; $form.KeyPreview = $true; $form.Width = 520; $form.Height = 160
  $box = New-Object System.Windows.Forms.TextBox; $box.Dock = 'Fill'; $box.Multiline = $true; $form.Controls.Add($box)
  $form.Add_KeyDown({ param($s, $e)
    if ($e.KeyCode -notin 'ControlKey','ShiftKey','Menu','LWin','RWin','LControlKey','RControlKey','LShiftKey','RShiftKey') {
      [void]$events.Add([ordered]@{ key = "$($e.KeyCode)"; ctrl = $e.Control; shift = $e.Shift; alt = $e.Alt })
    }
    $e.Handled = $true; $e.SuppressKeyPress = $true
  })
  $form.Show(); $form.Activate(); $box.Focus() | Out-Null
  function Pump([int] $ms) { $until = [DateTime]::UtcNow.AddMilliseconds($ms); do { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 2 } while ([DateTime]::UtcNow -lt $until) }
  Pump 400
  for ($i = 0; $i -lt 10 -and [UkE2E]::GetForegroundWindow() -ne $form.Handle; $i++) { [void][UkE2E]::SetForegroundWindow($form.Handle); $form.Activate(); Pump 200 }
  if ([UkE2E]::GetForegroundWindow() -ne $form.Handle) { throw 'recorder window could not take focus; no keys were sent' }

  $scan = @{ a = 0x1E; d = 0x20; e = 0x12; f = 0x21; h = 0x23; i = 0x17; j = 0x24; k = 0x25; l = 0x26; o = 0x18; u = 0x16; w = 0x11 }
  function K([string] $k, [bool] $up) {
    if ([UkE2E]::GetForegroundWindow() -ne $form.Handle) { throw 'recorder window lost focus; stopped sending keys' }
    if (-not [UkE2E]::Key([uint16]$scan[$k], $up)) { throw "SendInput refused $k" }
  }
  function Tap([string] $k, [int] $hold = 40) { K $k $false; Pump $hold; K $k $true }

  # name, steps, expected keys as KEY[+ctrl|+shift] (letters only, modifier keys themselves are not logged)
  $cases = @(
    @{ name = 'plain typing'; expect = 'H E L L O'; run = { foreach ($c in 'h','e','l','l','o') { Tap $c; Pump 90 } } },
    @{ name = 'tap D types d'; expect = 'D'; run = { Tap 'd' 60 } },
    @{ name = 'hold D is Ctrl'; expect = 'U+ctrl'; run = { K 'd' $false; Pump 320; Tap 'u'; Pump 30; K 'd' $true } },
    @{ name = 'hold K is Ctrl'; expect = 'A+ctrl'; run = { K 'k' $false; Pump 320; Tap 'a'; Pump 30; K 'k' $true } },
    @{ name = 'hold F is Shift'; expect = 'U+shift'; run = { K 'f' $false; Pump 320; Tap 'u'; Pump 30; K 'f' $true } },
    @{ name = 'K+L is Enter'; expect = 'Return'; run = { K 'k' $false; Pump 10; K 'l' $false; Pump 60; K 'k' $true; K 'l' $true } },
    @{ name = 'W+E is Escape'; expect = 'Escape'; run = { K 'w' $false; Pump 10; K 'e' $false; Pump 60; K 'w' $true; K 'e' $true } },
    @{ name = 'I+O is Backspace'; expect = 'Back'; run = { K 'i' $false; Pump 10; K 'o' $false; Pump 60; K 'i' $true; K 'o' $true } },
    @{ name = 'fast typing keeps letters'; expect = 'F J D K'; run = { foreach ($c in 'f','j','d','k') { Tap $c 35; Pump 45 } } }
  )
  if ($Suite -eq 'mac-import') {
    # Mac default: F and J hold Command (copy/paste finger), A and ; hold Control. After the swap F and J hold Ctrl.
    $cases = @(
      @{ name = 'plain typing'; expect = 'H E L L O'; run = { foreach ($c in 'h','e','l','l','o') { Tap $c; Pump 90 } } },
      @{ name = 'tap F types f'; expect = 'F'; run = { Tap 'f' 60 } },
      @{ name = 'hold F (Cmd on the Mac) is Ctrl'; expect = 'U+ctrl'; run = { K 'f' $false; Pump 320; Tap 'u'; Pump 30; K 'f' $true } },
      @{ name = 'hold J (Cmd on the Mac) is Ctrl'; expect = 'A+ctrl'; run = { K 'j' $false; Pump 320; Tap 'a'; Pump 30; K 'j' $true } },
      @{ name = 'hold D is Shift'; expect = 'U+shift'; run = { K 'd' $false; Pump 320; Tap 'u'; Pump 30; K 'd' $true } },
      @{ name = 'K+L is Enter'; expect = 'Return'; run = { K 'k' $false; Pump 10; K 'l' $false; Pump 60; K 'k' $true; K 'l' $true } },
      @{ name = 'W+E is Escape'; expect = 'Escape'; run = { K 'w' $false; Pump 10; K 'e' $false; Pump 60; K 'w' $true; K 'e' $true } },
      @{ name = 'I+O is Backspace'; expect = 'Back'; run = { K 'i' $false; Pump 10; K 'o' $false; Pump 60; K 'i' $true; K 'o' $true } }
    )
  }
  $result.suite = $Suite
  $allOk = $true
  $n = 0
  foreach ($c in $cases) {
    Pump 400  # past the typing-streak window, so each case starts fresh
    if ((++$n % 3) -eq 0) { [void](Send-Request @{ version = 1; command = 'status' }) }  # keep the 15 s lease
    $from = $events.Count
    & $c.run
    Pump 350
    $got = @($events | Select-Object -Skip $from | ForEach-Object { $_.key + $(if ($_.ctrl) { '+ctrl' } elseif ($_.shift) { '+shift' } elseif ($_.alt) { '+alt' } else { '' }) }) -join ' '
    $pass = ($got -eq $c.expect)
    if (-not $pass) { $allOk = $false }
    $result.cases += [ordered]@{ name = $c.name; expect = $c.expect; got = $got; pass = $pass }
  }
  $result.status = (Send-Request @{ version = 1; command = 'status' }).status
  # Remapping off: keys must pass unchanged (fail-open path).
  [void](Send-Request @{ version = 1; command = 'disable' })
  Pump 200
  $from = $events.Count
  K 'd' $false; Pump 320; K 'd' $true; Pump 300
  $after = @($events | Select-Object -Skip $from | ForEach-Object { $_.key + $(if ($_.ctrl) { '+ctrl' } else { '' }) })
  $offOk = ($after.Count -ge 1 -and ($after | Where-Object { $_ -ne 'D' }).Count -eq 0)
  if (-not $offOk) { $allOk = $false }
  $result.cases += [ordered]@{ name = 'after Stop, D is just D'; expect = 'D (repeats allowed)'; got = ($after -join ' '); pass = $offOk }
  $result.ok = $allOk
} catch {
  $result.error = "$_"
} finally {
  if ($form) { $form.Close() }
  if ($svc -and -not $svc.HasExited) { try { [void](Send-Request @{ version = 1; command = 'disable' }) } catch {}; Stop-Process -Id $svc.Id -Force -ErrorAction SilentlyContinue }
  $result.finished = (Get-Date).ToString('o')
  $result | ConvertTo-Json -Depth 6 | Set-Content -Path $Out -Encoding UTF8
}
