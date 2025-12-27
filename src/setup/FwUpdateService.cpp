#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
#endif
#include "FwUpdateService.h"
#include <LittleFS.h>
#include <Update.h>
#include <HTTPClient.h>
#include <AsyncJson.h>

FwUpdateService::FwUpdateService() {
  config.repo = "";
  config.board = "";
  config.lastVersion = "";
  config.lastCheck = 0;
}

bool FwUpdateService::load() {
  File f = LittleFS.open(_configPath, "r");
  if (!f) return false;
    DynamicJsonDocument doc(512);
  if (deserializeJson(doc, f)) return false;
  config.repo = doc["repo"] | "";
  config.board = doc["board"] | "";
  config.lastVersion = doc["lastVersion"] | "";
  config.lastCheck = doc["lastCheck"] | 0;
  return true;
}

bool FwUpdateService::save() {
  DynamicJsonDocument doc(512);
  doc["repo"] = config.repo;
  doc["board"] = config.board;
  doc["lastVersion"] = config.lastVersion;
  doc["lastCheck"] = config.lastCheck;
  File f = LittleFS.open(_configPath, "w");
  if (!f) return false;
  serializeJson(doc, f);
  return true;
}

void FwUpdateService::registerRoutes(AsyncWebServer& server) {
  server.on("/api/fwupdate/config", HTTP_GET, [this](AsyncWebServerRequest* req) {
      DynamicJsonDocument doc(256);
    doc["repo"] = config.repo;
    doc["board"] = config.board;
    String out;
    serializeJson(doc, out);
    req->send(200, "application/json", out);
  });
    // Use AsyncCallbackJsonWebHandler for JSON POST
    server.addHandler(new AsyncCallbackJsonWebHandler("/api/fwupdate/config", [this](AsyncWebServerRequest *req, JsonVariant &json) {
      JsonObject obj = json.as<JsonObject>();
      config.repo = obj["repo"] | config.repo;
      config.board = obj["board"] | config.board;
      save();
      req->send(200, "application/json", "{\"ok\":true}");
    }));
  server.on("/api/fwupdate/check", HTTP_GET, [this](AsyncWebServerRequest* req) {
    String newVersion, assetUrl, errorMsg;
    DynamicJsonDocument doc(512);
    doc["repo"] = config.repo;
    doc["board"] = config.board;
    doc["lastVersion"] = config.lastVersion;
    doc["lastCheck"] = config.lastCheck;
    if (checkForUpdate(newVersion, assetUrl, errorMsg)) {
      doc["updateAvailable"] = true;
      doc["version"] = newVersion;
      doc["assetUrl"] = assetUrl;
      if (!errorMsg.isEmpty()) doc["error"] = errorMsg;
    } else {
      doc["updateAvailable"] = false;
      if (!errorMsg.isEmpty()) doc["error"] = errorMsg;
    }
    String out;
    serializeJson(doc, out);
    req->send(200, "application/json", out);
  });
  server.on("/api/fwupdate/update", HTTP_POST, [this](AsyncWebServerRequest* req) {
    if (req->hasParam("plain", true)) {
      DynamicJsonDocument doc(128);
      DeserializationError err = deserializeJson(doc, req->getParam("plain", true)->value());
      if (err) {
        req->send(400, "application/json", "{\"error\":\"bad json\"}");
        return;
      }
      String version = doc["version"] | "";
      String newVersion, assetUrl, errorMsg;
      if (checkForUpdate(newVersion, assetUrl, errorMsg) && newVersion == version) {
        if (downloadAndUpdate(assetUrl, errorMsg)) {
          req->send(200, "application/json", "{\"ok\":true}");
        } else {
          req->send(500, "application/json", String("{\"error\":\"") + errorMsg + "\"}");
        }
      } else {
        req->send(400, "application/json", String("{\"error\":\"") + errorMsg + "\"}");
      }
    } else {
      req->send(400, "application/json", "{\"error\":\"no body\"}");
    }
  });
}

// --- GitHub API logic ---
bool FwUpdateService::checkForUpdate(String& newVersion, String& assetUrl, String& errorMsg) {
  if (config.repo.isEmpty() || config.board.isEmpty()) {
    errorMsg = "Repo or board not set";
    return false;
  }
  HTTPClient http;
  String url = "https://api.github.com/repos/" + config.repo + "/releases/latest";
  http.begin(url);
  int code = http.GET();
  if (code != 200) {
    errorMsg = "GitHub API error: " + String(code);
    http.end();
    return false;
  }
  DynamicJsonDocument doc(4096);
  #if defined(__GNUC__)
  #pragma GCC diagnostic pop
  #endif
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  if (err) {
    errorMsg = "JSON parse error";
    return false;
  }
  String tag = doc["tag_name"] | "";
  if (tag.isEmpty() || tag == config.lastVersion) {
    errorMsg = "No new version";
    return false;
  }
  for (JsonObject asset : doc["assets"].as<JsonArray>()) {
    String name = asset["name"] | "";
    String url = asset["browser_download_url"] | "";
    if (name.indexOf(config.board) >= 0 && name.endsWith(".bin")) {
      newVersion = tag;
      assetUrl = url;
      return true;
    }
  }
  errorMsg = "No asset for board";
  return false;
}

bool FwUpdateService::downloadAndUpdate(const String& assetUrl, String& errorMsg) {
  HTTPClient http;
  http.begin(assetUrl);
  int code = http.GET();
  if (code != 200) {
    errorMsg = "Download error: " + String(code);
    http.end();
    return false;
  }
  int len = http.getSize();
  if (!Update.begin(len == -1 ? UPDATE_SIZE_UNKNOWN : len)) {
    errorMsg = "Update.begin failed";
    http.end();
    return false;
  }
  WiFiClient* stream = http.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  if (!Update.end()) {
    errorMsg = String("Update failed: ") + Update.errorString();
    http.end();
    return false;
  }
  if (!Update.isFinished()) {
    errorMsg = "Update not finished";
    http.end();
    return false;
  }
  config.lastVersion = ""; // force re-check after reboot
  config.lastCheck = millis()/1000;
  save();
  http.end();
  ESP.restart();
  return true;
}
