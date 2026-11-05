#include "window_worker.h"

#include "src/display_device.h"
#include "src/logging.h"
#include "window_desktop.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <mutex>
#include <thread>
#include <utility>
#include <windows.h>

namespace window_management::win32 {
  namespace {
    using clock = session_controller::clock;
    constexpr auto shutdown_budget = std::chrono::milliseconds {750};

    const char *state_name(show_state state) {
      switch (state) {
        case show_state::normal:
          return "normal";
        case show_state::maximized:
          return "maximized";
        case show_state::minimized:
          return "minimized";
      }
      return "unknown";
    }

    std::wstring wide(const std::string &text) {
      if (text.empty() || text.size() > 32767) {
        return {};
      }
      const auto count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0);
      if (!count) {
        return {};
      }
      std::wstring result(count, L'\0');
      return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), result.data(), count) ? result : std::wstring {};
    }

    struct hook_set {
      std::array<HWINEVENTHOOK, 5> values {};

      ~hook_set() {
        for (auto hook : values) {
          if (hook) {
            UnhookWinEvent(hook);
          }
        }
      }
    };
  }  // namespace

  struct window_worker::impl {
    struct raw_event {
      DWORD event;
      std::uintptr_t handle;
    };

    settings options;
    session_context context;
    activity_reader activity;
    HANDLE wake = nullptr;
    HANDLE done = nullptr;
    std::atomic<unsigned int> flags {0};
    std::atomic<bool> stop_requested {false};
    std::atomic<bool> manual {false};
    std::atomic<bool> admission_interrupted {false};
    std::atomic<bool> capture_interrupted {false};
    std::atomic<std::int64_t> restore_deadline {0};
    std::atomic<std::uint64_t> capture_revision {0};
    std::uint64_t verified_capture = 0;
    mutable std::mutex mutex;
    std::string capture_source;
    runtime_status snapshot;
    std::array<raw_event, session_state::event_limit> events {};
    std::size_t event_count = 0;
    std::atomic<bool> overflow {false};
    bool desktop_interrupted = false;
    inline static thread_local impl *current = nullptr;

    ~impl() {
      if (wake) {
        CloseHandle(wake);
      }
      if (done) {
        CloseHandle(done);
      }
    }

    static void CALLBACK on_event(HWINEVENTHOOK, DWORD event, HWND window, LONG object, LONG child, DWORD, DWORD) noexcept {
      auto *self = current;
      if (!self || (event != EVENT_SYSTEM_DESKTOPSWITCH && (!window || object != OBJID_WINDOW || child != CHILDID_SELF))) {
        return;
      }
      if (event == EVENT_SYSTEM_DESKTOPSWITCH) {
        self->desktop_interrupted = true;
      }
      if (self->event_count == self->events.size()) {
        self->overflow = true;
        return;
      }
      self->events[self->event_count++] = {event, reinterpret_cast<std::uintptr_t>(window)};
    }

    void publish(runtime_phase phase, std::string reason, const session_controller *controller = nullptr, unsigned long error = 0) {
      std::lock_guard lock(mutex);
      const auto changed = snapshot.phase != phase || snapshot.reason != reason ||
                           (controller && snapshot.statistics.recovery_required != controller->statistics().recovery_required);
      snapshot.supported = true;
      snapshot.generation = context.generation;
      snapshot.phase = phase;
      snapshot.reason = std::move(reason);
      snapshot.manual_available = phase == runtime_phase::active && flags.load() == 7 && !stop_requested.load();
      if (controller) {
        snapshot.statistics = controller->statistics();
      }
      if (error || (!controller && phase == runtime_phase::failed) || snapshot.reason == "event_queue_overflow") {
        snapshot.statistics.last_error = error;
        snapshot.statistics.diagnostics.last_operation = "worker";
        snapshot.statistics.diagnostics.last_reason = snapshot.reason;
        snapshot.statistics.diagnostics.last_observation = "none";
        snapshot.statistics.diagnostics.last_stage = "worker";
      }
      if (changed) {
        // Lifecycle summaries only: no window titles, process paths or per-event
        // logs. Counters belong to this generation, not the host's lifetime.
        const auto &stats = snapshot.statistics;
        BOOST_LOG(info) << "WSM: generation=" << context.generation << " phase=" << phase_name(phase)
                        << " reason=" << snapshot.reason << " moved=" << stats.moved << " restored=" << stats.restored
                        << " skipped=" << stats.skipped << " failed=" << stats.failed
                        << " inspection_failures=" << stats.diagnostics.inspection_failures
                        << " submission_rejections=" << stats.diagnostics.submission_rejections
                        << " confirmation_timeouts=" << stats.diagnostics.confirmation_timeouts
                        << " confirmation_rejections=" << stats.diagnostics.confirmation_rejections
                        << " restoration_skips=" << stats.diagnostics.restoration_skips
                        << " shutdown_unfinished=" << stats.diagnostics.shutdown_unfinished
                        << " recovery_required=" << stats.recovery_required
                        << " diagnostic=" << stats.diagnostics.last_operation << "/" << stats.diagnostics.last_reason
                        << " observation=" << stats.diagnostics.last_observation << " stage=" << stats.diagnostics.last_stage << " win32=" << stats.last_error
                        << " timeouts_unobserved=" << stats.diagnostics.timeouts_unobserved
                        << " timeouts_state=" << stats.diagnostics.timeouts_state
                        << " timeouts_position=" << stats.diagnostics.timeouts_position
                        << " timeouts_destination=" << stats.diagnostics.timeouts_destination
                        << " unconfirmed=" << stats.diagnostics.unconfirmed_operation << "/" << stats.diagnostics.unconfirmed_reason
                        << " unconfirmed_observation=" << stats.diagnostics.unconfirmed_observation
                        << " unconfirmed_state=" << stats.diagnostics.unconfirmed_state
                        << " unconfirmed_checks=" << stats.diagnostics.unconfirmed_checks
                        << " unconfirmed_stage=" << stats.diagnostics.unconfirmed_stage
                        << " unconfirmed_win32=" << stats.diagnostics.unconfirmed_error
                        << " confirmed_total=" << stats.diagnostics.confirmed_total;
        // Bounded confirmation evidence, emitted only with lifecycle summaries.
        // Window numbers are executor-local incarnations, not HWNDs/process IDs.
        const auto &diagnostics = stats.diagnostics;
        const auto retained = std::min<std::uint64_t>(diagnostics.confirmed_total, diagnostics.confirmed_operations.size());
        for (auto sequence = diagnostics.confirmed_total - retained; sequence < diagnostics.confirmed_total; ++sequence) {
          const auto &operation = diagnostics.confirmed_operations[sequence % diagnostics.confirmed_operations.size()];
          BOOST_LOG(info) << "WSM: generation=" << context.generation << " phase=" << phase_name(phase)
                          << " confirmation=" << sequence + 1 << " window=" << operation.window
                          << " operation=" << (operation.restoration ? "restore" : "move")
                          << " before=" << state_name(operation.before) << " requested=" << state_name(operation.requested)
                          << " observed=" << state_name(operation.observed);
        }
      }
    }

    void run() noexcept {
      try {
        run_session();
      } catch (...) {
        // Never propagate a window-management failure into streaming teardown.
        try {
          publish(runtime_phase::failed, "worker_exception");
        } catch (...) {
        }
      }
      SetEvent(done);
    }

    void run_session() {
      publish(runtime_phase::waiting, "waiting_for_capture");
      std::unique_ptr<window_desktop> desktop;
      std::unique_ptr<session_controller> controller;

      struct callback_guard {
        ~callback_guard() {
          impl::current = nullptr;
        }
      } guard;

      // Hooks are removed before the callback target is cleared, on this thread.
      hook_set hooks;
      current = this;
      bool initialized = false;
      bool ending = false;
      bool suspended = false;
      std::wstring bound_target_path;
      while (true) {
        bool ready_for_work = false;
        const auto now = clock::now();
        if (stop_requested.load() && !ending) {
          ending = true;
          const auto deadline = clock::time_point {clock::duration {restore_deadline.load()}};
          if (controller) {
            controller->begin_stop(now, deadline, desktop->interactive());
            publish(runtime_phase::stopping, "restoring", controller.get());
          } else {
            publish(runtime_phase::stopped, "no_windows_owned");
            break;
          }
        }
        if (!initialized && !ending && flags.load() == 7) {
          std::string captured;
          std::uint64_t revision = 0;
          {
            std::lock_guard lock(mutex);
            captured = capture_source;
            revision = capture_revision.load();
          }
          if (!captured.empty()) {
            // Interruptions before the initial binding cannot invalidate any
            // ownership yet. Later interruptions remain latched for suspension.
            admission_interrupted.exchange(false);
            capture_interrupted.exchange(false);
            unsigned long error = 0;
            desktop = window_desktop::open(error, [this](bool restoration) {
              if (restoration) {
                return !overflow && !event_count && !desktop_interrupted && !admission_interrupted.load() && !capture_interrupted.load() && flags.load() == 7 && stop_requested.load() && clock::now().time_since_epoch().count() < restore_deadline.load();
              }
              return !overflow && !event_count && !desktop_interrupted && !admission_interrupted.load() && !capture_interrupted.load() && !stop_requested.load() && flags.load() == 7 && capture_revision.load() == verified_capture;
            });
            if (!desktop) {
              publish(runtime_phase::paused, "interactive_context_unavailable", nullptr, error);
              if (WaitForSingleObject(wake, 250) == WAIT_FAILED) {
                publish(runtime_phase::failed, "event_wait_failed", nullptr, GetLastError());
                break;
              }
              continue;
            }
            // Resolve the stable identity Apollo already selected, not an old
            // DISPLAYn name that may have changed during display preparation.
            const auto source = display_device::map_output_name(context.target_device_id);
            const auto expected = bind_target(wide(source));
            const auto actual = bind_target(wide(captured));
            if (!expected.target || !actual.target || expected.target->monitor_device_path != actual.target->monitor_device_path) {
              auto binding_error = expected.error ? expected.error : actual.error;
              publish(runtime_phase::failed, "capture_target_mismatch", nullptr, binding_error ? binding_error : ERROR_INVALID_DATA);
              break;
            }
            verified_capture = revision;
            controller = std::make_unique<session_controller>(*desktop);
            context.connected = context.capture_ready = context.interactive_desktop = true;
            context.exclusive_owner = context.remote_input_allowed = true;
            if (!controller->begin(options, context, *expected.target)) {
              publish(runtime_phase::failed, "session_not_authorized");
              break;
            }
            bound_target_path = expected.target->monitor_device_path;
            const std::array<std::pair<DWORD, DWORD>, 5> ranges {{{EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND}, {EVENT_SYSTEM_MOVESIZESTART, EVENT_SYSTEM_MOVESIZESTART}, {EVENT_SYSTEM_DESKTOPSWITCH, EVENT_SYSTEM_DESKTOPSWITCH}, {EVENT_OBJECT_CREATE, EVENT_OBJECT_SHOW}, {EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE}}};
            bool installed = true;
            unsigned long hook_error = 0;
            for (std::size_t i = 0; i < ranges.size(); ++i) {
              hooks.values[i] = SetWinEventHook(ranges[i].first, ranges[i].second, nullptr, on_event, 0, 0, WINEVENT_OUTOFCONTEXT);
              installed &= hooks.values[i] != nullptr;
              if (!hooks.values[i] && !hook_error) {
                hook_error = GetLastError();
              }
            }
            if (!installed) {
              publish(runtime_phase::failed, "hook_registration_failed", nullptr, hook_error);
              break;
            }
            // Hook first, enumerate second: events occurring during discovery
            // are reconciled by the same controller and incarnation registry.
            controller->recover(trigger::initial);
            initialized = true;
          }
        }
        if (initialized) {
          const auto interactive = desktop->interactive();
          std::string captured;
          std::uint64_t revision = 0;
          {
            std::lock_guard lock(mutex);
            captured = capture_source;
            revision = capture_revision.load();
          }
          const auto capture_available = !captured.empty();
          ready_for_work = interactive && capture_available && flags.load() == 7;
          const auto interrupted = admission_interrupted.exchange(false);
          const auto capture_lost = capture_interrupted.exchange(false);
          if (interrupted || capture_lost || desktop_interrupted || ((!interactive || !capture_available || (!ending && flags.load() != 7)) && !suspended)) {
            controller->suspend();
            suspended = true;
            desktop_interrupted = false;
          } else if (ready_for_work) {
            suspended = false;
          }
          if (overflow) {
            controller->begin_stop(now, now, false);
            controller->tick(now, false);
            publish(runtime_phase::failed, "event_queue_overflow", controller.get());
            break;
          }
          const auto recent = activity(context.generation);
          for (std::size_t i = 0; i < event_count; ++i) {
            const auto event = events[i];
            if (event.event == EVENT_OBJECT_DESTROY || event.event == EVENT_OBJECT_CREATE) {
              controller->destroyed(event.handle);
            } else if (event.event == EVENT_SYSTEM_MOVESIZESTART) {
              controller->user_move_started(event.handle);
            } else if (interactive && event.event == EVENT_OBJECT_LOCATIONCHANGE) {
              // Observation does not authorize movement, including while paused
              // or restoring. Returning to an old position cannot erase override.
              controller->event(event.handle, trigger::location_changed, recent, now);
            } else if (ready_for_work && !ending) {
              if (event.event == EVENT_SYSTEM_FOREGROUND) {
                controller->event(event.handle, trigger::foreground, recent, now);
              } else if (event.event == EVENT_OBJECT_SHOW) {
                controller->event(event.handle, trigger::shown, recent, now);
              }
            }
          }
          event_count = 0;
          if (manual.exchange(false) && ready_for_work && !ending) {
            controller->recover(trigger::manual);
          }
          if (ending || ready_for_work) {
            // A reinitialized capture must still refer to the bound virtual.
            if (!ending) {
              const auto actual = bind_target(wide(captured));
              // The session's CCD identity is immutable. Its controller resolves
              // the current GDI source by that path; do not rebind through global
              // display-management state on every batch or adopt a replacement.
              if (!actual.target || actual.target->monitor_device_path != bound_target_path) {
                controller->begin_stop(now, now, false);
                controller->tick(now, false);
                publish(runtime_phase::failed, "capture_target_mismatch", controller.get(), actual.error ? actual.error : ERROR_INVALID_DATA);
                break;
              } else {
                verified_capture = revision;
              }
            }
            controller->tick(now, recent);
          }
          if (controller->stopped()) {
            publish(ending ? runtime_phase::stopped : runtime_phase::failed, ending ? "stopped" : "target_unavailable", controller.get());
            break;
          }
          auto phase = runtime_phase::paused;
          std::string reason = "desktop_unavailable";
          if (ending) {
            phase = runtime_phase::stopping;
            reason = "restoring";
          } else if (interactive && !capture_available) {
            reason = "capture_unavailable";
          } else if (ready_for_work) {
            phase = runtime_phase::active;
            reason = "active";
          } else if (interactive) {
            reason = "session_not_exclusive";
          }
          publish(phase, std::move(reason), controller.get());
        }
        const auto timeout = initialized && (ending || (ready_for_work && controller->has_work())) ? 50ul : INFINITE;
        const auto wait = MsgWaitForMultipleObjects(1, &wake, FALSE, timeout, QS_ALLINPUT);
        if (wait == WAIT_FAILED) {
          publish(runtime_phase::failed, "event_wait_failed", controller.get(), GetLastError());
          break;
        }
        MSG message;
        // A noisy application must not starve cancellation/overflow handling.
        for (std::size_t i = 0; i < session_state::event_limit && PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE); ++i) {
          TranslateMessage(&message);
          DispatchMessageW(&message);
        }
      }
    }
  };

  window_worker::window_worker(std::shared_ptr<impl> state):
      impl_(std::move(state)) {}

  std::shared_ptr<window_worker> window_worker::start(settings options, session_context context, activity_reader activity) {
    auto state = std::make_shared<impl>();
    state->options = std::move(options);
    state->context = std::move(context);
    state->activity = activity;
    state->snapshot = {true, false, runtime_phase::waiting, state->context.generation, {}, "waiting_for_capture"};
    state->wake = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    state->done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!state->wake || !state->done) {
      return {};
    }
    auto worker = std::shared_ptr<window_worker>(new window_worker(state));
    try {
      worker->thread_ = std::thread([state] {
        state->run();
      });
    } catch (...) {
      SetEvent(state->done);
      throw;
    }
    return worker;
  }

  window_worker::~window_worker() {
    stop();
  }

  void window_worker::admission(bool owns_stream, bool exclusive, bool input_allowed) {
    const auto flags = (owns_stream ? 1u : 0u) | (exclusive ? 2u : 0u) | (input_allowed ? 4u : 0u);
    impl_->flags.store(flags);
    if (flags != 7) {
      // Latch even short interruptions; resuming before the next loop cannot
      // resurrect ownership or already queued automatic work.
      impl_->admission_interrupted.store(true);
    }
    SetEvent(impl_->wake);
  }

  void window_worker::captured(const std::string &source) {
    {
      std::lock_guard lock(impl_->mutex);
      if (impl_->capture_source == source) {
        return;
      }
      impl_->capture_source = source;
      impl_->capture_revision.fetch_add(1);
      // A reinit can finish before the worker gets its next turn. Keep evidence
      // of the gap instead of treating the old binding as uninterrupted.
      impl_->capture_interrupted.store(true);
    }
    SetEvent(impl_->wake);
  }

  bool window_worker::recover() {
    if (impl_->flags.load() != 7 || impl_->stop_requested.load() || finished()) {
      return false;
    }
    {
      std::lock_guard lock(impl_->mutex);
      if (!impl_->snapshot.manual_available) {
        return false;
      }
    }
    impl_->manual.store(true);
    SetEvent(impl_->wake);
    return true;
  }

  bool window_worker::stop() {
    // Start the budget at the caller, not when a blocked worker next wakes up.
    std::int64_t unset = 0;
    impl_->restore_deadline.compare_exchange_strong(unset, (clock::now() + shutdown_budget).time_since_epoch().count());
    impl_->stop_requested.store(true);
    SetEvent(impl_->wake);
    const auto done = WaitForSingleObject(impl_->done, 1000) == WAIT_OBJECT_0;
    if (thread_.joinable()) {
      if (done) {
        thread_.join();
      } else {
        // The thread owns its shared state and callbacks until it really exits.
        // The runtime retains this worker and refuses replacement while retired.
        thread_.detach();
      }
    }
    if (!done) {
      impl_->publish(runtime_phase::failed, "worker_stop_timeout");
    }
    return done;
  }

  bool window_worker::finished() const {
    return WaitForSingleObject(impl_->done, 0) == WAIT_OBJECT_0;
  }

  runtime_status window_worker::status() const {
    std::lock_guard lock(impl_->mutex);
    auto result = impl_->snapshot;
    // Controller limits and the raw hook queue are distinct. Include the latched
    // raw overflow without counting it again on every status read.
    result.statistics.overflow += impl_->overflow.load() ? 1 : 0;
    result.manual_available &= impl_->flags.load() == 7 && !impl_->stop_requested.load() &&
                               !impl_->overflow.load() && !impl_->admission_interrupted.load() && !impl_->capture_interrupted.load();
    return result;
  }
}  // namespace window_management::win32
