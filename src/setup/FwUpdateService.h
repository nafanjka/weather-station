#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

struct FwUpdateConfig {
  String repo;
  String board;
  String lastVersion;
  unsigned long lastCheck;
};

class FwUpdateService {
public:
  FwUpdateService();
  bool load();
  bool save();
  void registerRoutes(AsyncWebServer& server);
  FwUpdateConfig config;
  bool checkForUpdate(String& newVersion, String& assetUrl, String& errorMsg);
  bool downloadAndUpdate(const String& assetUrl, String& errorMsg);
private:
  String _configPath = "/fwupdate.json";
};
