# Source control contains the INF/catalog/certificate, but not the driver DLL or
# setup executable. Recover only those exact vendor files from a pinned official
# package. Never execute that installer or install a driver during a build.
file(READ "${CMAKE_SOURCE_DIR}/packaging/windows/runtime-contract.json" SUDOVDA_CONTRACT)
string(JSON SUDOVDA_SOURCE_URL GET "${SUDOVDA_CONTRACT}" sudovdaSource url)
string(JSON SUDOVDA_SOURCE_HASH GET "${SUDOVDA_CONTRACT}" sudovdaSource sha256)
find_program(SUDOVDA_7ZIP NAMES 7z 7zz PATHS "C:/Program Files/7-Zip" REQUIRED)

set(SUDOVDA_INPUT_DIR "${CMAKE_BINARY_DIR}/driver-inputs")
file(MAKE_DIRECTORY "${SUDOVDA_INPUT_DIR}")
set(SUDOVDA_SOURCE_ARCHIVE "${SUDOVDA_INPUT_DIR}/Apollo-0.4.6.exe")
file(DOWNLOAD "${SUDOVDA_SOURCE_URL}" "${SUDOVDA_SOURCE_ARCHIVE}"
    EXPECTED_HASH "SHA256=${SUDOVDA_SOURCE_HASH}" TLS_VERIFY ON TIMEOUT 120)
execute_process(
    COMMAND "${SUDOVDA_7ZIP}" x "${SUDOVDA_SOURCE_ARCHIVE}"
        "-o${SUDOVDA_INPUT_DIR}/extracted"
        "drivers/sudovda/SudoVDA.dll" "drivers/sudovda/nefconc.exe" -y
    RESULT_VARIABLE SUDOVDA_EXTRACT_RESULT OUTPUT_QUIET ERROR_VARIABLE SUDOVDA_EXTRACT_ERROR)
if(NOT SUDOVDA_EXTRACT_RESULT EQUAL 0)
    message(FATAL_ERROR "Cannot extract the pinned SudoVDA payload: ${SUDOVDA_EXTRACT_ERROR}")
endif()

set(SUDOVDA_BINARY_DIR "${SUDOVDA_INPUT_DIR}/extracted/drivers/sudovda")
foreach(name SudoVDA.dll nefconc.exe SudoVDA.inf sudovda.cat sudovda.cer)
    if(name STREQUAL "SudoVDA.dll" OR name STREQUAL "nefconc.exe")
        set(input "${SUDOVDA_BINARY_DIR}/${name}")
    else()
        set(input "${SUNSHINE_SOURCE_ASSETS_DIR}/windows/drivers/sudovda/${name}")
    endif()
    if(NOT EXISTS "${input}")
        message(FATAL_ERROR "Required SudoVDA file is absent: ${name}")
    endif()
    string(JSON expected GET "${SUDOVDA_CONTRACT}" sha256 "drivers/sudovda/${name}")
    file(SHA256 "${input}" actual)
    if(NOT actual STREQUAL expected)
        message(FATAL_ERROR "SudoVDA file does not match the approved driver package: ${name}")
    endif()
endforeach()
