#Requires -Version 5.1
<#
  Веб-установщик Nova: скачивает программу по URL и ставит на ПК.
  Запуск: Install-Nova.bat или powershell -ExecutionPolicy Bypass -File install-nova.ps1
#>
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'install-config.json'),
  [string]$LocalReleaseDir = (Join-Path $PSScriptRoot 'releases')
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Expand-EnvPath([string]$Path) {
  if (-not $Path) { return $null }
  [Environment]::ExpandEnvironmentVariables($Path)
}

function Get-Config {
  if (-not (Test-Path $ConfigPath)) {
    throw "Не найден конфиг: $ConfigPath"
  }
  $raw = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  return $raw
}

function Resolve-DownloadUrl($cfg) {
  if ($env:NOVA_DOWNLOAD_URL) {
    return $env:NOVA_DOWNLOAD_URL.Trim()
  }
  if ($cfg.mode -eq 'portable') {
    $url = $cfg.portableZipUrl
    if (-not $url -or $url -match 'ВАШ-СЕРВЕР') {
      throw "В install-config.json укажите portableZipUrl или задайте переменную NOVA_DOWNLOAD_URL"
    }
    return $url
  }
  $url = $cfg.downloadUrl
  if (-not $url -or $url -match 'ВАШ-СЕРВЕР') {
    throw "В install-config.json укажите downloadUrl или задайте переменную NOVA_DOWNLOAD_URL"
  }
  return $url
}

function Get-LocalReleaseFile($cfg) {
  if (-not (Test-Path $LocalReleaseDir)) { return $null }
  if ($cfg.mode -eq 'portable') {
    $name = if ($cfg.portableZipFileName) { $cfg.portableZipFileName } else { 'nova-portable.zip' }
    $path = Join-Path $LocalReleaseDir $name
  } else {
    $name = if ($cfg.setupFileName) { $cfg.setupFileName } else { 'Nova-Setup.exe' }
    $path = Join-Path $LocalReleaseDir $name
    if (-not (Test-Path $path)) {
      $fallback = Get-ChildItem -Path $LocalReleaseDir -Filter 'Nova Setup*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($fallback) { return $fallback.FullName }
    }
  }
  if (Test-Path $path) { return $path }
  return $null
}

function Download-File([string]$Url, [string]$Dest) {
  Write-Step "Скачивание: $Url"
  $dir = Split-Path $Dest -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
    try {
      Start-BitsTransfer -Source $Url -Destination $Dest -Description 'Nova download'
      return
    } catch {
      Write-Host "BITS недоступен, пробую Invoke-WebRequest..." -ForegroundColor Yellow
    }
  }
  $progressPreference = 'Continue'
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

function Install-Setup([string]$SetupPath, $cfg) {
  Write-Step "Установка Nova..."
  $args = @()
  if ($cfg.silentSetup -eq $true) {
    $args += '/S'
  }
  $installDir = Expand-EnvPath $cfg.installDir
  if ($installDir -and $cfg.silentSetup -eq $true) {
    $args += "/D=$installDir"
  }
  $proc = Start-Process -FilePath $SetupPath -ArgumentList $args -PassThru -Wait
  if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne $null) {
    throw "Установщик завершился с кодом $($proc.ExitCode)"
  }
}

function Install-Portable([string]$ZipPath, $cfg) {
  $installDir = Expand-EnvPath $cfg.installDir
  if (-not $installDir) {
    $installDir = Join-Path $env:LOCALAPPDATA 'Nova'
  }
  Write-Step "Распаковка в $installDir"
  if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Expand-Archive -Path $ZipPath -DestinationPath $installDir -Force
  $exe = Get-ChildItem -Path $installDir -Filter 'Nova.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exe) {
    throw "После распаковки не найден Nova.exe"
  }
  if ($exe.DirectoryName -ne $installDir) {
    Get-ChildItem -Path $exe.DirectoryName | Move-Item -Destination $installDir -Force
  }
  return (Join-Path $installDir 'Nova.exe')
}

function New-DesktopShortcut([string]$TargetExe) {
  if (-not (Test-Path $TargetExe)) { return }
  $wsh = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $desktop 'Nova.lnk'
  $sc = $wsh.CreateShortcut($lnk)
  $sc.TargetPath = $TargetExe
  $sc.WorkingDirectory = Split-Path $TargetExe -Parent
  $sc.Description = 'Nova Messenger'
  $sc.Save()
  Write-Host "Ярлык на рабочем столе: $lnk" -ForegroundColor Green
}

function Find-InstalledExe($cfg) {
  $candidates = @(
    (Join-Path ${env:ProgramFiles} 'Nova\Nova.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Nova\Nova.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Nova\Nova.exe'),
    (Join-Path (Expand-EnvPath $cfg.installDir) 'Nova.exe')
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

try {
  Write-Host "========================================" -ForegroundColor White
  Write-Host "  Nova — установка с интернета" -ForegroundColor White
  Write-Host "========================================" -ForegroundColor White

  $cfg = Get-Config
  $tempDir = Join-Path $env:TEMP ('nova-install-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

  $localFile = Get-LocalReleaseFile $cfg
  $artifactPath = $null

  if ($localFile) {
    Write-Step "Локальная копия (без интернета): $localFile"
    $artifactPath = Join-Path $tempDir (Split-Path $localFile -Leaf)
    Copy-Item -Path $localFile -Destination $artifactPath -Force
  } else {
    $url = Resolve-DownloadUrl $cfg
    if ($cfg.mode -eq 'portable') {
      $fileName = if ($cfg.portableZipFileName) { $cfg.portableZipFileName } else { 'nova-portable.zip' }
    } else {
      $fileName = if ($cfg.setupFileName) { $cfg.setupFileName } else { 'Nova-Setup.exe' }
    }
    $artifactPath = Join-Path $tempDir $fileName
    Download-File $url $artifactPath
  }

  $exeToRun = $null
  if ($cfg.mode -eq 'portable') {
    $exeToRun = Install-Portable $artifactPath $cfg
  } else {
    Install-Setup $artifactPath $cfg
    Start-Sleep -Seconds 2
    $exeToRun = Find-InstalledExe $cfg
    if (-not $exeToRun) {
      Write-Host "Установка завершена. Запустите Nova из меню Пуск." -ForegroundColor Yellow
    }
  }

  if ($cfg.createDesktopShortcut -eq $true -and $exeToRun) {
    New-DesktopShortcut $exeToRun
  }

  Write-Host ""
  Write-Host "Готово! Nova установлена." -ForegroundColor Green
  if ($exeToRun) {
    Write-Host "Путь: $exeToRun" -ForegroundColor Gray
    if ($cfg.runAfterInstall -eq $true) {
      Write-Step "Запуск Nova..."
      Start-Process -FilePath $exeToRun
    }
  } else {
    Write-Host "Запустите Nova из меню Пуск." -ForegroundColor Yellow
  }
}
catch {
  Write-Host ""
  Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Подсказка:" -ForegroundColor Yellow
  Write-Host "  1) На этом ПК: build-web-installer.bat — собрать и положить файлы в installer\releases\"
  Write-Host "  2) Загрузите installer\releases\ на файлообменник / свой сервер"
  Write-Host "  3) В installer\install-config.json укажите downloadUrl"
  Write-Host "  4) Или положите releases рядом с установщиком — тогда интернет не нужен"
  exit 1
}
finally {
  if ($tempDir -and (Test-Path $tempDir)) {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
