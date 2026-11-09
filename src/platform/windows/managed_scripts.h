#pragma once

#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <string>

namespace managed_scripts {
  constexpr std::size_t script_limit = 128 * 1024;
  constexpr std::size_t request_limit = 2 * 1024 * 1024;

  // Serializes script and application-library changes in this host process.
  std::recursive_mutex &mutex();
  std::string digest(const std::string &bytes);
  std::string encode(const std::string &bytes);
  std::string decode(const std::string &base64);
  void validate_file(const std::string &name, const std::string &bytes);
  void atomic_write(const std::filesystem::path &path, const std::string &bytes);
  bool has_scripts(const nlohmann::json &application);

  struct execution {
    nlohmann::json application;
    // Pins files and all containing directories against replacement until every
    // owner (including asynchronous session commands) has released the plan.
    std::shared_ptr<void> lifetime;
  };

  class store {
  public:
    explicit store(std::filesystem::path data_directory);
    nlohmann::json list(const nlohmann::json &applications);
    nlohmann::json read(const nlohmann::json &reference);
    nlohmann::json put(const nlohmann::json &file);
    void remove(const std::string &id, const nlohmann::json &applications);
    // All input is validated before importing pending files. Copies are retained
    // if application persistence is uncertain, never deleted behind a live ref.
    void save_application(nlohmann::json application, const std::function<void(const nlohmann::json &)> &persist);
    execution resolve(nlohmann::json application);

  private:
    std::filesystem::path root_;
  };
}  // namespace managed_scripts
