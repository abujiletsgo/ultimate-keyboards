; Tauri NSIS hooks for the per-user Windows installer (bundle.windows.nsis.installerHooks).
; The keyboard service ships next to the app as ultimate-keyboards-remapper-win.exe (Tauri externalBin).
; Run value name and file name match src-tauri/src/native_remapping/transport.rs.

!define UK_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define UK_RUN_VALUE "UltimateKeyboardsRemapper"
!define UK_SERVICE_EXE "ultimate-keyboards-remapper-win.exe"

; Graceful stop first (keys stay normal), then a hard stop so the file can be replaced or deleted.
!macro UkStopService
  Push $0
  nsExec::Exec '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\native\stop-service.ps1"'
  Pop $0
  nsExec::Exec '"$WINDIR\System32\taskkill.exe" /F /IM ${UK_SERVICE_EXE}'
  Pop $0
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro UkStopService
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Start the keyboard service at every sign-in. The app re-checks this value and repairs it.
  WriteRegStr HKCU "${UK_RUN_KEY}" "${UK_RUN_VALUE}" '"$INSTDIR\${UK_SERVICE_EXE}"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro UkStopService
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "${UK_RUN_KEY}" "${UK_RUN_VALUE}"
!macroend
