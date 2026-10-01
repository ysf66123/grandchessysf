param([switch]$InstallStartup,[switch]$DisableStartup)
$ErrorActionPreference = 'Stop'
$TaskRoot = Split-Path -Parent $PSScriptRoot
$TaskStartup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Grandmaster-Satranc-Motoru.vbs'
if ($DisableStartup) {
    if (Test-Path -LiteralPath $TaskStartup) { Remove-Item -LiteralPath $TaskStartup }
    Write-Host 'Windows açılışında otomatik motor başlatma kapatıldı.'
    exit 0
}
$TaskNative = Join-Path $TaskRoot '.cache/stockfish-native'
if (-not (Test-Path (Join-Path $TaskNative 'stockfish'))) {
    New-Item -ItemType Directory -Force $TaskNative | Out-Null
    $TaskArchive = Join-Path $TaskRoot '.cache/stockfish-native.zip'
    Invoke-WebRequest 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64-avx2.zip' -OutFile $TaskArchive
    Expand-Archive -LiteralPath $TaskArchive -DestinationPath $TaskNative -Force
}
$TaskBinary = Get-ChildItem -LiteralPath (Join-Path $TaskNative 'stockfish') -Filter '*.exe' | Select-Object -First 1
if (-not $TaskBinary) { throw 'Stockfish bulunamadı.' }
$TaskBench = Start-Process -FilePath $TaskBinary.FullName -ArgumentList @('bench','16','1','1','default','depth') -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $TaskNative 'compatibility.stdout.log') -RedirectStandardError (Join-Path $TaskNative 'compatibility.stderr.log')
if ($TaskBench.ExitCode -ne 0) { throw 'Bu işlemci AVX2 motorunu çalıştıramıyor. Tarayıcı motorunu kullan.' }
& (Join-Path $PSScriptRoot 'start-native-engine.ps1')
if ($InstallStartup) {
    $TaskPowerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $TaskStartScript = Join-Path $PSScriptRoot 'start-native-engine.ps1'
    $TaskCommand = '"' + $TaskPowerShell + '" -NoProfile -ExecutionPolicy Bypass -File "' + $TaskStartScript + '"'
    $TaskVbs = 'CreateObject("WScript.Shell").Run "' + $TaskCommand.Replace('"','""') + '", 0, False'
    Set-Content -LiteralPath $TaskStartup -Value $TaskVbs -Encoding Unicode
    Write-Host 'Windows açılışında otomatik başlatma etkin. Kapatmak için SATRANC-YEREL-MOTOR-OTOMATIK-KAPAT.bat kullan.'
}
Write-Host 'Tam Stockfish ve paralel maç analizi hazır. Site ayarlarında Otomatik seçimi kullanabilirsin.'
