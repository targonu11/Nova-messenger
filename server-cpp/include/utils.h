#pragma once

#include <string>
#include <sstream>
#include <iomanip>
#include <random>
#include <algorithm>

namespace utils {
    // Base64 encoding/decoding
    std::string base64_encode(const std::string& data);
    std::string base64_decode(const std::string& encoded);
    
    // Token operations
    struct TokenPayload {
        std::string userId;
        int64_t timestamp;
    };
    
    TokenPayload parseToken(const std::string& token);
    std::string createToken(const std::string& userId);
    
    // UUID generation
    std::string generateUuid();
    
    // String utilities
    std::string trim(const std::string& str);
    std::string toLower(const std::string& str);
}
