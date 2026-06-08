#pragma once

#include "crow.h"
#include "db.h"
#include <map>
#include <memory>
#include <mutex>
#include <string>

class MessengerServer {
public:
    MessengerServer();
    ~MessengerServer();
    
    void setupRoutes();
    void run(int port = 3001);
    
private:
    Database db_;
    crow::SimpleApp app_;
    std::map<std::string, crow::websocket::connection*> userConnections_;
    std::mutex connectionsMutex_;
    
    // HTTP handlers
    void setupAuthRoutes();
    void setupUserRoutes();
    void setupGroupRoutes();
    void setupMessageRoutes();
    void setupFileRoutes();
    void setupWebSocketRoutes();
    
    // Helper methods
    std::string getUserIdFromToken(const std::string& token);
    void broadcastToUser(const std::string& userId, const std::string& event, const std::string& data);
    void broadcastToGroup(const std::string& groupId, const std::string& event, const std::string& data, const std::string& excludeUserId = "");
};
