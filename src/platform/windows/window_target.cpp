#include "window_target.h"

#include <vector>
#include <windows.h>

namespace window_management::win32 {
  namespace {
    struct path_identity {
      LUID adapter;
      UINT32 source_id;
      std::wstring source_name;
      std::wstring device_path;
    };

    bool same(std::wstring_view a, std::wstring_view b) {
      return CompareStringOrdinal(a.data(), static_cast<int>(a.size()), b.data(), static_cast<int>(b.size()), TRUE) == CSTR_EQUAL;
    }

    bool same_source(const path_identity &a, const path_identity &b) {
      return a.adapter.LowPart == b.adapter.LowPart && a.adapter.HighPart == b.adapter.HighPart && a.source_id == b.source_id;
    }

    DWORD read_paths(std::vector<path_identity> &result) {
      // Display changes can race buffer sizing. Retry a bounded number of times,
      // without waiting, changing configuration or accepting a partial inventory.
      for (unsigned int attempt = 0; attempt < 3; ++attempt) {
        UINT32 path_count = 0;
        UINT32 mode_count = 0;
        auto error = GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &path_count, &mode_count);
        if (error != ERROR_SUCCESS) {
          return error;
        }
        if (!path_count) {
          return ERROR_NOT_FOUND;
        }
        if (path_count > 4096 || mode_count > 8192) {
          return ERROR_NOT_ENOUGH_MEMORY;
        }
        std::vector<DISPLAYCONFIG_PATH_INFO> paths(path_count);
        std::vector<DISPLAYCONFIG_MODE_INFO> modes(mode_count);
        error = QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &path_count, paths.data(), &mode_count, modes.data(), nullptr);
        if (error == ERROR_INSUFFICIENT_BUFFER) {
          continue;
        }
        if (error != ERROR_SUCCESS) {
          return error;
        }
        for (UINT32 i = 0; i < path_count; ++i) {
          const auto &path = paths[i];
          if (!(path.flags & DISPLAYCONFIG_PATH_ACTIVE) || !path.targetInfo.targetAvailable) {
            continue;
          }
          DISPLAYCONFIG_SOURCE_DEVICE_NAME source {};
          source.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
          source.header.size = sizeof(source);
          source.header.adapterId = path.sourceInfo.adapterId;
          source.header.id = path.sourceInfo.id;
          error = DisplayConfigGetDeviceInfo(&source.header);
          if (error != ERROR_SUCCESS) {
            return error;
          }
          DISPLAYCONFIG_TARGET_DEVICE_NAME target {};
          target.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
          target.header.size = sizeof(target);
          target.header.adapterId = path.targetInfo.adapterId;
          target.header.id = path.targetInfo.id;
          error = DisplayConfigGetDeviceInfo(&target.header);
          if (error != ERROR_SUCCESS) {
            return error;
          }
          if (!source.viewGdiDeviceName[0] || !target.monitorDevicePath[0]) {
            return ERROR_NOT_FOUND;
          }
          result.push_back({path.sourceInfo.adapterId, path.sourceInfo.id, source.viewGdiDeviceName, target.monitorDevicePath});
        }
        return result.empty() ? ERROR_NOT_FOUND : ERROR_SUCCESS;
      }
      return ERROR_INSUFFICIENT_BUFFER;
    }

    struct monitor_query {
      std::wstring source;
      std::optional<MONITORINFOEXW> info;
      bool ambiguous = false;
    };

    BOOL CALLBACK inspect_monitor(HMONITOR monitor, HDC, LPRECT, LPARAM data) {
      auto &query = *reinterpret_cast<monitor_query *>(data);
      MONITORINFOEXW info {};
      info.cbSize = sizeof(info);
      if (!GetMonitorInfoW(monitor, reinterpret_cast<MONITORINFO *>(&info)) || !same(info.szDevice, query.source)) {
        return TRUE;
      }
      if (query.info) {
        query.ambiguous = true;
        return FALSE;
      }
      // No allocations or exceptions across the Windows callback boundary.
      query.info = info;
      return TRUE;
    }

    screen_rect screen(RECT rect) {
      return {static_cast<std::int32_t>(rect.left), static_cast<std::int32_t>(rect.top), static_cast<std::int32_t>(rect.right), static_cast<std::int32_t>(rect.bottom)};
    }

    target_result resolve(std::wstring_view requested, bool by_path) {
      if (requested.empty() || requested.size() > 32767 || requested.find(L'\0') != std::wstring_view::npos) {
        return {{}, ERROR_INVALID_PARAMETER};
      }
      // Prevent accidental DPI-virtualized coordinates. The WSM executor must
      // establish its own per-monitor-aware context, not change global DPI mode.
      if (GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext()) != DPI_AWARENESS_PER_MONITOR_AWARE) {
        return {{}, ERROR_NOT_SUPPORTED};
      }
      std::vector<path_identity> paths;
      const auto error = read_paths(paths);
      if (error != ERROR_SUCCESS) {
        return {{}, error};
      }
      const path_identity *selected = nullptr;
      for (const auto &path : paths) {
        if (same(by_path ? path.device_path : path.source_name, requested)) {
          if (selected) {
            return {{}, ERROR_DUP_NAME};
          }
          selected = &path;
        }
      }
      if (!selected) {
        return {{}, ERROR_NOT_FOUND};
      }
      for (const auto &path : paths) {
        if (&path != selected && same_source(path, *selected)) {
          // Multiple physical targets may share one logical desktop in clone
          // mode. Do not confuse such a source with a uniquely bound virtual.
          return {{}, ERROR_DUP_NAME};
        }
      }
      monitor_query query {selected->source_name, {}, false};
      SetLastError(ERROR_SUCCESS);
      if (!EnumDisplayMonitors(nullptr, nullptr, inspect_monitor, reinterpret_cast<LPARAM>(&query)) && !query.ambiguous) {
        const auto enum_error = GetLastError();
        return {{}, enum_error ? enum_error : ERROR_GEN_FAILURE};
      }
      if (query.ambiguous) {
        return {{}, ERROR_DUP_NAME};
      }
      if (!query.info) {
        return {{}, ERROR_NOT_FOUND};
      }
      return {target_snapshot {selected->device_path, query.info->szDevice, screen(query.info->rcMonitor), screen(query.info->rcWork)}, ERROR_SUCCESS};
    }
  }  // namespace

  target_result bind_target(std::wstring_view streaming_source) {
    return resolve(streaming_source, false);
  }

  target_result refresh_target(std::wstring_view monitor_device_path) {
    return resolve(monitor_device_path, true);
  }
}  // namespace window_management::win32
