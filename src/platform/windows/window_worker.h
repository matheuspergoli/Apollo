#pragma once

#include "src/window_runtime_state.h"

#include <memory>
#include <thread>

namespace window_management::win32 {
  class window_worker final: public runtime_worker {
  public:
    static std::shared_ptr<window_worker> start(settings options, session_context context, activity_reader activity);
    ~window_worker() override;
    void admission(bool owns_stream, bool exclusive, bool input_allowed) override;
    void captured(const std::string &source) override;
    bool recover() override;
    bool stop() override;
    bool finished() const override;
    runtime_status status() const override;

  private:
    struct impl;
    explicit window_worker(std::shared_ptr<impl> state);
    std::shared_ptr<impl> impl_;
    std::thread thread_;
  };
}  // namespace window_management::win32
