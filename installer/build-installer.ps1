param(
  [string]$OverrideVersion = ""
)

$ErrorActionPreference = 'Stop'

$base = [System.IO.Path]::GetFullPath($PSScriptRoot)
$csproj = Join-Path $base '..\desktop\VideoDownloader.App\VideoDownloader.App.csproj'
if (-not (Test-Path -LiteralPath $csproj)) {
  throw "csproj not found: $csproj"
}

function Get-VersionFromCsprojText([string]$text) {
  $m = [regex]::Match($text, '<Version>\s*([^<\s]+)\s*</Version>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Update-PatchVersion([string]$v) {
  $parts = $v.Split('.')
  if ($parts.Count -lt 3) { throw "Invalid Version format in csproj: $v" }
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $patch = [int]$parts[2]
  return "$major.$minor.$($patch + 1)"
}

$csprojText = Get-Content -LiteralPath $csproj -Raw
$currentVer = (Get-VersionFromCsprojText $csprojText).Trim()

$ver = ($OverrideVersion + '').Trim()
if ([string]::IsNullOrWhiteSpace($ver)) {
  if ([string]::IsNullOrWhiteSpace($currentVer)) {
    throw 'Could not read <Version> from csproj.'
  }
  $ver = Update-PatchVersion $currentVer
}

if ([string]::IsNullOrWhiteSpace($ver)) {
  throw "Could not read <Version> from csproj."
}

if ($ver -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
  throw "Invalid Version format: $ver (expected X.Y.Z e.g. 1.0.5)"
}

Write-Host ("Detected app version: $ver")
Write-Host ("Current csproj version: $currentVer")

if (-not [string]::IsNullOrWhiteSpace($currentVer) -and $ver -ne $currentVer) {
  Write-Host ("Updating csproj version: $currentVer -> $ver")

  $newAsm = "$ver.0"
  $csprojText2 = $csprojText
  $rxVersion = New-Object System.Text.RegularExpressions.Regex('<Version>\s*[^<]*\s*</Version>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $rxAsm = New-Object System.Text.RegularExpressions.Regex('<AssemblyVersion>\s*[^<]*\s*</AssemblyVersion>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $rxFile = New-Object System.Text.RegularExpressions.Regex('<FileVersion>\s*[^<]*\s*</FileVersion>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $csprojText2 = $rxVersion.Replace($csprojText2, "<Version>$ver</Version>", 1)
  $csprojText2 = $rxAsm.Replace($csprojText2, "<AssemblyVersion>$newAsm</AssemblyVersion>", 1)
  $csprojText2 = $rxFile.Replace($csprojText2, "<FileVersion>$newAsm</FileVersion>", 1)
  Set-Content -LiteralPath $csproj -Value $csprojText2 -Encoding UTF8

  $afterText = Get-Content -LiteralPath $csproj -Raw
  $afterVer = (Get-VersionFromCsprojText $afterText).Trim()
  if ($afterVer -ne $ver) {
    Write-Host "Regex update did not persist. Falling back to XML update..."

    [xml]$x2 = $afterText
    $pg2 = $x2.Project.PropertyGroup | Where-Object { $_.Version } | Select-Object -First 1
    if (-not $pg2) {
      $pg2 = $x2.Project.PropertyGroup | Select-Object -First 1
    }
    if (-not $pg2) {
      throw "Could not find PropertyGroup in csproj."
    }

    $pg2.Version = $ver
    $pg2.AssemblyVersion = $newAsm
    $pg2.FileVersion = $newAsm
    $x2.Save($csproj)

    $afterText2 = Get-Content -LiteralPath $csproj -Raw
    $afterVer2 = (Get-VersionFromCsprojText $afterText2).Trim()
    if ($afterVer2 -ne $ver) {
      throw "Failed to persist version to csproj. Expected $ver but csproj has $afterVer2"
    }
  }
}

Write-Host "Publishing app..."
& dotnet publish $csproj -c Release -r win-x64 --self-contained false
if ($LASTEXITCODE -ne 0) {
  throw "dotnet publish failed with exit code $LASTEXITCODE"
}

function Find-IsccPath {
  if ($env:ISCC_EXE -and (Test-Path -LiteralPath $env:ISCC_EXE)) {
    return $env:ISCC_EXE
  }

  $cmd = Get-Command iscc.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
    return $cmd.Source
  }

  $cands = @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
  )
  foreach ($c in $cands) {
    if (Test-Path -LiteralPath $c) { return $c }
  }

  $regKeys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1'
  )

  foreach ($k in $regKeys) {
    try {
      $loc = (Get-ItemProperty -Path $k -Name InstallLocation -ErrorAction Stop).InstallLocation
      if ($loc) {
        $cand = Join-Path $loc 'ISCC.exe'
        if (Test-Path -LiteralPath $cand) { return $cand }
      }
    } catch {
    }
  }

  return $null
}

$iscc = Find-IsccPath
if (-not $iscc) {
  throw "Inno Setup ISCC.exe not found. Install Inno Setup 6: https://jrsoftware.org/isinfo.php"
}

$iss = Join-Path $base 'VideoDownloader.iss'
if (-not (Test-Path -LiteralPath $iss)) {
  throw "ISS not found: $iss"
}

& $iscc ("/DMyAppVersion=$ver") $iss
if ($LASTEXITCODE -ne 0) {
  throw "ISCC failed with exit code $LASTEXITCODE"
}
