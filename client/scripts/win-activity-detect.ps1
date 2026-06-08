$ErrorActionPreference = 'SilentlyContinue'

function Await-WinRT {
  param($WinRTTask, [Type]$ResultType)
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRTTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

$script:NonGameProcesses = @(
  'explorer','SearchHost','ShellExperienceHost','StartMenuExperienceHost',
  'ApplicationFrameHost','SystemSettings','TextInputHost','RuntimeBroker',
  'dllhost','sihost','taskhostw','ctfmon','LockApp','SecurityHealthSystray',
  'PhoneExperienceHost','WidgetService','Widgets','msedgewebview2',
  'chrome','msedge','firefox','opera','brave','vivaldi',
  'Discord','Telegram','Slack','Teams','Cursor','Code',
  'electron','nova','Nova','Spotify','MusicBee','AIMP','vlc',
  'notepad','WINWORD','EXCEL','POWERPNT','OUTLOOK','OneDrive',
  'steam','EpicGamesLauncher','Battle.net','GalaxyClient',
  'SearchUI','SystemSettingsAdminFlows','ShellHost'
)

$script:GameProcessHints = @(
  'cs2','csgo','dota2','minecraft','javaw','GTA5','RocketLeague',
  'FortniteClient','VALORANT','League of Legends','RiotClientServices',
  'Overwatch','RainbowSix','PUBG','Terraria','Stardew Valley',
  'eldenring','Cyberpunk2077','witcher3','Skyrim','Fallout4',
  'Warframe','Destiny2','Apex','r5apex','HoYoPlay','GenshinImpact',
  'RobloxPlayerBeta','Among Us','Palworld','Helldivers2','TslGame'
)

function Test-IsLikelyGame {
  param([string]$ProcessName, [string]$WindowTitle)
  $base = ($ProcessName -replace '\.exe$','').Trim()
  if (-not $base) { return $false }
  if ($script:NonGameProcesses -contains $base) { return $false }
  $lower = $base.ToLowerInvariant()
  foreach ($hint in $script:GameProcessHints) {
    if ($lower -like "*$($hint.ToLowerInvariant())*") { return $true }
  }
  if ($base -match 'game|unity|unreal') { return $true }
  if ($WindowTitle -and $WindowTitle.Length -gt 2) {
    if ($WindowTitle -match 'microsoft|windows|settings|nova|discord|telegram|cursor|chrome|edge') { return $false }
    if ($WindowTitle.ToLowerInvariant().Contains($lower) -or $base.Length -ge 6) { return $true }
  }
  return $false
}

function Find-RunningGame {
  foreach ($procName in $script:GameProcessHints) {
    $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
      $wt = $p.MainWindowTitle
      if ([string]::IsNullOrWhiteSpace($wt)) {
        $wt = $p.ProcessName
      }
      if (Test-IsLikelyGame ($p.ProcessName + '.exe') $wt) {
        return @{
          processName = $p.ProcessName + '.exe'
          windowTitle = $wt
        }
      }
    }
  }
  return $null
}

# Foreground window
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Foreground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$game = $null
try {
  $hwnd = [Win32Foreground]::GetForegroundWindow()
  if ($hwnd -ne [IntPtr]::Zero) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][Win32Foreground]::GetWindowText($hwnd, $sb, 512)
    $title = $sb.ToString()
    [uint32]$processId = 0
    [void][Win32Foreground]::GetWindowThreadProcessId($hwnd, [ref]$processId)
    if ($processId -gt 0) {
      $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($proc) {
        $candidate = @{
          processName = $proc.ProcessName + '.exe'
          windowTitle = $title
        }
        if (Test-IsLikelyGame $candidate.processName $candidate.windowTitle) {
          $game = $candidate
        }
      }
    }
  }
} catch {}

# Nova/Cursor на переднем плане — ищем запущенную игру в фоне
if (-not $game) {
  $game = Find-RunningGame
}

$media = @()
$currentPosMs = 0
$currentDurMs = 0

function Add-MediaItem {
  param($title, $artist, $appId, $posMs, $durMs, $isPlaying, $isVideo, $artworkBase64)
  if ([string]::IsNullOrWhiteSpace($title)) { return }
  $script:media += @{
    title = $title.Trim()
    artist = $(if ($artist) { $artist.Trim() } else { '' })
    albumArtist = ''
    appId = $appId
    sourceApp = $appId
    positionMs = [int64]$posMs
    durationMs = [int64]$durMs
    playbackStatus = $(if ($isPlaying) { 'Playing' } else { 'Paused' })
    isPlaying = [bool]$isPlaying
    isVideo = [bool]$isVideo
    artworkBase64 = $(if ($artworkBase64) { $artworkBase64 } else { '' })
  }
}

# --- System Media Transport Controls (Spotify, браузер, YouTube и т.д.) ---
try {
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media, ContentType=WindowsRuntime]
  [void][Windows.Media.SystemMediaTransportControlsTimelineProperties, Windows.Media, ContentType=WindowsRuntime]
  [void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]

  $manager = $null
  try {
    $manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::GetForCurrentUser()
  } catch {
    $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  }

  if ($manager) {
    $currentSession = $null
    try { $currentSession = $manager.GetCurrentSession() } catch {}
    if ($currentSession) {
      try {
        $currentTimeline = Await-WinRT ($currentSession.GetTimelineProperties()) ([Windows.Media.SystemMediaTransportControlsTimelineProperties])
        if ($currentTimeline) {
          $currentPosMs = [int64]$currentTimeline.Position.TotalMilliseconds
          $startMs = [int64]$currentTimeline.StartTime.TotalMilliseconds
          $endMs = [int64]$currentTimeline.EndTime.TotalMilliseconds
          $currentDurMs = [Math]::Max(0, $endMs - $startMs)
          if ($currentDurMs -le 0 -and $endMs -gt $currentPosMs) { $currentDurMs = [int64]($endMs - $currentPosMs) }
          if ($currentDurMs -le 0 -and $endMs -gt 0) { $currentDurMs = $endMs }
        }
      } catch {}
    }

    $sessions = @($manager.GetSessions())
    if ($currentSession -and ($sessions | Where-Object { $_ -eq $currentSession }).Count -eq 0) {
      $sessions = @($currentSession) + $sessions
    }

    foreach ($session in $sessions) {
      try {
        $props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        if (-not $props -or [string]::IsNullOrWhiteSpace($props.Title)) { continue }

        $title = $props.Title
        $artist = ''
        if ($props.Artist) { $artist = $props.Artist.Trim() }
        if ($props.Subtitle -and $props.Subtitle.Trim()) {
          $sub = $props.Subtitle.Trim()
          if ($artist -and $sub -ne $artist -and $artist -notlike "*$sub*") {
            $artist = "$artist, $sub"
          } elseif (-not $artist) { $artist = $sub }
        }
        if ($props.AlbumArtist -and $props.AlbumArtist.Trim()) {
          $aa = $props.AlbumArtist.Trim()
          if ($artist -and $artist -ne $aa -and $artist -notlike "*$aa*") {
            $artist = "$artist, $aa"
          } elseif (-not $artist) { $artist = $aa }
        }

        $playback = $session.GetPlaybackInfo()
        $status = [string]$playback.PlaybackStatus
        $isPlaying = ($status -eq 'Playing')

        $posMs = 0
        $durMs = 0
        try {
          $timeline = Await-WinRT ($session.GetTimelineProperties()) ([Windows.Media.SystemMediaTransportControlsTimelineProperties])
          if ($timeline) {
            $posMs = [int64]$timeline.Position.TotalMilliseconds
            $startMs = [int64]$timeline.StartTime.TotalMilliseconds
            $endMs = [int64]$timeline.EndTime.TotalMilliseconds
            $durMs = [Math]::Max(0, $endMs - $startMs)
            if ($durMs -le 0 -and $endMs -gt $posMs) { $durMs = [int64]($endMs - $posMs) }
            if ($durMs -le 0 -and $endMs -gt 0) { $durMs = $endMs }
          }
        } catch {}

        # Текущая сессия Windows — надёжный источник позиции при открытии Nova
        if ($posMs -le 0 -and $currentPosMs -gt 0) {
          $sameSession = ($null -ne $currentSession -and $session -eq $currentSession)
          if (-not $sameSession) {
            try {
              $sid = $session.SourceAppUserModelId
              $cid = $currentSession.SourceAppUserModelId
              if ($sid -and $cid -and $sid -eq $cid) { $sameSession = $true }
            } catch {}
          }
          if ($sameSession -or ($isPlaying -and $status -eq 'Playing')) {
            $posMs = $currentPosMs
            if ($durMs -le 0 -and $currentDurMs -gt 0) { $durMs = $currentDurMs }
          }
        }

        $appId = ''
        try { $appId = $session.SourceAppUserModelId } catch {}

        $isVideo = $false
        try {
          if ($props.PlaybackType -eq [Windows.Media.MediaPlaybackType]::Video) { $isVideo = $true }
        } catch {}

        $artworkBase64 = ''
        try {
          $thumbRef = $props.Thumbnail
          if ($thumbRef) {
            $streamRef = Await-WinRT ($thumbRef.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $ms = New-Object System.IO.MemoryStream
            $streamRef.AsStreamForRead().CopyTo($ms)
            $bytes = $ms.ToArray()
            if ($bytes.Length -gt 0 -and $bytes.Length -lt 250000) {
              $artworkBase64 = [Convert]::ToBase64String($bytes)
            }
          }
        } catch {}

        Add-MediaItem -title $title -artist $artist -appId $appId -posMs $posMs -durMs $durMs -isPlaying $isPlaying -isVideo $isVideo -artworkBase64 $artworkBase64
      } catch {}
    }
  }
} catch {}

# Повторная попытка получить позицию текущего трека (Spotify иногда отдаёт с задержкой)
if ($currentPosMs -le 0) {
  try {
    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime]
    [void][Windows.Media.SystemMediaTransportControlsTimelineProperties, Windows.Media, ContentType=WindowsRuntime]
    $mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::GetForCurrentUser()
    if ($mgr) {
      $cs = $null
      try { $cs = $mgr.GetCurrentSession() } catch {}
      if ($cs) {
        $tl = Await-WinRT ($cs.GetTimelineProperties()) ([Windows.Media.SystemMediaTransportControlsTimelineProperties])
        if ($tl) {
          $currentPosMs = [int64]$tl.Position.TotalMilliseconds
          $startMs = [int64]$tl.StartTime.TotalMilliseconds
          $endMs = [int64]$tl.EndTime.TotalMilliseconds
          $currentDurMs = [Math]::Max(0, $endMs - $startMs)
          if ($currentDurMs -le 0 -and $endMs -gt $currentPosMs) { $currentDurMs = [int64]($endMs - $currentPosMs) }
          if ($currentDurMs -le 0 -and $endMs -gt 0) { $currentDurMs = $endMs }
        }
      }
    }
  } catch {}
}

# --- Fallback: заголовок окна Spotify / Yandex Music (если SMTC без метаданных) ---
$windowFallback = $null
$musicProcs = @('Spotify', 'YandexMusic', 'AIMP', 'MusicBee', 'iTunes', 'GrooveMusic')
foreach ($procName in $musicProcs) {
  $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    $wt = $p.MainWindowTitle
    if ([string]::IsNullOrWhiteSpace($wt)) { continue }
    if ($wt -match '^(Spotify Premium|Spotify Free|Spotify)$') { continue }
    if ($wt -match '^(Yandex Music)$') { continue }

    $title = $wt
    $artist = ''
    if ($wt -match '^(.+?)\s*[–—\-•]\s*(.+)$') {
      $a = $matches[1].Trim()
      $b = $matches[2].Trim()
      if ($procName -eq 'Spotify') {
        $artist = $a
        $title = $b
      } else {
        $title = $a
        $artist = $b
      }
    }
    $windowFallback = @{
      title = $title
      artist = $artist
      appId = $procName
    }
    break
  }
  if ($windowFallback) { break }
}

if ($media.Count -eq 0 -and $windowFallback) {
  $posMs = $(if ($currentPosMs -gt 0) { $currentPosMs } else { 0 })
  $durMs = $(if ($currentDurMs -gt 0) { $currentDurMs } else { 0 })
  Add-MediaItem -title $windowFallback.title -artist $windowFallback.artist -appId $windowFallback.appId -posMs $posMs -durMs $durMs -isPlaying $true -isVideo $false -artworkBase64 ''
} elseif ($currentPosMs -gt 0) {
  # SMTC есть, но без позиции — подставляем время из текущей сессии
  for ($i = 0; $i -lt $media.Count; $i++) {
    if ([int64]$media[$i].positionMs -le 0) {
      $media[$i].positionMs = $currentPosMs
      if ([int64]$media[$i].durationMs -le 0 -and $currentDurMs -gt 0) {
        $media[$i].durationMs = $currentDurMs
      }
    }
  }
}

@{
  game = $game
  media = $media
} | ConvertTo-Json -Depth 5 -Compress
