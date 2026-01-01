@echo off
setlocal

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
echo [1/2] Publishing app...
dotnet publish "%~dp0..\desktop\VideoDownloader.App\VideoDownloader.App.csproj" -c Release -r win-x64 --self-contained false
if errorlevel 1 (
  echo.
  echo ERROR: dotnet publish failed
  echo.
  pause
  exit /b 1
)

rem 2) Find Inno Setup compiler (ISCC.exe)
set "ISCC="
for %%G in (iscc.exe) do set "ISCC=%%~$PATH:G"

rem Allow overriding via env var
if not defined ISCC if defined ISCC_EXE set "ISCC=%ISCC_EXE%"

rem Try registry (Inno Setup 6)
if not defined ISCC for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1" /v InstallLocation 2^>nul ^| find /i "InstallLocation"') do if exist "%%BISCC.exe" set "ISCC=%%BISCC.exe"
if not defined ISCC for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1" /v InstallLocation 2^>nul ^| find /i "InstallLocation"') do if exist "%%BISCC.exe" set "ISCC=%%BISCC.exe"

if not defined ISCC if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"

if not defined ISCC (
  echo.
  echo ERROR: Inno Setup не найден.
  echo Установи Inno Setup 6: https://jrsoftware.org/isinfo.php
  echo.
  pause
  exit /b 1
)

echo [2/2] Building installer...
"%ISCC%" "%~dp0VideoDownloader.iss"
if errorlevel 1 (
  echo.
  echo ERROR: ISCC failed
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
