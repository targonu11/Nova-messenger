#pragma once

#include <string>
#include <vector>
#include <memory>
#include <sqlite3.h>

struct User {
    std::string id;
    std::string login;
    std::string password;
    std::string displayName;
    std::string avatarPath;
    int createdAt;
};

struct Group {
    std::string id;
    std::string name;
    std::string createdBy;
    int createdAt;
};

struct Message {
    std::string id;
    std::string senderId;
    std::string senderName;
    std::string senderAvatar;
    std::string recipientType;
    std::string recipientId;
    std::string content;
    int createdAt;
    bool isDeleted = false;
};

class Database {
public:
    Database();
    ~Database();
    
    bool init(const std::string& dbPath = "messenger.db");
    void close();
    
    // User operations
    User getUserByLogin(const std::string& login, const std::string& password);
    User getUserById(const std::string& id);
    std::vector<User> getAllUsers();
    bool updateUserAvatar(const std::string& userId, const std::string& avatarPath);
    
    // Group operations
    std::vector<Group> getUserGroups(const std::string& userId);
    Group createGroup(const std::string& name, const std::string& createdBy, const std::vector<std::string>& memberIds);
    std::vector<User> getGroupMembers(const std::string& groupId);
    bool deleteGroup(const std::string& groupId, const std::string& userId);
    
    // Message operations
    std::vector<Message> getMessages(const std::string& recipientType, const std::string& recipientId);
    Message createMessage(const std::string& senderId, const std::string& recipientType, 
                         const std::string& recipientId, const std::string& content);
    bool deleteMessage(const std::string& senderId, const std::string& messageId,
                       std::string& outRecipientType, std::string& outRecipientId);
    bool deleteDirectMessages(const std::string& userId1, const std::string& userId2);
    
    // Block operations
    bool blockUser(const std::string& userId, const std::string& blockedUserId);
    bool unblockUser(const std::string& userId, const std::string& blockedUserId);
    std::vector<std::string> getBlockedUserIds(const std::string& userId);
    
    // Seed data
    void seedUsers();
    
private:
    sqlite3* db_;
    bool execute(const std::string& sql);
    std::string generateUuid();
};
