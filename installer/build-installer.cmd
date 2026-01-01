@echo off
setlocal EnableExtensions DisableDelayedExpansion

chcp 65001 >nul

title Video Downloader - Build Installer

echo ==========================================
echo  Video Downloader - сборка установщика EXE
echo ==========================================
echo.

rem 0) Check dotnet
where dotnet >nul 2>nul
if errorlevel 1 (
  echo ERROR: dotnet не найден.
  echo Установи .NET 8 SDK и попробуй снова:
  echo https://dotnet.microsoft.com/download/dotnet/8.0
  echo.
  pause
  exit /b 1
)

rem 1) Prepare app icon (D:\youtube.png -> Assets\app.ico)
set "ASSETS_DIR=%~dp0..\desktop\VideoDownloader.App\Assets"
if not exist "%ASSETS_DIR%" mkdir "%ASSETS_DIR%" >nul 2>nul

set "ICON_PNG=%ASSETS_DIR%\youtube.png"
if not exist "%ICON_PNG%" (
  if exist "D:\youtube.png" copy /y "D:\youtube.png" "%ICON_PNG%" >nul
)

if not exist "%ICON_PNG%" (
  echo.
  echo ERROR: Не найден файл иконки.
  echo Положи PNG сюда: D:\youtube.png
  echo.
  pause
  exit /b 1
)

set "ICON_ICO=%ASSETS_DIR%\app.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Drawing; $src='%ICON_PNG%'; $dst='%ICON_ICO%'; $bmp=[System.Drawing.Bitmap]::FromFile($src); $res=new-object System.Drawing.Bitmap 256,256; $g=[System.Drawing.Graphics]::FromImage($res); $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.DrawImage($bmp,0,0,256,256); $g.Dispose(); $icon=[System.Drawing.Icon]::FromHandle($res.GetHicon()); $fs=[System.IO.File]::Open($dst,[System.IO.FileMode]::Create); $icon.Save($fs); $fs.Close(); $icon.Dispose(); $res.Dispose(); $bmp.Dispose();" >nul
if errorlevel 1 (
  echo.
  echo ERROR: Не удалось сгенерировать app.ico из PNG.
  echo.
  pause
  exit /b 1
)

rem 2) Build publish output
echo [1/2] Building installer...
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1" -OverrideVersion "%~1"
)
if errorlevel 1 (
  echo.
  echo ERROR: Installer build failed
  echo.
  pause
  exit /b 1
)

echo.
echo DONE.
echo Installer folder: %~dp0Output\
echo.
if exist "%~dp0Output" start "" "%~dp0Output"
pause
