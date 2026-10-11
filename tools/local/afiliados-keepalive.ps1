param([string]$Distribution = 'Ubuntu')
Set-Location -LiteralPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')))
& wsl.exe -d $Distribution -- bash tools/local/afiliados-keepalive.sh
exit $LASTEXITCODE
