param(
  [string]$Profile = $env:AWS_PROFILE,
  [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }),
  [string]$SecretId = $(if ($env:PAYPAL_SECRET_NAME) { $env:PAYPAL_SECRET_NAME } else { 'edtech/dev/paypal' }),
  [string]$LocalstackEndpoint = $(
    if ($env:LOCALSTACK_ENDPOINT) { $env:LOCALSTACK_ENDPOINT } else { 'http://localhost:4566' }
  )
)

$ErrorActionPreference = 'Stop'

function Invoke-Aws([string[]]$Arguments) {
  $result = & aws @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "AWS CLI falló con código $LASTEXITCODE."
  }
  return $result
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw 'No se encontró AWS CLI en el PATH.'
}

$globalArgs = @('--region', $Region)
if ($Profile) {
  $globalArgs += @('--profile', $Profile)
}

Write-Host "Leyendo $SecretId desde AWS ($Region)..."
$secret = (Invoke-Aws ($globalArgs + @(
    'secretsmanager', 'get-secret-value',
    '--secret-id', $SecretId,
    '--query', 'SecretString',
    '--output', 'text'
  ))) -join [Environment]::NewLine
$secret = $secret.Trim()

if (-not $secret -or $secret -eq 'None') {
  throw "El secreto $SecretId no tiene SecretString."
}

try {
  $parsed = $secret | ConvertFrom-Json
} catch {
  throw "El secreto $SecretId no contiene JSON válido."
}

foreach ($required in @('clientId', 'clientSecret')) {
  if (-not $parsed.$required) {
    throw "El secreto $SecretId no contiene el campo requerido '$required'."
  }
}

$tempFile = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText(
    $tempFile,
    $secret,
    [System.Text.UTF8Encoding]::new($false)
  )

  $localGlobalArgs = @('--endpoint-url', $LocalstackEndpoint, '--region', $Region)
  $localExists = $true
  & aws @($localGlobalArgs + @('secretsmanager', 'describe-secret', '--secret-id', $SecretId)) *> $null
  if ($LASTEXITCODE -ne 0) {
    $localExists = $false
  }

  if ($localExists) {
    & aws @($localGlobalArgs + @(
        'secretsmanager', 'put-secret-value',
        '--secret-id', $SecretId,
        '--secret-string', "file://$tempFile"
      )) *> $null
  } else {
    & aws @($localGlobalArgs + @(
        'secretsmanager', 'create-secret',
        '--name', $SecretId,
        '--secret-string', "file://$tempFile"
      )) *> $null
  }
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo actualizar el secreto en LocalStack ($LocalstackEndpoint)."
  }
} finally {
  Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Credenciales PayPal sincronizadas en LocalStack: $SecretId"
Write-Host 'Reinicia el contenedor payments para que vuelva a leer el secreto.'
