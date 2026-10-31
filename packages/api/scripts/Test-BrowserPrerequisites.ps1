# Read-only Windows browser-test gate. It never installs extensions or trusts certificates.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ProfileUserDataDirectory,
  [Parameter(Mandatory)][string]$BrowserDiagnosticsRoot,
  [Parameter(Mandatory)][string]$CertificatePath,
  [Parameter(Mandatory)][uri]$Origin,
  [ValidateRange(1,30)][int]$MinimumValidityDays=7
)
$ErrorActionPreference='Stop'
$result=[ordered]@{ObservedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');Extension='NOT VERIFIED';CertificateTrust='NOT VERIFIED';CertificateValidity='NOT VERIFIED';TlsPeer='NOT VERIFIED';Application='NOT VERIFIED';BrowserConnection='CHECK SUPPORTED INVENTORY';BrowserJourney='NOT TESTED';Status='BLOCKED'}
$oldProfile=$env:CODEX_CHROMIUM_USER_DATA_DIR
try {
  if($Origin.Scheme -ne 'https' -or $Origin.Host -notin @('localhost','127.0.0.1','[::1]','::1') -or $Origin.UserInfo -or $Origin.AbsolutePath -ne '/' -or $Origin.Query -or $Origin.Fragment){throw 'Explicit loopback HTTPS origin required'}
  $diagnostic=Join-Path $BrowserDiagnosticsRoot 'scripts/check-extension-installed.js'
  if(!(Test-Path -LiteralPath $diagnostic -PathType Leaf) -or !(Test-Path -LiteralPath $ProfileUserDataDirectory -PathType Container)){throw 'Existing profile and installed official diagnostics required'}
  $env:CODEX_CHROMIUM_USER_DATA_DIR=$ProfileUserDataDirectory
  $raw=& node $diagnostic --browser chrome --json
  $diagnosticExit=$LASTEXITCODE
  $check=$raw|ConvertFrom-Json
  $result.ExtensionDiagnosticExit=$diagnosticExit
  $result.Extension=if($check.installed -and $check.enabled){'READY'}else{'MISSING OR DISABLED'}
  $certificate=[System.Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path -LiteralPath $CertificatePath).Path)
  $result.CertificateSha256=$certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $result.CertificateNotAfterUtc=$certificate.NotAfter.ToUniversalTime().ToString('o')
  $remaining=($certificate.NotAfter.ToUniversalTime()-[DateTime]::UtcNow).TotalDays
  $result.DaysRemaining=[math]::Floor($remaining)
  $result.CertificateValidity=if($certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or $remaining -lt $MinimumValidityDays){'RENEWAL REQUIRED'}else{'READY'}
  $trusted=Get-Item -LiteralPath ('Cert:\CurrentUser\Root\'+$certificate.Thumbprint) -ErrorAction SilentlyContinue
  $result.CertificateTrust=if($trusted){'CURRENT USER TRUSTED'}else{'NOT TRUSTED'}
  $client=[System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect($Origin.DnsSafeHost,$Origin.Port)
    $tls=[System.Net.Security.SslStream]::new($client.GetStream(),$false)
    try {
      # Default platform chain AND hostname validation; no callback or ignore flag.
      $tls.AuthenticateAsClient($Origin.DnsSafeHost)
      $peer=[System.Security.Cryptography.X509Certificates.X509Certificate2]::new($tls.RemoteCertificate)
      if($peer.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256) -ne $result.CertificateSha256){throw 'Unexpected TLS peer certificate'}
      $result.TlsPeer='VERIFIED'
    } finally {if($tls){$tls.Dispose()}}
  } finally {$client.Dispose()}
  $page=Invoke-WebRequest -Uri ($Origin.AbsoluteUri.TrimEnd('/')+'/personal') -TimeoutSec 15 -MaximumRedirection 0
  if($page.StatusCode -ne 200 -or $page.Content -notmatch 'DoğruAdres kişisel çalışma alanı'){throw 'Expected task personal UI is not ready'}
  $result.Application='HTTP READY (NOT BROWSER ACCEPTANCE)'
  if($result.Extension -ne 'READY' -or $result.CertificateValidity -ne 'READY' -or !$trusted -or $diagnosticExit -ne 0){throw 'Browser preparation incomplete; repair through supported setup before testing'}
  $result.Status='PREFLIGHT PASSED'
} catch {$result.Error=$_.Exception.Message} finally {$env:CODEX_CHROMIUM_USER_DATA_DIR=$oldProfile}
$result|ConvertTo-Json -Depth 3
if($result.Status -ne 'PREFLIGHT PASSED'){exit 1}
