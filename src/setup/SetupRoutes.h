#pragma once

#include <functional>
#include <ESPAsyncWebServer.h>

class ManagedWiFi;

// Registers all Wi-Fi and OTA related routes plus setup static assets.
class MqttService;

void registerSetupRoutes(
    AsyncWebServer &server,
    ManagedWiFi &wifiManager,
    std::function<void()> onOtaSuccess = nullptr,
    MqttService *mqtt = nullptr);
