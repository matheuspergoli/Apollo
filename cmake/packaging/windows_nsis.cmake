# A single install section is intentional: CPack component sections otherwise
# copy files before EXTRA_PREINSTALL_COMMANDS can stop/backup an existing host.
set(CPACK_MONOLITHIC_INSTALL ON)
set(CPACK_VERBATIM_VARIABLES ON)
set(CPACK_NSIS_ENABLE_UNINSTALL_BEFORE_INSTALL OFF)
set(CPACK_PACKAGE_INSTALL_REGISTRY_KEY "Apollo")
set(CPACK_NSIS_MODIFY_PATH OFF)
set(CPACK_NSIS_EXECUTABLES_DIRECTORY ".")
set(CPACK_NSIS_INSTALLED_ICON_NAME "sunshine.exe")
set(CPACK_NSIS_MANIFEST_DPI_AWARE true)

file(TO_NATIVE_PATH "${SUNSHINE_SOURCE_ASSETS_DIR}/windows/misc/migration/update-installation.ps1" APOLLO_UPDATE_SCRIPT)
file(TO_NATIVE_PATH "${SUNSHINE_SOURCE_ASSETS_DIR}/windows/misc/migration/installation-data.ps1" APOLLO_DATA_SCRIPT)
file(TO_NATIVE_PATH "${CMAKE_BINARY_DIR}/installation-manifest.json" APOLLO_INSTALL_MANIFEST)

set(CPACK_NSIS_DEFINES [=[
!include "FileFunc.nsh"
!define MUI_FINISHPAGE_REBOOTLATER_DEFAULT
Var ApolloPowerShell
Var ApolloNoHostIntegration
Var ApolloRestored
Var ApolloNeedsReboot
Function ApolloRestorePrevious
  StrCmp $ApolloRestored "1" restore_done
  StrCpy $ApolloRestored "1"
  IfFileExists "$PLUGINSDIR\apollo-update-state.json" 0 restore_done
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Restore -StatePath "$PLUGINSDIR\apollo-update-state.json"'
  Pop $0
  DetailPrint "Resultado da restauracao dos arquivos anteriores: $0. Backup privado em $INSTDIR.backups. Drivers compartilhados nao foram removidos."
restore_done:
FunctionEnd
Function .onInstFailed
  Call ApolloRestorePrevious
FunctionEnd
]=])

set(CPACK_NSIS_EXTRA_PREINSTALL_COMMANDS [=[
  StrCpy $ApolloRestored "0"
  StrCpy $ApolloNeedsReboot "0"
  StrCpy $ApolloNoHostIntegration "0"
  StrCpy $ApolloPowerShell "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
  StrCpy $ApolloPowerShell "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/NoHostIntegration" $R1
  IfErrors +2 0
  StrCpy $ApolloNoHostIntegration "1"
  InitPluginsDir
  File "/oname=$PLUGINSDIR\update-installation.ps1" "@APOLLO_UPDATE_SCRIPT@"
  File "/oname=$PLUGINSDIR\installation-data.ps1" "@APOLLO_DATA_SCRIPT@"
  File "/oname=$PLUGINSDIR\installation-manifest.json" "@APOLLO_INSTALL_MANIFEST@"
  StrCmp $ApolloNoHostIntegration "1" prepare_portable
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Prepare -StatePath "$PLUGINSDIR\apollo-update-state.json" -Version "@PROJECT_VERSION@"'
  Goto prepare_result
prepare_portable:
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Prepare -StatePath "$PLUGINSDIR\apollo-update-state.json" -Version "@PROJECT_VERSION@" -NoHostIntegration'
prepare_result:
  Pop $0
  StrCmp $0 "0" prepare_done
  MessageBox MB_OK|MB_ICONSTOP "Nao foi possivel preparar uma atualizacao segura. Os arquivos do programa nao foram substituidos. Consulte os detalhes da instalacao." /SD IDOK
  SetErrorLevel 1
  Abort "Atualizacao bloqueada na preparacao."
prepare_done:
]=])
string(CONFIGURE "${CPACK_NSIS_EXTRA_PREINSTALL_COMMANDS}" CPACK_NSIS_EXTRA_PREINSTALL_COMMANDS @ONLY)

set(CPACK_NSIS_EXTRA_INSTALL_COMMANDS [=[
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Verify -ManifestPath "$PLUGINSDIR\installation-manifest.json"'
  Pop $0
  StrCmp $0 "0" +2
  Goto install_failed
  StrCmp $ApolloNoHostIntegration "1" finish_portable
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\drivers\sudovda\install-driver.ps1"'
  Pop $0
  StrCmp $0 "3010" driver_reboot
  StrCmp $0 "0" install_gamepad install_failed
driver_reboot:
  StrCpy $ApolloNeedsReboot "1"
  SetRebootFlag true
install_gamepad:
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\install-gamepad.ps1"'
  Pop $0
  StrCmp $0 "3010" gamepad_reboot
  StrCmp $0 "0" install_rules install_failed
gamepad_reboot:
  StrCpy $ApolloNeedsReboot "1"
  SetRebootFlag true
install_rules:
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /D /C ""$INSTDIR\scripts\add-firewall-rule.bat""'
  Pop $0
  StrCmp $0 "0" finish_managed install_failed
finish_managed:
  StrCmp $ApolloNeedsReboot "1" finish_deferred
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Finish -StatePath "$PLUGINSDIR\apollo-update-state.json" -ManifestPath "$PLUGINSDIR\installation-manifest.json"'
  Goto finish_result
finish_deferred:
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Finish -StatePath "$PLUGINSDIR\apollo-update-state.json" -ManifestPath "$PLUGINSDIR\installation-manifest.json" -DeferStart'
  Goto finish_result
finish_portable:
  nsExec::ExecToLog '"$ApolloPowerShell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-installation.ps1" -InstallDir "$INSTDIR" -Mode Finish -StatePath "$PLUGINSDIR\apollo-update-state.json" -ManifestPath "$PLUGINSDIR\installation-manifest.json"'
finish_result:
  Pop $0
  StrCmp $0 "0" install_done
install_failed:
  Call ApolloRestorePrevious
  SetErrorLevel 1
  MessageBox MB_OK|MB_ICONSTOP "A instalacao nao foi confirmada. Consulte os detalhes e o backup privado em $INSTDIR.backups. Nao remova suas configuracoes nem reinstale drivers repetidamente." /SD IDOK
  Abort "Falha na integracao do host."
install_done:
  StrCmp $ApolloNeedsReboot "1" 0 +2
  SetErrorLevel 3010
]=])

# Uninstall only this installation's service. Shared drivers and user data are
# deliberately retained; CPack removes its managed program files, not config/.
set(CPACK_NSIS_EXTRA_UNINSTALL_COMMANDS [=[
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\update-installation.ps1" -InstallDir "$INSTDIR" -Mode RemoveService'
  Pop $0
  StrCmp $0 "0" +3
  MessageBox MB_OK|MB_ICONSTOP "Nao foi possivel parar o servico desta instalacao com seguranca. A desinstalacao foi interrompida." /SD IDOK
  Abort
]=])

set(CPACK_NSIS_CREATE_ICONS_EXTRA [=[
  SetOutPath "$INSTDIR"
  CreateShortCut "$SMPROGRAMS\$STARTMENU_FOLDER\Apollo.lnk" "$INSTDIR\sunshine.exe" "--shortcut"
]=])
set(CPACK_NSIS_DELETE_ICONS_EXTRA [=[
  Delete "$SMPROGRAMS\$MUI_TEMP\Apollo.lnk"
]=])
