add_executable(apollo_ui_contracts ../integration/test_config_consistency.cpp)
target_link_libraries(apollo_ui_contracts PRIVATE gtest_main nlohmann_json::nlohmann_json)
target_compile_features(apollo_ui_contracts PRIVATE cxx_std_23)

foreach(file src/config.cpp src/confighttp.cpp dashboard/index.html dashboard/src/features/settings/schema.json)
    configure_file("${CMAKE_SOURCE_DIR}/${file}" "${CMAKE_CURRENT_BINARY_DIR}/${file}" COPYONLY)
endforeach()
