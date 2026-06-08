#include "db.h"
#include "utils.h"
#include <iostream>
#include <sstream>
#include <filesystem>
#include <ctime>

Database::Database() : db_(nullptr) {}

Database::~Database() {
    close();
}

bool Database::init(const std::string& dbPath) {
    int rc = sqlite3_open(dbPath.c_str(), &db_);
    if (rc != SQLITE_OK) {
        std::cerr << "Can't open database: " << sqlite3_errmsg(db_) << std::endl;
        return false;
    }
    
    // Enable WAL mode
    execute("PRAGMA journal_mode = WAL");
    
    // Create tables
    execute(R"(
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_path TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        );
    )");
    
    execute(R"(
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
    )");
    
    execute(R"(
        CREATE TABLE IF NOT EXISTS group_members (
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at INTEGER DEFAULT (strftime('%s','now')),
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    )");
    
    execute(R"(
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            recipient_type TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            FOREIGN KEY (sender_id) REFERENCES users(id)
        );
    )");
    
    execute("CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_type, recipient_id)");
    execute("CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)");
    
    execute(R"(
        CREATE TABLE IF NOT EXISTS blocks (
            user_id TEXT NOT NULL,
            blocked_user_id TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            PRIMARY KEY (user_id, blocked_user_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (blocked_user_id) REFERENCES users(id)
        );
    )");
    execute("CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id)");
    
    // Add is_deleted if missing (migration)
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, "PRAGMA table_info(messages)", -1, &stmt, nullptr) == SQLITE_OK) {
        bool hasIsDeleted = false;
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            const char* name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            if (name && std::string(name) == "is_deleted") { hasIsDeleted = true; break; }
        }
        sqlite3_finalize(stmt);
        if (!hasIsDeleted) execute("ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0");
    }
    
    return true;
}

void Database::close() {
    if (db_) {
        sqlite3_close(db_);
        db_ = nullptr;
    }
}

bool Database::execute(const std::string& sql) {
    char* errMsg = nullptr;
    int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return false;
    }
    return true;
}

std::string Database::generateUuid() {
    return utils::generateUuid();
}

User Database::getUserByLogin(const std::string& login, const std::string& password) {
    User user;
    sqlite3_stmt* stmt;
    const char* sql = "SELECT id, login, display_name, avatar_path, created_at FROM users WHERE login = ? AND password = ?";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, login.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, password.c_str(), -1, SQLITE_STATIC);
        
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            user.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            user.login = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            user.displayName = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            const char* avatar = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            user.avatarPath = avatar ? avatar : "";
            user.createdAt = sqlite3_column_int(stmt, 4);
        }
        sqlite3_finalize(stmt);
    }
    return user;
}

User Database::getUserById(const std::string& id) {
    User user;
    sqlite3_stmt* stmt;
    const char* sql = "SELECT id, login, display_name, avatar_path, created_at FROM users WHERE id = ?";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_STATIC);
        
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            user.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            user.login = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            user.displayName = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            const char* avatar = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            user.avatarPath = avatar ? avatar : "";
            user.createdAt = sqlite3_column_int(stmt, 4);
        }
        sqlite3_finalize(stmt);
    }
    return user;
}

std::vector<User> Database::getAllUsers() {
    std::vector<User> users;
    sqlite3_stmt* stmt;
    const char* sql = "SELECT id, login, display_name, avatar_path FROM users ORDER BY display_name";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            User user;
            user.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            user.login = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            user.displayName = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            const char* avatar = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            user.avatarPath = avatar ? avatar : "";
            users.push_back(user);
        }
        sqlite3_finalize(stmt);
    }
    return users;
}

bool Database::updateUserAvatar(const std::string& userId, const std::string& avatarPath) {
    sqlite3_stmt* stmt;
    const char* sql = "UPDATE users SET avatar_path = ? WHERE id = ?";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, avatarPath.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_STATIC);
        
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }
    return false;
}

std::vector<Group> Database::getUserGroups(const std::string& userId) {
    std::vector<Group> groups;
    sqlite3_stmt* stmt;
    const char* sql = "SELECT g.id, g.name, g.created_by, g.created_at FROM groups g "
                      "INNER JOIN group_members gm ON gm.group_id = g.id "
                      "WHERE gm.user_id = ? ORDER BY g.created_at DESC";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_STATIC);
        
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            Group group;
            group.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            group.name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            group.createdBy = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            group.createdAt = sqlite3_column_int(stmt, 3);
            groups.push_back(group);
        }
        sqlite3_finalize(stmt);
    }
    return groups;
}

Group Database::createGroup(const std::string& name, const std::string& createdBy, const std::vector<std::string>& memberIds) {
    Group group;
    group.id = generateUuid();
    group.name = name;
    group.createdBy = createdBy;
    
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO groups (id, name, created_by) VALUES (?, ?, ?)";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, group.id.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, group.name.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 3, createdBy.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    
    // Add members
    sql = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        for (const auto& memberId : memberIds) {
            sqlite3_bind_text(stmt, 1, group.id.c_str(), -1, SQLITE_STATIC);
            sqlite3_bind_text(stmt, 2, memberId.c_str(), -1, SQLITE_STATIC);
            sqlite3_step(stmt);
            sqlite3_reset(stmt);
        }
        sqlite3_finalize(stmt);
    }
    
    return group;
}

std::vector<User> Database::getGroupMembers(const std::string& groupId) {
    std::vector<User> members;
    sqlite3_stmt* stmt;
    const char* sql = "SELECT u.id, u.login, u.display_name, u.avatar_path FROM group_members gm "
                      "JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, groupId.c_str(), -1, SQLITE_STATIC);
        
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            User user;
            user.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            user.login = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            user.displayName = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            const char* avatar = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            user.avatarPath = avatar ? avatar : "";
            members.push_back(user);
        }
        sqlite3_finalize(stmt);
    }
    return members;
}

bool Database::deleteGroup(const std::string& groupId, const std::string& userId) {
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "SELECT created_by FROM groups WHERE id = ?";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, groupId.c_str(), -1, SQLITE_STATIC);
    if (sqlite3_step(stmt) != SQLITE_ROW) {
        sqlite3_finalize(stmt);
        return false;
    }
    const char* createdBy = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
    sqlite3_finalize(stmt);
    if (!createdBy || std::string(createdBy) != userId)
        return false;
    sql = "DELETE FROM messages WHERE recipient_type = 'group' AND recipient_id = ?";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, groupId.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    sql = "DELETE FROM group_members WHERE group_id = ?";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, groupId.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    sql = "DELETE FROM groups WHERE id = ?";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, groupId.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return true;
}

std::vector<Message> Database::getMessages(const std::string& recipientType, const std::string& recipientId) {
    std::vector<Message> messages;
    sqlite3_stmt* stmt;
    const char* sql = "SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, "
                      "COALESCE(m.is_deleted, 0) FROM messages m WHERE m.recipient_type = ? AND m.recipient_id = ? ORDER BY m.created_at ASC";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, recipientType.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, recipientId.c_str(), -1, SQLITE_STATIC);
        
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            Message msg;
            msg.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            msg.senderId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            msg.recipientType = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            msg.recipientId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            msg.content = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
            msg.createdAt = sqlite3_column_int(stmt, 5);
            msg.isDeleted = (sqlite3_column_int(stmt, 6) != 0);
            
            // Get sender info
            User sender = getUserById(msg.senderId);
            msg.senderName = sender.displayName;
            msg.senderAvatar = sender.avatarPath;
            
            messages.push_back(msg);
        }
        sqlite3_finalize(stmt);
    }
    return messages;
}

bool Database::deleteMessage(const std::string& senderId, const std::string& messageId,
                              std::string& outRecipientType, std::string& outRecipientId) {
    outRecipientType.clear();
    outRecipientId.clear();
    sqlite3_stmt* stmt = nullptr;
    const char* sel = "SELECT recipient_type, recipient_id FROM messages WHERE id = ? AND sender_id = ?";
    if (sqlite3_prepare_v2(db_, sel, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, messageId.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, senderId.c_str(), -1, SQLITE_STATIC);
    if (sqlite3_step(stmt) != SQLITE_ROW) {
        sqlite3_finalize(stmt);
        return false;
    }
    outRecipientType = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
    outRecipientId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
    sqlite3_finalize(stmt);
    stmt = nullptr;
    const char* sql = "UPDATE messages SET is_deleted = 1, content = '' WHERE id = ? AND sender_id = ?";
    bool ok = false;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, messageId.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, senderId.c_str(), -1, SQLITE_STATIC);
        if (sqlite3_step(stmt) == SQLITE_DONE) ok = true;
        sqlite3_finalize(stmt);
    }
    return ok;
}

Message Database::createMessage(const std::string& senderId, const std::string& recipientType,
                                const std::string& recipientId, const std::string& content) {
    Message msg;
    msg.id = generateUuid();
    msg.senderId = senderId;
    msg.recipientType = recipientType;
    msg.recipientId = recipientId;
    msg.content = content;
    msg.createdAt = static_cast<int>(std::time(nullptr));
    
    User sender = getUserById(senderId);
    msg.senderName = sender.displayName;
    msg.senderAvatar = sender.avatarPath;
    
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO messages (id, sender_id, recipient_type, recipient_id, content) VALUES (?, ?, ?, ?, ?)";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, msg.id.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, msg.senderId.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 3, msg.recipientType.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 4, msg.recipientId.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 5, msg.content.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    
    return msg;
}

bool Database::deleteDirectMessages(const std::string& userId1, const std::string& userId2) {
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "DELETE FROM messages WHERE recipient_type = 'user' AND ("
                      "(sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, userId1.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, userId2.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, userId2.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 4, userId1.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return true;
}

bool Database::blockUser(const std::string& userId, const std::string& blockedUserId) {
    if (userId.empty() || blockedUserId.empty() || userId == blockedUserId) return false;
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "INSERT OR IGNORE INTO blocks (user_id, blocked_user_id) VALUES (?, ?)";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, blockedUserId.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return true;
}

bool Database::unblockUser(const std::string& userId, const std::string& blockedUserId) {
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "DELETE FROM blocks WHERE user_id = ? AND blocked_user_id = ?";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, blockedUserId.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return true;
}

std::vector<std::string> Database::getBlockedUserIds(const std::string& userId) {
    std::vector<std::string> ids;
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "SELECT blocked_user_id FROM blocks WHERE user_id = ?";
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return ids;
    sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_STATIC);
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        const char* id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        if (id) ids.push_back(id);
    }
    sqlite3_finalize(stmt);
    return ids;
}

void Database::seedUsers() {
    const std::vector<std::string> logins = {"alice", "bob", "carol", "dave", "eve", "frank", "grace", "henry", "iris", "jack",
                                              "kate", "leo", "mary", "nick", "olivia", "paul", "quinn", "rose", "sam", "tina"};
    const std::vector<std::string> names = {"Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Henry", "Iris", "Jack",
                                            "Kate", "Leo", "Mary", "Nick", "Olivia", "Paul", "Quinn", "Rose", "Sam", "Tina"};
    
    sqlite3_stmt* stmt;
    const char* sql = "INSERT OR IGNORE INTO users (id, login, password, display_name) VALUES (?, ?, ?, ?)";
    
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        for (size_t i = 0; i < logins.size(); i++) {
            std::string id = generateUuid();
            std::string password = "pass" + std::to_string(i + 1);
            
            sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_STATIC);
            sqlite3_bind_text(stmt, 2, logins[i].c_str(), -1, SQLITE_STATIC);
            sqlite3_bind_text(stmt, 3, password.c_str(), -1, SQLITE_STATIC);
            sqlite3_bind_text(stmt, 4, names[i].c_str(), -1, SQLITE_STATIC);
            sqlite3_step(stmt);
            sqlite3_reset(stmt);
        }
        sqlite3_finalize(stmt);
    }
}
