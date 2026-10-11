param(
  [ValidateSet('up','start','status','seed','test','demo','reconnect-test','stop')][string]$Action = 'up',
  [string]$Distribution = 'Ubuntu'
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $taskRoot
$taskStateDir = Join-Path $taskRoot '.local'
$taskKeeperFile = Join-Path $taskStateDir 'affiliates-wsl-keeper.json'
function Get-TaskKeeper {
  if (!(Test-Path -LiteralPath $taskKeeperFile)) { return $null }
  $saved = Get-Content -LiteralPath $taskKeeperFile -Raw | ConvertFrom-Json
  $process = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -in @('pwsh','powershell') -and $process.StartTime.ToUniversalTime().ToString('o') -eq $saved.startedAt) { return $process }
  return $null
}
if ($Action -in @('up','start','seed','test','demo','reconnect-test') -and !(Get-TaskKeeper)) {
  New-Item -ItemType Directory -Path $taskStateDir -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $taskStateDir 'affiliates-wsl.running') -Value 'local-demo'
  $shellPath = (Get-Process -Id $PID).Path
  $keeperScript = Join-Path $PSScriptRoot 'afiliados-keepalive.ps1'
  $keeper = Start-Process $shellPath -ArgumentList @('-NoProfile','-File',('"' + $keeperScript + '"'),'-Distribution',$Distribution) -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
  @{pid=$keeper.Id; startedAt=$keeper.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $taskKeeperFile
}
if ($env:PUBLIC_APP_BASE_URL) {
  & wsl.exe -d $Distribution -- env "PUBLIC_APP_BASE_URL=$($env:PUBLIC_APP_BASE_URL)" bash tools/local/afiliados.sh $Action
} else {
  & wsl.exe -d $Distribution -- bash tools/local/afiliados.sh $Action
}
$result = $LASTEXITCODE
if ($Action -eq 'stop' -and $result -eq 0) {
  $runningFlag = Join-Path $taskStateDir 'affiliates-wsl.running'
  if (Test-Path -LiteralPath $runningFlag) { Remove-Item -LiteralPath $runningFlag }
  if (Test-Path -LiteralPath $taskKeeperFile) { Remove-Item -LiteralPath $taskKeeperFile }
}
exit $result
