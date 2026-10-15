; Avoid the default silent installer force-killing the editor before it saves.
!macro NSIS_HOOK_PREINSTALL
  nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
  Pop $R0
  ${If} $R0 = 0
    SetErrorLevel 10
    Quit
  ${EndIf}
!macroend
