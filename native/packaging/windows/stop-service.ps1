# Asks the per-user Ultimate Keyboards keyboard service to stop remapping and exit, then waits for it.
# Used by the installer (upgrade) and uninstaller. `restart` makes the service send key-up for every key
# it injected, remove its keyboard hook, save "disabled" and exit, so the keys stay normal.
# Always exits 0: the installer follows up with taskkill if the service is still there.
$ErrorActionPreference = 'SilentlyContinue'
$name = 'ultimate-keyboards-remapper-win'
if (-not (Get-Process -Name $name)) { exit 0 }
try {
  $pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'ultimatekeyboards-remapper', [System.IO.Pipes.PipeDirection]::InOut)
  $pipe.Connect(1000)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("{`"version`":1,`"command`":`"restart`"}`n")
  $pipe.Write($bytes, 0, $bytes.Length)
  $pipe.Flush()
  $reader = New-Object System.IO.StreamReader($pipe)
  $null = $reader.ReadLine()
  $pipe.Dispose()
} catch { }
for ($i = 0; $i -lt 30; $i++) {
  if (-not (Get-Process -Name $name)) { break }
  Start-Sleep -Milliseconds 100
}
exit 0
