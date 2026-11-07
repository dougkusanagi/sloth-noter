; Avoid the default silent installer force-killing the editor before it saves.
!macro NSIS_HOOK_PREINSTALL
  nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
  Pop $R0
  ${If} $R0 = 0
    SetErrorLevel 10
    Quit
  ${EndIf}
!macroend

; The bundler writes the open command with an unquoted executable path; the install
; folder ("Sloth Note") contains a space, so double-clicking associated files failed.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Markdown\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Text\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
