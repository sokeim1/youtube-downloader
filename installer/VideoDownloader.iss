#define MyAppName "Video Downloader"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#define MyAppPublisher "Video Downloader"
#define MyAppExeName "VideoDownloader.exe"
#define MyUpdateFeedUrl "https://youtube-downloader-nine-xi.vercel.app/latest.json"

[Setup]
AppId={{6C3DAEA7-1D00-4F1A-9C8E-7F5A0DA50C84}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableWelcomePage=yes
DisableDirPage=no
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
SetupIconFile=..\\desktop\\VideoDownloader.App\\Assets\\app.ico
OutputDir=Output
OutputBaseFilename=VideoDownloaderSetup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "ru"; MessagesFile: "compiler:Languages\\Russian.isl"

[Files]
; Put published files here (dotnet publish -c Release -r win-x64 --self-contained false)
Source: "..\\desktop\\VideoDownloader.App\\bin\\Release\\net8.0-windows10.0.19041.0\\win-x64\\publish\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\\{#MyAppName}"; Filename: "{app}\\{#MyAppExeName}"; Tasks: startmenuicon
Name: "{autodesktop}\\{#MyAppName}"; Filename: "{app}\\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Создать значок на рабочем столе"; GroupDescription: "Значки:"; Flags: unchecked
Name: "startmenuicon"; Description: "Создать значок в меню Пуск"; GroupDescription: "Значки:"; Flags: unchecked

[Run]
Filename: "{app}\\{#MyAppExeName}"; Description: "Запустить {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  Path: string;
begin
  if CurStep = ssInstall then
  begin
    Path := ExpandConstant('{app}\\update-url.txt');
    if not FileExists(Path) then
    begin
      SaveStringToFile(Path, '{#MyUpdateFeedUrl}', False);
    end;
  end;
end;

