; Windows installer: WerkFab is offered for STEP, IGES and mesh files ("Open with", Settings > Default apps)
; without taking these file types away from the program that opens them now. The own format .ofab is
; registered by electron-builder (fileAssociations in package.json).
!macro WerkFabType EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "WerkFab.Model" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}" ""
!macroend
!macro WerkFabTypeGone EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "WerkFab.Model"
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\WerkFab.Model" "" "3D model"
  WriteRegStr SHCTX "Software\Classes\WerkFab.Model\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\WerkFab.Model\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "WerkFab"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !insertmacro WerkFabType "ofab"
  !insertmacro WerkFabType "step"
  !insertmacro WerkFabType "stp"
  !insertmacro WerkFabType "igs"
  !insertmacro WerkFabType "iges"
  !insertmacro WerkFabType "stl"
  !insertmacro WerkFabType "obj"
  !insertmacro WerkFabType "3mf"
  !insertmacro WerkFabType "ply"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  !insertmacro WerkFabTypeGone "ofab"
  !insertmacro WerkFabTypeGone "step"
  !insertmacro WerkFabTypeGone "stp"
  !insertmacro WerkFabTypeGone "igs"
  !insertmacro WerkFabTypeGone "iges"
  !insertmacro WerkFabTypeGone "stl"
  !insertmacro WerkFabTypeGone "obj"
  !insertmacro WerkFabTypeGone "3mf"
  !insertmacro WerkFabTypeGone "ply"
  DeleteRegKey SHCTX "Software\Classes\WerkFab.Model"
  DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
