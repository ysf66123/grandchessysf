$ErrorActionPreference = 'Stop'
$TaskRoot = Split-Path -Parent $PSScriptRoot
$TaskHelper = Join-Path $TaskRoot 'server/chess-native-bridge.cjs'
$TaskNode = (Get-Command node -ErrorAction Stop).Source
$TaskHealth = $null
try { $TaskHealth = Invoke-RestMethod 'http://127.0.0.1:8766/health' -Headers @{Origin='http://localhost';'X-GM-Engine'='1'} -TimeoutSec 2 } catch {}
if ($TaskHealth.ready -and $TaskHealth.review -eq 'native-pool-v1') { return }
$TaskListener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($TaskListener) {
    $TaskProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $TaskListener.OwningProcess)
    if ($TaskHealth.ready -and $TaskProcess.ExecutablePath -eq $TaskNode -and $TaskProcess.CommandLine.Contains($TaskHelper)) {
        Stop-Process -Id $TaskProcess.ProcessId
    } else { throw '8766 portunda başka veya eski bir yardımcı açık. O yardımcıyı kapatıp tekrar başlat.' }
}
Start-Process -FilePath $TaskNode -ArgumentList @('"' + $TaskHelper + '"') -WorkingDirectory $TaskRoot -WindowStyle Hidden
for ($TaskAttempt=0; $TaskAttempt -lt 20; $TaskAttempt++) {
    Start-Sleep -Milliseconds 250
    try { $TaskHealth = Invoke-RestMethod 'http://127.0.0.1:8766/health' -Headers @{Origin='http://localhost';'X-GM-Engine'='1'} -TimeoutSec 1; if ($TaskHealth.ready -and $TaskHealth.review -eq 'native-pool-v1') { return } } catch {}
}
throw 'Yerel analiz hizmeti başlatılamadı.'
