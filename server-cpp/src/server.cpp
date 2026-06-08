#include "server.h"
#include "utils.h"
#include "db.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <ctime>
#include <nlohmann/json.hpp>
#include <mutex>

using json = nlohmann::json;

MessengerServer::MessengerServer() {
    if (!db_.init()) {
        std::cerr << "Failed to initialize database" << std::endl;
        exit(1);
    }
    
    // Seed users if database is empty
    if (db_.getAllUsers().empty()) {
        db_.seedUsers();
        std::cout << "Database seeded with 20 users." << std::endl;
    }
    
    setupRoutes();
}

MessengerServer::~MessengerServer() {
    db_.close();
}

std::string MessengerServer::getUserIdFromToken(const std::string& token) {
    utils::TokenPayload payload = utils::parseToken(token);
    return payload.userId;
}

void MessengerServer::setupRoutes() {
    setupAuthRoutes();
    setupUserRoutes();
    setupGroupRoutes();
    setupMessageRoutes();
    setupFileRoutes();
    setupWebSocketRoutes();
    
    // CORS middleware
    CROW_ROUTE(app_, "/")
    .methods("OPTIONS"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return res;
    });
}

void MessengerServer::setupAuthRoutes() {
    CROW_ROUTE(app_, "/api/auth/login")
    .methods("POST"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        try {
            auto body = json::parse(req.body);
            std::string login = body.value("login", "");
            std::string password = body.value("password", "");
            
            User user = db_.getUserByLogin(login, password);
            if (user.id.empty()) {
                res.code = 401;
                res.body = json({{"error", "Invalid login or password"}}).dump();
                res.set_header("Content-Type", "application/json");
                return res;
            }
            
            std::string token = utils::createToken(user.id);
            json response = {
                {"token", token},
                {"user", {
                    {"id", user.id},
                    {"login", user.login},
                    {"displayName", user.displayName},
                    {"avatarPath", user.avatarPath}
                }}
            };
            
            res.body = response.dump();
            res.set_header("Content-Type", "application/json");
        } catch (...) {
            res.code = 400;
            res.body = json({{"error", "Invalid request"}}).dump();
            res.set_header("Content-Type", "application/json");
        }
        
        return res;
    });
}

void MessengerServer::setupUserRoutes() {
    CROW_ROUTE(app_, "/api/users")
    .methods("GET"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        auto users = db_.getAllUsers();
        json usersJson = json::array();
        for (const auto& user : users) {
            usersJson.push_back({
                {"id", user.id},
                {"login", user.login},
                {"displayName", user.displayName},
                {"avatarPath", user.avatarPath}
            });
        }
        
        res.body = usersJson.dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
    
    CROW_ROUTE(app_, "/api/users/me/blocked")
    .methods("GET"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        auto ids = db_.getBlockedUserIds(userId);
        res.body = json(ids).dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
    
    CROW_ROUTE(app_, "/api/users/me/block/<string>")
    .methods("POST"_method, "DELETE"_method, "OPTIONS"_method)
    ([this](const crow::request& req, std::string targetUserId) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method == "OPTIONS"_method) { res.code = 204; return res; }
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty() || targetUserId.empty() || userId == targetUserId) {
            res.code = 400;
            res.body = json({{"error", "Invalid user"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        if (req.method == "POST"_method) {
            db_.blockUser(userId, targetUserId);
        } else {
            db_.unblockUser(userId, targetUserId);
        }
        res.body = json({{"ok", true}}).dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
}

void MessengerServer::setupGroupRoutes() {
    CROW_ROUTE(app_, "/api/groups")
    .methods("GET"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        auto groups = db_.getUserGroups(userId);
        json groupsJson = json::array();
        for (const auto& group : groups) {
            groupsJson.push_back({
                {"id", group.id},
                {"name", group.name},
                {"createdBy", group.createdBy},
                {"createdAt", group.createdAt}
            });
        }
        
        res.body = groupsJson.dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
    
    CROW_ROUTE(app_, "/api/groups")
    .methods("POST"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        try {
            auto body = json::parse(req.body);
            std::string name = utils::trim(body.value("name", ""));
            auto memberIds = body.value("memberIds", json::array());
            
            if (name.empty() || !memberIds.is_array()) {
                res.code = 400;
                res.body = json({{"error", "name and memberIds required"}}).dump();
                res.set_header("Content-Type", "application/json");
                return res;
            }
            
            std::vector<std::string> memberIdsVec;
            for (const auto& id : memberIds) {
                memberIdsVec.push_back(id.get<std::string>());
            }
            memberIdsVec.push_back(userId); // Add creator
            
            Group group = db_.createGroup(name, userId, memberIdsVec);
            
            json response = {
                {"id", group.id},
                {"name", group.name}
            };
            
            res.body = response.dump();
            res.set_header("Content-Type", "application/json");
        } catch (...) {
            res.code = 400;
            res.body = json({{"error", "Invalid request"}}).dump();
            res.set_header("Content-Type", "application/json");
        }
        
        return res;
    });
    
    CROW_ROUTE(app_, "/api/groups/<string>")
    .methods("DELETE"_method)
    ([this](const crow::request& req, std::string groupId) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        if (db_.deleteGroup(groupId, userId)) {
            res.body = json({{"deleted", true}}).dump();
            res.set_header("Content-Type", "application/json");
        } else {
            res.code = 403;
            res.body = json({{"error", "Only group creator can delete the group"}}).dump();
            res.set_header("Content-Type", "application/json");
        }
        return res;
    });
    
    CROW_ROUTE(app_, "/api/groups/<string>/members")
    .methods("GET"_method)
    ([this](const crow::request& req, std::string groupId) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        auto members = db_.getGroupMembers(groupId);
        json membersJson = json::array();
        for (const auto& member : members) {
            membersJson.push_back({
                {"id", member.id},
                {"login", member.login},
                {"displayName", member.displayName},
                {"avatarPath", member.avatarPath}
            });
        }
        
        res.body = membersJson.dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
}

void MessengerServer::setupMessageRoutes() {
    CROW_ROUTE(app_, "/api/messages")
    .methods("GET"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string type = req.url_params.get("type");
        std::string id = req.url_params.get("id");
        
        if (type.empty() || id.empty()) {
            res.code = 400;
            res.body = json({{"error", "type and id required"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string recipientType = (type == "group") ? "group" : "user";
        auto messages = db_.getMessages(recipientType, id);
        
        json messagesJson = json::array();
        for (const auto& msg : messages) {
            messagesJson.push_back({
                {"id", msg.id},
                {"senderId", msg.senderId},
                {"senderName", msg.senderName},
                {"senderAvatar", msg.senderAvatar},
                {"content", msg.content},
                {"createdAt", msg.createdAt},
                {"isDeleted", msg.isDeleted}
            });
        }
        
        res.body = messagesJson.dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
    
    CROW_ROUTE(app_, "/api/messages/direct/<string>")
    .methods("DELETE"_method, "OPTIONS"_method)
    ([this](const crow::request& req, std::string otherUserId) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "DELETE, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method == "OPTIONS"_method) { res.code = 204; return res; }
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty() || otherUserId.empty() || userId == otherUserId) {
            res.code = 400;
            res.body = json({{"error", "Invalid user"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        db_.deleteDirectMessages(userId, otherUserId);
        res.body = json({{"ok", true}}).dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
}

void MessengerServer::setupFileRoutes() {
    // Static files for uploads
    CROW_ROUTE(app_, "/uploads/<path>")
    .methods("GET"_method)
    ([this](const crow::request& req, std::string filename) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::filesystem::path uploadPath = std::filesystem::current_path() / "uploads" / filename;
        
        if (!std::filesystem::exists(uploadPath)) {
            res.code = 404;
            return res;
        }
        
        std::ifstream file(uploadPath.string(), std::ios::binary);
        if (!file) {
            res.code = 500;
            return res;
        }
        
        std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        res.body = content;
        
        // Determine content type
        std::string ext = uploadPath.extension().string();
        if (ext == ".jpg" || ext == ".jpeg") res.set_header("Content-Type", "image/jpeg");
        else if (ext == ".png") res.set_header("Content-Type", "image/png");
        else if (ext == ".gif") res.set_header("Content-Type", "image/gif");
        else res.set_header("Content-Type", "application/octet-stream");
        
        return res;
    });
    
    // Upload avatar
    CROW_ROUTE(app_, "/api/users/avatar")
    .methods("POST"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        std::string auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.code = 401;
            res.body = json({{"error", "No token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        std::string token = auth.substr(7);
        std::string userId = getUserIdFromToken(token);
        if (userId.empty()) {
            res.code = 401;
            res.body = json({{"error", "Invalid token"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        // Simple multipart parsing (basic implementation)
        // In production, use a proper multipart parser library
        std::string contentType = req.get_header_value("Content-Type");
        if (contentType.find("multipart/form-data") == std::string::npos) {
            res.code = 400;
            res.body = json({{"error", "No file"}}).dump();
            res.set_header("Content-Type", "application/json");
            return res;
        }
        
        // For now, return a placeholder - full multipart parsing would be needed
        // This is a simplified version
        std::string filename = std::to_string(std::time(nullptr)) + "-avatar.jpg";
        std::string avatarPath = "/uploads/" + filename;
        
        // Create uploads directory if it doesn't exist
        std::filesystem::create_directories("uploads");
        
        // Save file (simplified - would need proper multipart parsing)
        std::filesystem::path uploadPath = std::filesystem::current_path() / "uploads" / filename;
        // In a real implementation, parse multipart/form-data and save the file
        
        db_.updateUserAvatar(userId, avatarPath);
        
        json response = {{"avatarPath", avatarPath}};
        res.body = response.dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
    
    // Voice upload — only supported by Node server; return clear error if using C++ server
    CROW_ROUTE(app_, "/api/voice/upload")
    .methods("POST"_method, "OPTIONS"_method)
    ([this](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        
        if (req.method == "OPTIONS"_method) {
            res.code = 204;
            return res;
        }
        
        res.code = 501;
        res.body = json({{"error", "Voice messages require Node.js server. Run: cd server && npm start"}}).dump();
        res.set_header("Content-Type", "application/json");
        return res;
    });
}

void MessengerServer::setupWebSocketRoutes() {
    CROW_WEBSOCKET_ROUTE(app_, "/socket.io/")
    .onaccept([this](const crow::request& req) {
        return true;
    })
    .onopen([this](crow::websocket::connection& conn) {
        // Connection opened
    })
    .onclose([this](crow::websocket::connection& conn, const std::string& reason) {
        // Remove from connections
        std::lock_guard<std::mutex> lock(connectionsMutex_);
        for (auto it = userConnections_.begin(); it != userConnections_.end();) {
            if (it->second == &conn) {
                userConnections_.erase(it++);
            } else {
                ++it;
            }
        }
    })
    .onmessage([this](crow::websocket::connection& conn, const std::string& data, bool is_binary) {
        if (is_binary) return;
        
        try {
            auto msg = json::parse(data);
            std::string event = msg.value("event", "");
            
            if (event == "auth") {
                std::string token = msg.value("token", "");
                std::string userId = getUserIdFromToken(token);
                if (!userId.empty()) {
                    std::lock_guard<std::mutex> lock(connectionsMutex_);
                    userConnections_[userId] = &conn;
                    json response = {{"event", "auth_ok"}};
                    conn.send_text(response.dump());
                } else {
                    json response = {{"event", "auth_fail"}};
                    conn.send_text(response.dump());
                }
            } else if (event == "send_message") {
                // Get user ID from connection
                std::string currentUserId;
                {
                    std::lock_guard<std::mutex> lock(connectionsMutex_);
                    for (const auto& pair : userConnections_) {
                        if (pair.second == &conn) {
                            currentUserId = pair.first;
                            break;
                        }
                    }
                }
                
                if (currentUserId.empty()) return;
                
                std::string recipientType = msg.value("recipientType", "");
                std::string recipientId = msg.value("recipientId", "");
                std::string content = utils::trim(msg.value("content", ""));
                
                if (content.empty()) return;
                
                Message message = db_.createMessage(currentUserId, recipientType, recipientId, content);
                
                json msgJson = {
                    {"id", message.id},
                    {"senderId", message.senderId},
                    {"senderName", message.senderName},
                    {"senderAvatar", message.senderAvatar},
                    {"content", message.content},
                    {"createdAt", message.createdAt},
                    {"recipientType", recipientType},
                    {"recipientId", recipientId}
                };
                
                json response = {{"event", "new_message"}, {"data", msgJson}};
                
                if (recipientType == "user") {
                    // Send to recipient and sender
                    broadcastToUser(recipientId, "new_message", msgJson.dump());
                    conn.send_text(response.dump());
                } else {
                    // Send to all group members
                    broadcastToGroup(recipientId, "new_message", msgJson.dump(), currentUserId);
                    conn.send_text(response.dump());
                }
            } else if (event == "call:offer" || event == "call:answer" || event == "call:ice" || event == "call:hangup") {
                // Get user ID from connection
                std::string currentUserId;
                {
                    std::lock_guard<std::mutex> lock(connectionsMutex_);
                    for (const auto& pair : userConnections_) {
                        if (pair.second == &conn) {
                            currentUserId = pair.first;
                            break;
                        }
                    }
                }
                
                if (currentUserId.empty()) return;
                
                std::string to = msg.value("to", "");
                bool isGroup = msg.value("isGroup", false);
                std::string groupId = msg.value("groupId", "");
                
                json callData = {
                    {"from", currentUserId},
                    {"event", event}
                };
                
                if (event == "call:offer") {
                    callData["offer"] = msg.value("offer", json{});
                    callData["isGroup"] = isGroup;
                    callData["groupId"] = groupId;
                    
                    if (isGroup && !groupId.empty()) {
                        auto members = db_.getGroupMembers(groupId);
                        for (const auto& member : members) {
                            if (member.id != currentUserId) {
                                json callMsg = {{"event", "call:incoming"}, {"data", callData}};
                                broadcastToUser(member.id, "call:incoming", callData.dump());
                            }
                        }
                    } else if (!to.empty()) {
                        json callMsg = {{"event", "call:incoming"}, {"data", callData}};
                        broadcastToUser(to, "call:incoming", callData.dump());
                    }
                } else if (event == "call:answer") {
                    callData["answer"] = msg.value("answer", json{});
                    if (!to.empty()) {
                        broadcastToUser(to, "call:answer", callData.dump());
                    }
                } else if (event == "call:ice") {
                    callData["candidate"] = msg.value("candidate", json{});
                    if (!to.empty()) {
                        broadcastToUser(to, "call:ice", callData.dump());
                    }
                } else if (event == "call:hangup") {
                    if (!to.empty()) {
                        broadcastToUser(to, "call:hangup", callData.dump());
                    }
                }
            } else if (event == "delete_message") {
                std::string currentUserId;
                {
                    std::lock_guard<std::mutex> lock(connectionsMutex_);
                    for (const auto& pair : userConnections_) {
                        if (pair.second == &conn) {
                            currentUserId = pair.first;
                            break;
                        }
                    }
                }
                if (currentUserId.empty()) return;
                std::string messageId = msg.value("messageId", "");
                if (messageId.empty()) return;
                std::string rtype, rid;
                if (db_.deleteMessage(currentUserId, messageId, rtype, rid)) {
                    json payload = {{"messageId", messageId}, {"recipientType", rtype}, {"recipientId", rid}};
                    if (rtype == "user") {
                        broadcastToUser(rid, "message_deleted", payload.dump());
                        conn.send_text(json({{"event", "message_deleted"}, {"data", payload}}).dump());
                    } else if (!rid.empty()) {
                        broadcastToGroup(rid, "message_deleted", payload.dump(), "");
                        conn.send_text(json({{"event", "message_deleted"}, {"data", payload}}).dump());
                    }
                }
            }
        } catch (const std::exception& e) {
            // Invalid JSON or other error
        }
    });
}

void MessengerServer::broadcastToUser(const std::string& userId, const std::string& event, const std::string& data) {
    std::lock_guard<std::mutex> lock(connectionsMutex_);
    auto it = userConnections_.find(userId);
    if (it != userConnections_.end() && it->second) {
        try {
            json msg = {{"event", event}};
            if (!data.empty()) {
                msg["data"] = json::parse(data);
            }
            it->second->send_text(msg.dump());
        } catch (...) {
            // Failed to send
        }
    }
}

void MessengerServer::broadcastToGroup(const std::string& groupId, const std::string& event, const std::string& data, const std::string& excludeUserId) {
    auto members = db_.getGroupMembers(groupId);
    std::lock_guard<std::mutex> lock(connectionsMutex_);
    
    for (const auto& member : members) {
        if (member.id == excludeUserId) continue;
        auto it = userConnections_.find(member.id);
        if (it != userConnections_.end() && it->second) {
            try {
                json msg = {{"event", event}};
                if (!data.empty()) {
                    msg["data"] = json::parse(data);
                }
                it->second->send_text(msg.dump());
            } catch (...) {
                // Failed to send
            }
        }
    }
}

void MessengerServer::run(int port) {
    std::cout << "Server starting on http://localhost:" << port << std::endl;
    app_.port(port).multithreaded().run();
}
