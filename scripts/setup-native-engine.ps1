$ErrorActionPreference = 'Stop'
$TaskRoot = Split-Path -Parent $PSScriptRoot
$TaskNative = Join-Path $TaskRoot '.cache/stockfish-native'
if (-not (Test-Path (Join-Path $TaskNative 'stockfish'))) {
    New-Item -ItemType Directory -Force $TaskNative | Out-Null
    $TaskArchive = Join-Path $TaskRoot '.cache/stockfish-native.zip'
    Invoke-WebRequest 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64-avx2.zip' -OutFile $TaskArchive
    Expand-Archive -LiteralPath $TaskArchive -DestinationPath $TaskNative -Force
}
$TaskBinary = Get-ChildItem -LiteralPath (Join-Path $TaskNative 'stockfish') -Filter '*.exe' | Select-Object -First 1
if (-not $TaskBinary) { throw 'Stockfish bulunamadı.' }
& $TaskBinary.FullName bench 16 1 1 default depth 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Bu işlemci AVX2 motorunu çalıştıramıyor. Tarayıcı motorunu kullan.' }
$TaskNode = (Get-Command node).Source
Start-Process -FilePath $TaskNode -ArgumentList @('server/chess-native-bridge.cjs') -WorkingDirectory $TaskRoot -WindowStyle Hidden
Write-Host 'Yerel motor başlatıldı. Site > Ayarlar > Analiz motoru > Bilgisayarımdaki Stockfish.'
