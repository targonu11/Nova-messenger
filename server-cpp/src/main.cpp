#include "server.h"
#include <iostream>
#include <cstdlib>

int main(int argc, char* argv[]) {
    int port = 3001;
    
    if (argc > 1) {
        port = std::atoi(argv[1]);
    }
    
    const char* envPort = std::getenv("PORT");
    if (envPort) {
        port = std::atoi(envPort);
    }
    
    try {
        MessengerServer server;
        server.run(port);
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
