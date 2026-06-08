cmake_minimum_required(VERSION 3.15)
project(game_messenger_server_cpp)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find SQLite3
find_package(SQLite3 QUIET)
if(NOT SQLite3_FOUND)
    # Try to find SQLite3 manually
    find_path(SQLITE3_INCLUDE_DIR sqlite3.h
        PATHS
        ${CMAKE_SOURCE_DIR}/third_party/sqlite3
        /usr/include
        /usr/local/include
        "C:/vcpkg/installed/x64-windows/include"
    )
    find_library(SQLITE3_LIBRARY
        NAMES sqlite3 sqlite
        PATHS
        ${CMAKE_SOURCE_DIR}/third_party/sqlite3
        /usr/lib
        /usr/local/lib
        "C:/vcpkg/installed/x64-windows/lib"
    )
    if(SQLITE3_INCLUDE_DIR AND SQLITE3_LIBRARY)
        set(SQLite3_FOUND TRUE)
        set(SQLITE3_INCLUDE_DIRS ${SQLITE3_INCLUDE_DIR})
        set(SQLITE3_LIBRARIES ${SQLITE3_LIBRARY})
    endif()
endif()

if(NOT SQLite3_FOUND)
    message(WARNING "SQLite3 not found. Please install it or set SQLITE3_INCLUDE_DIR and SQLITE3_LIBRARY")
    # Try to continue anyway - SQLite3 might be in system paths
    set(SQLITE3_INCLUDE_DIRS "")
    set(SQLITE3_LIBRARIES sqlite3)
endif()

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# Source files
set(SOURCES
    src/main.cpp
    src/db.cpp
    src/server.cpp
    src/utils.cpp
)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Link libraries
target_link_libraries(${PROJECT_NAME} 
    ${SQLITE3_LIBRARIES}
)

# Add pthread only on Unix systems
if(UNIX)
    target_link_libraries(${PROJECT_NAME} pthread)
endif()

# Include directories for target
target_include_directories(${PROJECT_NAME} PRIVATE 
    ${SQLITE3_INCLUDE_DIRS}
    ${CMAKE_SOURCE_DIR}/include
)

# Compiler flags
if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE /W4)
else()
    target_compile_options(${PROJECT_NAME} PRIVATE -Wall -Wextra)
endif()

# Download and include Crow
include(FetchContent)
FetchContent_Declare(
    crow
    GIT_REPOSITORY https://github.com/CrowCpp/Crow.git
    GIT_TAG v1.1.0
)
FetchContent_MakeAvailable(crow)
target_link_libraries(${PROJECT_NAME} PRIVATE crow::crow)

# Download and include nlohmann/json
FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)
FetchContent_MakeAvailable(json)
target_link_libraries(${PROJECT_NAME} PRIVATE nlohmann_json::nlohmann_json)

