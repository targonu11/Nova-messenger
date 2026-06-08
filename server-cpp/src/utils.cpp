#include "utils.h"
#include <random>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <ctime>

namespace utils {

std::string base64_encode(const std::string& data) {
    static const char base64_chars[] = 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    std::string encoded;
    int val = 0, valb = -6;
    for (unsigned char c : data) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            encoded.push_back(base64_chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) encoded.push_back(base64_chars[((val << 8) >> (valb + 8)) & 0x3F]);
    while (encoded.size() % 4) encoded.push_back('=');
    return encoded;
}

std::string base64_decode(const std::string& encoded) {
    static const int base64_index[] = {
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, -1, -1, -1, 63,
        52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1,
        -1,  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14,
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1,
        -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
        41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1
    };
    
    std::string decoded;
    int val = 0, valb = -8;
    for (unsigned char c : encoded) {
        if (base64_index[c] == -1) break;
        val = (val << 6) + base64_index[c];
        valb += 6;
        if (valb >= 0) {
            decoded.push_back(char((val >> valb) & 0xFF));
            valb -= 8;
        }
    }
    return decoded;
}

TokenPayload parseToken(const std::string& token) {
    TokenPayload payload;
    try {
        std::string decoded = base64_decode(token);
        // Simple JSON parsing for {"userId":"...","at":...}
        size_t userIdPos = decoded.find("\"userId\"");
        size_t atPos = decoded.find("\"at\"");
        
        if (userIdPos != std::string::npos && atPos != std::string::npos) {
            size_t start = decoded.find('"', userIdPos + 8) + 1;
            size_t end = decoded.find('"', start);
            payload.userId = decoded.substr(start, end - start);
            
            start = decoded.find_first_of("0123456789", atPos);
            end = decoded.find_first_not_of("0123456789", start);
            payload.timestamp = std::stoll(decoded.substr(start, end - start));
        }
    } catch (...) {
        // Invalid token
    }
    return payload;
}

std::string createToken(const std::string& userId) {
    std::time_t now = std::time(nullptr);
    std::stringstream ss;
    ss << "{\"userId\":\"" << userId << "\",\"at\":" << now << "}";
    return base64_encode(ss.str());
}

std::string generateUuid() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);
    static std::uniform_int_distribution<> dis2(8, 11);
    
    std::stringstream ss;
    ss << std::hex;
    for (int i = 0; i < 8; i++) ss << dis(gen);
    ss << "-";
    for (int i = 0; i < 4; i++) ss << dis(gen);
    ss << "-4";
    for (int i = 0; i < 3; i++) ss << dis(gen);
    ss << "-";
    ss << dis2(gen);
    for (int i = 0; i < 3; i++) ss << dis(gen);
    ss << "-";
    for (int i = 0; i < 12; i++) ss << dis(gen);
    return ss.str();
}

std::string trim(const std::string& str) {
    size_t first = str.find_first_not_of(" \t\n\r");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\n\r");
    return str.substr(first, (last - first + 1));
}

std::string toLower(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(), ::tolower);
    return result;
}

}
