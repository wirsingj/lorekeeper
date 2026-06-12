Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")

repo = filesystem.GetParentFolderName(WScript.ScriptFullName)
launcher = repo & "\Launch LoreKeeper.cmd"

shell.CurrentDirectory = repo
command = "cmd.exe /c " & Chr(34) & Chr(34) & launcher & Chr(34) & " --no-pause" & Chr(34)
shell.Run command, 0, False
