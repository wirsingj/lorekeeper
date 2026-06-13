Option Explicit

Dim shell, filesystem, repo, desktop, appData, iconFolder
Dim mainIconSource, thinIconSource, mainIconPath, thinIconPath, wscriptPath
Dim mainLauncher, thinLauncher

Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")

repo = filesystem.GetParentFolderName(WScript.ScriptFullName)
desktop = shell.SpecialFolders("Desktop")
appData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\LoreKeeper"
iconFolder = appData & "\shortcut-icons"
mainIconSource = repo & "\assets\brand\lorekeeper-icon.ico"
thinIconSource = repo & "\assets\brand\lorekeeper-client-icon.ico"
mainIconPath = iconFolder & "\lorekeeper-icon.ico"
thinIconPath = iconFolder & "\lorekeeper-client-icon.ico"
wscriptPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
mainLauncher = repo & "\Launch LoreKeeper Hidden.vbs"
thinLauncher = repo & "\Launch ThinLoreKeeper Hidden.vbs"

EnsureFolder appData
EnsureFolder iconFolder
RequireFile mainIconSource, "main icon"
RequireFile thinIconSource, "thin companion icon"
RequireFile mainLauncher, "main launcher"
RequireFile thinLauncher, "thin companion launcher"
filesystem.CopyFile mainIconSource, mainIconPath, True
filesystem.CopyFile thinIconSource, thinIconPath, True

DeleteIfExists desktop & "\LoreKeeperClientLite.lnk"
DeleteIfExists repo & "\LoreKeeperClientLite.lnk"

CreateShortcut desktop & "\LoreKeeper.lnk", mainLauncher, "Launch LoreKeeper", mainIconPath
CreateShortcut desktop & "\ThinLoreKeeper.lnk", thinLauncher, "Launch ThinLoreKeeper companion", thinIconPath
CreateShortcut repo & "\LoreKeeper.lnk", mainLauncher, "Launch LoreKeeper", mainIconPath
CreateShortcut repo & "\ThinLoreKeeper.lnk", thinLauncher, "Launch ThinLoreKeeper companion", thinIconPath

WScript.Echo "LoreKeeper and ThinLoreKeeper shortcuts updated on the desktop and in the repo folder."

Sub CreateShortcut(shortcutPath, launcherPath, description, iconPath)
  Dim shortcut
  Set shortcut = shell.CreateShortcut(shortcutPath)
  shortcut.TargetPath = wscriptPath
  shortcut.Arguments = Chr(34) & launcherPath & Chr(34)
  shortcut.WorkingDirectory = repo
  shortcut.IconLocation = iconPath & ",0"
  shortcut.Description = description
  shortcut.Save
End Sub

Sub DeleteIfExists(path)
  If filesystem.FileExists(path) Then
    filesystem.DeleteFile path, True
  End If
End Sub

Sub EnsureFolder(path)
  If Not filesystem.FolderExists(path) Then
    filesystem.CreateFolder path
  End If
End Sub

Sub RequireFile(path, label)
  If Not filesystem.FileExists(path) Then
    WScript.Echo "Missing " & label & ": " & path
    WScript.Quit 1
  End If
End Sub
