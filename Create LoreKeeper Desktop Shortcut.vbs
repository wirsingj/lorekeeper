Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")

repo = filesystem.GetParentFolderName(WScript.ScriptFullName)
desktop = shell.SpecialFolders("Desktop")
shortcutPath = desktop & "\LoreKeeper.lnk"
launcher = repo & "\Launch LoreKeeper Hidden.vbs"
iconPath = repo & "\assets\brand\lorekeeper-icon.ico"

Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = launcher
shortcut.WorkingDirectory = repo
shortcut.IconLocation = iconPath & ",0"
shortcut.Description = "Launch LoreKeeper"
shortcut.Save

WScript.Echo "LoreKeeper desktop shortcut updated."
