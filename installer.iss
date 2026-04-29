; ============================================================
;  Fritlaegning — Inno Setup installer script
;  Requires: Inno Setup 6.x  (https://jrsoftware.org/isdl.php)
;
;  Before compiling:
;    1. Run build.bat so dist\Fritlaegning\ exists
;    2. Open this file in Inno Setup Compiler (Ctrl+F9 to build)
; ============================================================

#define AppName      "Fritlaegning"
#define AppNameSafe  "Fritlaegning"
#define AppVersion   "1.0"
#define AppExe       "Fritlaegning.exe"
#define AppPublisher "Duality"

[Setup]
AppId={{A3F2B8C1-4D7E-4A09-B6F3-1234567890AB}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://github.com/
DefaultDirName={autopf}\{#AppNameSafe}
DefaultGroupName={#AppName}
AllowNoIcons=yes
; Single output installer exe
OutputDir=installer_output
OutputBaseFilename={#AppNameSafe}-{#AppVersion}-Setup
; Compress hard — the bundle is large
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
; Require Win10+ (onnxruntime minimum)
MinVersion=10.0
; 64-bit only
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Modern wizard
WizardStyle=modern
WizardResizable=yes
; Allow user-level install without admin (no UAC prompt)
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
; The entire PyInstaller output folder
Source: "dist\{#AppNameSafe}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu
Name: "{group}\{#AppName}";       Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
; Desktop (optional)
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
; Offer to launch after install
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove config written to %APPDATA%\Fritlaegning on uninstall (optional)
; Comment out the lines below if you want to keep user settings after uninstall
Type: filesandordirs; Name: "{userappdata}\{#AppNameSafe}"

[Messages]
; Custom finish-page text
FinishedHeadingLabel=Setup complete
FinishedLabel=AI models (~150 MB) are downloaded automatically the first time you process images. An internet connection is required for that initial download only.
