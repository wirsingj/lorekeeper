Option Explicit

Dim shell, filesystem, repo, desktop, appData, iconFolder
Dim mainIconSource, mainIconPath, wscriptPath
Dim mainLauncher

Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")

repo = filesystem.GetParentFolderName(WScript.ScriptFullName)
desktop = shell.SpecialFolders("Desktop")
appData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\LoreKeeper"
iconFolder = appData & "\shortcut-icons"
mainIconSource = repo & "\assets\brand\lorekeeper-icon.ico"
mainIconPath = iconFolder & "\lorekeeper-icon.ico"
wscriptPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
mainLauncher = repo & "\Launch LoreKeeper Hidden.vbs"

EnsureFolder appData
EnsureFolder iconFolder
RequireFile mainIconSource, "main icon"
RequireFile mainLauncher, "main launcher"
filesystem.CopyFile mainIconSource, mainIconPath, True

DeleteIfExists desktop & "\LoreKeeperClientLite.lnk"
DeleteIfExists repo & "\LoreKeeperClientLite.lnk"
DeleteIfExists desktop & "\ThinLoreKeeper.lnk"
DeleteIfExists repo & "\ThinLoreKeeper.lnk"

CreateShortcut desktop & "\LoreKeeper.lnk", mainLauncher, "Launch LoreKeeper", mainIconPath
CreateShortcut repo & "\LoreKeeper.lnk", mainLauncher, "Launch LoreKeeper", mainIconPath

WScript.Echo "LoreKeeper shortcut updated on the desktop and in the repo folder. Old companion shortcuts were removed."

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
