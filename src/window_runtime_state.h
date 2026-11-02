/**
 * @file src/window_runtime_state.h
 * @brief Stream membership, generation isolation and bounded worker retirement.
 */
#pragma once

#include "window_management_runtime.h"

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <unordered_map>

namespace window_management {
  using activity_reader = std::function<bool(std::uint64_t)>;

  class runtime_worker {
  public:
    virtual ~runtime_worker() = default;
    virtual void admission(bool owns_stream, bool exclusive, bool input_allowed) = 0;
    virtual void captured(const std::string &source) = 0;
    virtual bool recover() = 0;
    virtual bool stop() = 0;
    virtual bool finished() const = 0;
    virtual runtime_status status() const = 0;
  };

  // Tests inject only the executor, not a parallel implementation of membership
  // or activity policy. The native adapter owns Win32/thread lifetime separately.
  class runtime_state {
  public:
    using worker_factory = std::function<std::shared_ptr<runtime_worker>(settings, session_context, activity_reader)>;
    explicit runtime_state(worker_factory factory = {});
    std::uint64_t prepare(const settings &options, const std::string &application_uuid, const std::string &device_id) noexcept;
    void stream_started(std::uint64_t generation, std::uintptr_t stream, bool input_allowed) noexcept;
    void stream_stopped(std::uint64_t generation, std::uintptr_t stream) noexcept;
    void permissions_changed(std::uintptr_t stream, bool input_allowed) noexcept;
    void capture_ready(std::uint64_t generation, std::uintptr_t stream, const std::string &source_name) noexcept;
    void remote_activity(std::uint64_t generation, std::uintptr_t stream) noexcept;
    void stop(std::uint64_t generation) noexcept;
    bool recover_windows() noexcept;
    runtime_status status() noexcept;

  private:
    struct activity_evidence;
    struct activity_channel;

    struct membership {
      std::uint64_t generation;
      bool input_allowed;
      std::string capture_source;
    };

    bool retire();
    void update_admission();

    worker_factory factory_;
    std::mutex mutex_;
    std::uint64_t next_generation_ = 0;
    std::uint64_t generation_ = 0;
    std::string application_uuid_;
    std::string target_device_id_;
    bool retiring_ = false;
    std::unordered_map<std::uintptr_t, membership> streams_;
    std::atomic<std::shared_ptr<activity_channel>> evidence_;
    runtime_status snapshot_;
    std::shared_ptr<runtime_worker> worker_;
  };
}  // namespace window_management
