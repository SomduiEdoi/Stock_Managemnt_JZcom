$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$first = Read-Host 'New local admin password (minimum 14 characters)' -AsSecureString
$second = Read-Host 'Confirm password' -AsSecureString
$p1 = [IntPtr]::Zero
$p2 = [IntPtr]::Zero
$previousEncoding = $OutputEncoding
try {
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $p1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
    $p2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p1)
    $confirm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p2)
    if ($value -cne $confirm) { throw 'Passwords do not match.' }
    if ($value.Length -lt 14 -or [Text.Encoding]::UTF8.GetByteCount($value) -gt 72) { throw 'Use at least 14 characters and at most 72 UTF-8 bytes.' }
    @{ password = $value } | ConvertTo-Json -Compress | & node (Join-Path $PSScriptRoot 'local-admin.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Password setup failed.' }
} finally {
    if ($p1 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p1) }
    if ($p2 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p2) }
    $value = $null
    $confirm = $null
    $first.Dispose()
    $second.Dispose()
    $OutputEncoding = $previousEncoding
}
