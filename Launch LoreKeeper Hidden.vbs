Option Explicit

Dim shell, filesystem, repo, launcher, dataFolder, logFile, childLogFile, nodePath, command

Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")

repo = filesystem.GetParentFolderName(WScript.ScriptFullName)
launcher = repo & "\scripts\launch-desktop.js"
dataFolder = repo & "\data"
logFile = repo & "\data\launcher.log"
childLogFile = repo & "\data\launcher-child.log"

If Not filesystem.FolderExists(dataFolder) Then
  filesystem.CreateFolder(dataFolder)
End If

nodePath = FindNode()
shell.CurrentDirectory = repo
AppendLog logFile, "VBS host launch using node: " & nodePath
command = "cmd.exe /d /s /c " & Chr(34) & Chr(34) & nodePath & Chr(34) & " " & Chr(34) & launcher & Chr(34) & " >> " & Chr(34) & childLogFile & Chr(34) & " 2>&1" & Chr(34)
shell.Run command, 0, False

Function FindNode()
  Dim candidates, candidate
  candidates = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Nodist\v-x64\22.22.3\node.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Nodist\bin\node.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", _
    "node" _
  )
  For Each candidate In candidates
    If candidate = "node" Or filesystem.FileExists(candidate) Then
      FindNode = candidate
      Exit Function
    End If
  Next
  FindNode = "node"
End Function

Sub AppendLog(path, text)
  Dim stream
  Set stream = filesystem.OpenTextFile(path, 8, True)
  stream.WriteLine "[" & Now & "] " & text
  stream.Close
End Sub
