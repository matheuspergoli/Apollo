#include <gtest/gtest.h>

#include <nlohmann/json.hpp>
#include <fstream>
#include <regex>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {
  std::string read_file(const std::string &path) {
    std::ifstream input(path);
    if (!input) throw std::runtime_error("Missing contract fixture: " + path);
    std::ostringstream content;
    content << input.rdbuf();
    return content.str();
  }

  auto schema() {
    return nlohmann::json::parse(read_file("dashboard/src/features/settings/schema.json"));
  }

  std::set<std::string> native_options() {
    const auto content = read_file("src/config.cpp");
    const std::regex pattern(R"option(\b\w+_f\s*\(\s*vars\s*,\s*"([^"]+)")option");
    std::set<std::string> result;
    for (auto it = std::sregex_iterator(content.begin(), content.end(), pattern); it != std::sregex_iterator(); ++it) {
      result.insert((*it)[1].str());
    }
    return result;
  }
}

TEST(ConfigConsistencyTest, AllActiveNativeOptionsHaveExactlyOneUiField) {
  std::set<std::string> ui_options;
  for (const auto &section : schema()) {
    for (const auto &field : section.at("fields")) {
      const auto key = field.at("key").get<std::string>();
      EXPECT_TRUE(ui_options.insert(key).second) << "Duplicate UI option: " << key;
      EXPECT_TRUE(field.contains("defaultValue")) << key;
      EXPECT_FALSE(field.at("label").get<std::string>().empty()) << key;
    }
  }
  EXPECT_EQ(ui_options.size(), 102);
  EXPECT_EQ(ui_options, native_options());
  EXPECT_FALSE(ui_options.contains("locale"));
  EXPECT_FALSE(ui_options.contains("dd_wa_hdr_toggle"));
}

TEST(ConfigConsistencyTest, FixedPortugueseUiHasNoLanguageEndpoint) {
  const auto html = read_file("dashboard/index.html");
  const auto server = read_file("src/confighttp.cpp");
  EXPECT_NE(html.find("lang=\"pt-BR\""), std::string::npos);
  EXPECT_EQ(server.find("/api/configLocale"), std::string::npos);
  EXPECT_EQ(server.find("void getLocale("), std::string::npos);
  EXPECT_NE(server.find("input_tree.contains(\"locale\")"), std::string::npos);
}
