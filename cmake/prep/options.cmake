# Publisher Metadata
set(SUNSHINE_PUBLISHER_NAME "matheuspergoli"
        CACHE STRING "The name of the publisher (or fork developer) of the application.")
set(SUNSHINE_PUBLISHER_WEBSITE "https://github.com/matheuspergoli/Apollo"
        CACHE STRING "The URL of the publisher's website.")
set(SUNSHINE_PUBLISHER_ISSUE_URL "https://github.com/matheuspergoli/Apollo/issues"
        CACHE STRING "The URL of the publisher's support site or issue tracker.
        If you provide a modified version of Sunshine, we kindly request that you use your own url.")

option(BUILD_DOCS "Build documentation" OFF)
option(BUILD_TESTS "Build tests" OFF)
option(BUILD_UI_CONTRACT_TESTS "Build focused React/native configuration contract tests" OFF)
option(PNPM_OFFLINE "Use the local pnpm store without network access." OFF)

option(BUILD_WERROR "Enable -Werror flag." OFF)

# if this option is set, the build will exit after configuring special package configuration files
option(SUNSHINE_CONFIGURE_ONLY "Configure special files only, then exit." OFF)

option(SUNSHINE_ENABLE_TRAY "Enable system tray icon." ON)

option(SUNSHINE_SYSTEM_WAYLAND_PROTOCOLS "Use system installation of wayland-protocols rather than the submodule." OFF)

option(BOOST_USE_STATIC "Use static boost libraries." ON)

option(CUDA_FAIL_ON_MISSING "Fail the build if CUDA is not found." ON)
option(CUDA_INHERIT_COMPILE_OPTIONS
        "When building CUDA code, inherit compile options from the the main project. You may want to disable this if
        your IDE throws errors about unknown flags after running cmake." ON)

if(UNIX)
    option(SUNSHINE_BUILD_HOMEBREW
            "Enable a Homebrew build." OFF)
    option(SUNSHINE_CONFIGURE_HOMEBREW
            "Configure Homebrew formula. Recommended to use with SUNSHINE_CONFIGURE_ONLY" OFF)
endif()

if(UNIX)  # Linux
    option(SUNSHINE_BUILD_APPIMAGE
            "Enable an AppImage build." OFF)
    option(SUNSHINE_BUILD_FLATPAK
            "Enable a Flatpak build." OFF)
    option(SUNSHINE_CONFIGURE_PKGBUILD
            "Configure files required for AUR. Recommended to use with SUNSHINE_CONFIGURE_ONLY" OFF)
    option(SUNSHINE_CONFIGURE_FLATPAK_MAN
            "Configure manifest file required for Flatpak build. Recommended to use with SUNSHINE_CONFIGURE_ONLY" OFF)

    # Linux capture methods
    option(SUNSHINE_ENABLE_CUDA
            "Enable cuda specific code." ON)
    option(SUNSHINE_ENABLE_DRM
            "Enable KMS grab if available." ON)
    option(SUNSHINE_ENABLE_VAAPI
            "Enable building vaapi specific code." ON)
    option(SUNSHINE_ENABLE_WAYLAND
            "Enable building wayland specific code." ON)
    option(SUNSHINE_ENABLE_X11
            "Enable X11 grab if available." ON)
endif()
