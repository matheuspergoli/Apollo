#ifdef _WIN32
  #include "src/platform/windows/managed_scripts.h"

  #include <array>
  #include <filesystem>
  #include <fstream>
  #include <gtest/gtest.h>
  #include <windows.h>

namespace {
  namespace fs = std::filesystem;
  using json = nlohmann::json;

  class ManagedScriptsTest: public testing::Test {
  protected:
    fs::path home;

    void SetUp() override {
      std::array<wchar_t, MAX_PATH> temporary {};
      ASSERT_NE(GetTempPathW(temporary.size(), temporary.data()), 0u);
      home = fs::path(temporary.data()) / (L"apollo-script-test-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()));
      ASSERT_TRUE(fs::create_directory(home));
    }

    void TearDown() override {
      std::error_code error;
      fs::remove_all(home, error);
    }

    json file(std::string content = "# Test-owned file\r\nWrite-Output 'ok'\r\n") {
      return {{"name", "example.ps1"}, {"data", managed_scripts::encode(content)}};
    }

    json app(json reference) {
      return {{"uuid", "generic-app"}, {"name", "Example"}, {"cmd", ""}, {"cmd-script", reference}, {"scripts-approved", true}};
    }
  };

  TEST_F(ManagedScriptsTest, ImportReadAndReloadPreserveExactBytes) {
    const std::string content = "\xef\xbb\xbf# Conteudo UTF-8\r\nWrite-Output 'exemplo'\r\n";
    auto reference = managed_scripts::store(home).put(file(content));
    auto read = managed_scripts::store(home).read(reference);
    EXPECT_EQ(managed_scripts::decode(read.at("data")), content);
    EXPECT_EQ(read.at("revision"), managed_scripts::digest(content));
    EXPECT_EQ(managed_scripts::store(home).list(json::object()).size(), 1u);
  }

  TEST_F(ManagedScriptsTest, InvalidUploadsDoNotCreateTheStore) {
    auto invalid = file();
    invalid["name"] = "../outside.ps1";
    EXPECT_THROW(managed_scripts::store(home).put(invalid), std::exception);
    invalid = file();
    invalid["data"] = "????";
    EXPECT_THROW(managed_scripts::store(home).put(invalid), std::exception);
    invalid = file(std::string(managed_scripts::script_limit + 1, 'x'));
    EXPECT_THROW(managed_scripts::store(home).put(invalid), std::exception);
    EXPECT_FALSE(fs::exists(home / "scripts"));
  }

  TEST_F(ManagedScriptsTest, ApprovalIsRequiredBeforeAnyPendingFilesArePersisted) {
    auto application = app({{"file", file()}});
    application.erase("scripts-approved");
    bool persisted = false;
    EXPECT_THROW(managed_scripts::store(home).save_application(application, [&](const auto &) {
      persisted = true;
    }),
                 std::exception);
    EXPECT_FALSE(persisted);
    EXPECT_FALSE(fs::exists(home / "scripts"));
  }

  TEST_F(ManagedScriptsTest, PendingImportCommitsOnlyNormalizedReferencesAndPreservesIdentity) {
    auto application = app({{"file", file()}, {"arguments", json::array({"literal with spaces", "$not-code; & text"})}});
    json saved;
    managed_scripts::store(home).save_application(application, [&](const auto &value) {
      saved = value;
    });
    EXPECT_EQ(saved.at("uuid"), "generic-app");
    EXPECT_FALSE(saved.contains("scripts-approved"));
    EXPECT_FALSE(saved.at("cmd-script").contains("file"));
    EXPECT_EQ(saved.at("cmd-script").at("arguments"), application.at("cmd-script").at("arguments"));
    EXPECT_TRUE(application.at("cmd-script").contains("file"));
  }

  TEST_F(ManagedScriptsTest, NewRevisionsDoNotChangeExistingReferences) {
    auto first = managed_scripts::store(home).put(file());
    auto update = file("# Second revision\n");
    update["id"] = first.at("id");
    auto second = managed_scripts::store(home).put(update);
    EXPECT_EQ(first.at("id"), second.at("id"));
    EXPECT_NE(first.at("revision"), second.at("revision"));
    EXPECT_EQ(managed_scripts::store(home).read(first).at("revision"), first.at("revision"));
    EXPECT_THROW(managed_scripts::store(home).put(update), std::exception);
  }

  TEST_F(ManagedScriptsTest, SavedReferencesBlockDeletion) {
    auto reference = managed_scripts::store(home).put(file());
    auto applications = json {{"apps", json::array({app(reference)})}};
    EXPECT_THROW(managed_scripts::store(home).remove(reference.at("id"), applications), std::exception);
    EXPECT_EQ(managed_scripts::store(home).list(applications).at(0).at("uses").size(), 1u);
    managed_scripts::store(home).remove(reference.at("id"), {{"apps", json::array()}});
    EXPECT_TRUE(managed_scripts::store(home).list(json::object()).empty());
  }

  TEST_F(ManagedScriptsTest, ExecutionPinsResourcesAndResolvesOnlyTheApprovedRevision) {
    auto reference = managed_scripts::store(home).put(file());
    {
      auto plan = managed_scripts::store(home).resolve(app(reference));
      EXPECT_NE(plan.application.at("cmd").get<std::string>().find(" -File "), std::string::npos);
      EXPECT_EQ(plan.application.at("cmd").get<std::string>().find("ExecutionPolicy"), std::string::npos);
      EXPECT_THROW(managed_scripts::store(home).remove(reference.at("id"), json::object()), std::exception);
      const auto blob = home / "scripts" / reference.at("id").get<std::string>() / (reference.at("revision").get<std::string>() + ".ps1");
      const auto attempt = CreateFileW(blob.c_str(), GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
      EXPECT_EQ(attempt, INVALID_HANDLE_VALUE);
      if (attempt != INVALID_HANDLE_VALUE) {
        CloseHandle(attempt);
      }
    }
    EXPECT_NO_THROW(managed_scripts::store(home).remove(reference.at("id"), json::object()));
  }

  TEST_F(ManagedScriptsTest, TamperedFilesCannotBeResolvedOrRead) {
    auto reference = managed_scripts::store(home).put(file());
    const auto blob = home / "scripts" / reference.at("id").get<std::string>() / (reference.at("revision").get<std::string>() + ".ps1");
    std::ofstream(blob, std::ios::binary | std::ios::trunc) << "# Changed";
    EXPECT_THROW(managed_scripts::store(home).resolve(app(reference)), std::exception);
    EXPECT_THROW(managed_scripts::store(home).read(reference), std::exception);
  }

  TEST_F(ManagedScriptsTest, QuotingAndNullArgumentsAreRejectedBeforeSaving) {
    auto reference = managed_scripts::store(home).put(file());
    for (const auto &value : {std::string("a\"b"), std::string("line\nnext"), std::string(), std::string("a\0b", 3)}) {
      reference["arguments"] = json::array({value});
      EXPECT_THROW(managed_scripts::store(home).save_application(app(reference), [](const auto &) {
      }),
                   std::exception);
    }
  }

  TEST_F(ManagedScriptsTest, MixedManualAndManagedCommandsAreNeverSaved) {
    auto application = app({{"file", file()}});
    application["cmd"] = "a manual command";
    EXPECT_THROW(managed_scripts::store(home).save_application(application, [](const auto &) {
    }),
                 std::exception);
    EXPECT_FALSE(fs::exists(home / "scripts"));
  }

  TEST_F(ManagedScriptsTest, AtomicWritesReplaceApplicationBytesWithoutPartialContent) {
    const auto path = home / "apps.json";
    managed_scripts::atomic_write(path, "old");
    managed_scripts::atomic_write(path, "new");
    std::ifstream input(path, std::ios::binary);
    EXPECT_EQ(std::string(std::istreambuf_iterator<char>(input), {}), "new");
  }

  TEST_F(ManagedScriptsTest, UncertainApplicationPersistenceRetainsReferencedFiles) {
    json saved;
    EXPECT_THROW(managed_scripts::store(home).save_application(app({{"file", file()}}), [&](const auto &value) {
      saved = value;
      throw std::runtime_error("Test-owned uncertain persistence");
    }),
                 std::exception);
    ASSERT_TRUE(saved.contains("cmd-script"));
    EXPECT_NO_THROW(managed_scripts::store(home).read(saved.at("cmd-script")));
  }

  TEST_F(ManagedScriptsTest, UnrelatedLegacyDataDoesNotPreventListingOrManualSaves) {
    auto reference = managed_scripts::store(home).put(file());
    auto legacy = json {{"name", "Legacy"}, {"prep-cmd", "legacy-value"}};
    EXPECT_EQ(managed_scripts::store(home).list({{"apps", json::array({legacy})}}).size(), 1u);
    json saved;
    managed_scripts::store(home).save_application(legacy, [&](const auto &value) {
      saved = value;
    });
    EXPECT_EQ(saved, legacy);
  }

  TEST_F(ManagedScriptsTest, DeletionDoesNotRecursivelyRemoveUnknownFiles) {
    auto reference = managed_scripts::store(home).put(file());
    const auto directory = home / "scripts" / reference.at("id").get<std::string>();
    std::ofstream(directory / "unrelated.txt") << "Test-owned unknown file";
    EXPECT_THROW(managed_scripts::store(home).remove(reference.at("id"), json::object()), std::exception);
    EXPECT_TRUE(managed_scripts::store(home).list(json::object()).empty());
    bool preserved = false;
    for (const auto &entry : fs::directory_iterator(home / "scripts")) {
      if (entry.path().filename().string().starts_with(".deleted-")) {
        preserved = fs::exists(entry.path() / "unrelated.txt");
      }
    }
    EXPECT_TRUE(preserved);
  }
}  // namespace
#endif
