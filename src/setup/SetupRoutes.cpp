#include "SetupRoutes.h"

#include <Arduino.h>
#include <AsyncJson.h>
#include <LittleFS.h>
#include <Update.h>
#include <WiFi.h>

#include "ManagedWiFi.h"
#include "common/ResponseHelpers.h"
#include "setup/MqttService.h"

namespace {
String modeToString(ManagedWiFi::Mode mode) {
  switch (mode) {
    case ManagedWiFi::Mode::Station:
      return "station";
    case ManagedWiFi::Mode::AccessPoint:
      return "ap";
    case ManagedWiFi::Mode::StationAndAP:
      return "sta+ap";
  }
  return "station";
}
}

void registerSetupRoutes(AsyncWebServer &server, ManagedWiFi &wifiManager, std::function<void()> onOtaSuccess, MqttService *mqtt) {
  server.on("/api/system/state", HTTP_GET, [&wifiManager](AsyncWebServerRequest *request) {
    sendJson(request, [&wifiManager](JsonVariant json) {
      JsonObject obj = json.as<JsonObject>();
      obj["connected"] = wifiManager.isConnected();
      obj["mode"] = modeToString(wifiManager.currentMode());
      obj["ssid"] = wifiManager.connectedSSID();
      obj["apSSID"] = wifiManager.apSSID();
      obj["ip"] = WiFi.localIP().toString();
      obj["apIP"] = WiFi.softAPIP().toString();
      obj["hasCredentials"] = wifiManager.hasCredentials();
      obj["hostName"] = wifiManager.hostName();
      if (wifiManager.isConnected()) {
        obj["rssi"] = WiFi.RSSI();
        obj["mac"] = WiFi.macAddress();
        obj["bssid"] = WiFi.BSSIDstr();
      } else {
        obj["rssi"] = nullptr;
        obj["mac"] = WiFi.softAPmacAddress();
        obj["bssid"] = nullptr;
      }
    });
  });

  auto *hostNameHandler = new AsyncCallbackJsonWebHandler("/api/system/hostname", [&wifiManager](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }
    JsonObject obj = json.as<JsonObject>();
    if (!obj["hostName"].is<const char *>()) {
      request->send(400, "application/json", "{\"error\":\"hostname required\"}");
      return;
    }
    String next = obj["hostName"].as<const char *>();
    next.trim();
    if (next.isEmpty()) {
      request->send(400, "application/json", "{\"error\":\"hostname required\"}");
      return;
    }
    bool ok = wifiManager.saveHostName(next);
    if (!ok) {
      request->send(500, "application/json", "{\"error\":\"save failed\"}");
      return;
    }
    request->send(200, "application/json", "{\"status\":\"saved\"}");
  });
  hostNameHandler->setMethod(HTTP_POST);
  server.addHandler(hostNameHandler);

  server.on("/api/mqtt/config", HTTP_GET, [mqtt](AsyncWebServerRequest *request) {
    if (!mqtt) {
      request->send(500, "application/json", "{\"error\":\"mqtt not available\"}");
      return;
    }
    sendJson(request, [mqtt](JsonVariant json) {
      JsonObject obj = json.as<JsonObject>();
      MqttConfig cfg = mqtt->currentConfig();
      obj["enabled"] = cfg.enabled;
      obj["haDiscovery"] = cfg.haDiscovery;
      obj["publishIntervalMs"] = cfg.publishIntervalMs;
      obj["host"] = cfg.host;
      obj["port"] = cfg.port;
      obj["username"] = cfg.username;
      obj["password"] = cfg.password;
      obj["baseTopic"] = cfg.baseTopic;
      obj["deviceName"] = cfg.deviceName;
      obj["city"] = cfg.city;
      obj["country"] = cfg.country;
      obj["connected"] = mqtt->isConnected();
    });
  });

  auto *mqttSaveHandler = new AsyncCallbackJsonWebHandler("/api/mqtt/config", [mqtt](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!mqtt) {
      request->send(500, "application/json", "{\"error\":\"mqtt not available\"}");
      return;
    }
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }
    JsonObject obj = json.as<JsonObject>();
    MqttConfig cfg = mqtt->currentConfig();
    cfg.enabled = obj["enabled"].is<bool>() ? obj["enabled"].as<bool>() : cfg.enabled;
    cfg.haDiscovery = obj["haDiscovery"].is<bool>() ? obj["haDiscovery"].as<bool>() : cfg.haDiscovery;
    if (obj["publishIntervalMs"].is<unsigned>()) cfg.publishIntervalMs = obj["publishIntervalMs"].as<unsigned>();
    if (obj["host"].is<const char *>()) cfg.host = obj["host"].as<const char *>();
    if (obj["port"].is<unsigned>()) cfg.port = obj["port"].as<unsigned>();
    if (obj["username"].is<const char *>()) cfg.username = obj["username"].as<const char *>();
    if (obj["password"].is<const char *>()) cfg.password = obj["password"].as<const char *>();
    if (obj["baseTopic"].is<const char *>()) cfg.baseTopic = obj["baseTopic"].as<const char *>();
    if (obj["deviceName"].is<const char *>()) cfg.deviceName = obj["deviceName"].as<const char *>();
    if (obj["city"].is<const char *>()) cfg.city = obj["city"].as<const char *>();
    if (obj["country"].is<const char *>()) cfg.country = obj["country"].as<const char *>();
    mqtt->saveConfig(cfg);
    request->send(200, "application/json", "{\"status\":\"saved\"}");
  });
  mqttSaveHandler->setMethod(HTTP_POST);
  server.addHandler(mqttSaveHandler);

  server.on("/api/wifi/scan", HTTP_POST, [&wifiManager](AsyncWebServerRequest *request) {
    wifiManager.requestScan();
    request->send(202, "application/json", "{\"status\":\"started\"}");
  });

  server.on("/api/wifi/scan", HTTP_GET, [&wifiManager](AsyncWebServerRequest *request) {
    sendJson(request, [&wifiManager](JsonVariant json) {
      JsonObject obj = json.as<JsonObject>();
      obj["inProgress"] = wifiManager.scanInProgress();
      JsonArray arr = obj["networks"].to<JsonArray>();
      for (const auto &net : wifiManager.getScanResults()) {
        JsonObject item = arr.add<JsonObject>();
        item["ssid"] = net.ssid;
        item["rssi"] = net.rssi;
        item["secure"] = net.secure;
        item["channel"] = net.channel;
      }
    });
  });

  auto *wifiConnectHandler = new AsyncCallbackJsonWebHandler("/api/wifi/connect", [&wifiManager](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }
    JsonObject obj = json.as<JsonObject>();
    if (!obj["ssid"].is<const char *>()) {
      request->send(400, "application/json", "{\"error\":\"ssid required\"}");
      return;
    }
    String ssid = obj["ssid"].as<const char *>();
    String pass = obj["password"].is<const char *>() ? obj["password"].as<const char *>() : "";
    bool ok = wifiManager.saveCredentials(ssid, pass);
    if (ok) {
      request->send(200, "application/json", "{\"status\":\"connecting\"}");
    } else {
      request->send(400, "application/json", "{\"error\":\"save failed\"}");
    }
  });
  wifiConnectHandler->setMethod(HTTP_POST);
  server.addHandler(wifiConnectHandler);

  server.on("/api/wifi/forget", HTTP_POST, [&wifiManager](AsyncWebServerRequest *request) {
    wifiManager.forgetCredentials();
    request->send(200, "application/json", "{\"status\":\"cleared\"}");
  });

  server.on("/api/ota/upload", HTTP_POST,
            [onOtaSuccess](AsyncWebServerRequest *request) {
              bool success = Update.isFinished() && !Update.hasError();
              const char *body = success ? "{\"status\":\"ok\"}" : "{\"error\":\"update_failed\"}";
              int code = success ? 200 : 500;
              AsyncWebServerResponse *response = request->beginResponse(code, "application/json", body);
              response->addHeader("Connection", "close");
              request->send(response);
              if (success && onOtaSuccess) {
                onOtaSuccess();
              }
            },
            [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
              if (!index) {
                Serial.printf("OTA update started: %s\n", filename.c_str());
                if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                  Update.printError(Serial);
                }
              }
              if (len && !Update.hasError()) {
                if (Update.write(data, len) != len) {
                  Update.printError(Serial);
                }
              }
              if (final) {
                if (Update.end(true)) {
                  Serial.printf("OTA update success (%u bytes).\n", static_cast<unsigned>(index + len));
                } else {
                  Update.printError(Serial);
                }
              }
            });

  server.on("/api/fs/upload", HTTP_POST,
            [onOtaSuccess](AsyncWebServerRequest *request) {
              bool success = Update.isFinished() && !Update.hasError();
              String body;
              int code = success ? 200 : 500;
              if (success) {
                body = "{\"status\":\"ok\"}";
              } else {
                body = "{\"error\":\"fs_update_failed\",\"detail\":\"" + String(Update.errorString()) + "\"}";
              }
              AsyncWebServerResponse *response = request->beginResponse(code, "application/json", body);
              response->addHeader("Connection", "close");
              request->send(response);
              if (success && onOtaSuccess) {
                onOtaSuccess();
              }
            },
            [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
              if (!index) {
                Serial.printf("FS OTA update started: %s\n", filename.c_str());
                if (LittleFS.begin()) {
                  LittleFS.end();
                }
                if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_SPIFFS)) {
                  Serial.print("FS OTA begin failed: ");
                  Update.printError(Serial);
                }
              }
              if (len && !Update.hasError()) {
                if (Update.write(data, len) != len) {
                  Serial.print("FS OTA write failed: ");
                  Update.printError(Serial);
                }
              }
              if (final) {
                if (Update.end(true)) {
                  Serial.printf("FS OTA update success (%u bytes).\n", static_cast<unsigned>(index + len));
                } else {
                  Serial.print("FS OTA end failed: ");
                  Update.printError(Serial);
                }
              }
            });

  auto &setupHandler = server.serveStatic("/setup", LittleFS, "/setup/");
  setupHandler.setDefaultFile("wifi.html");
  server.serveStatic("/setup/setup.css", LittleFS, "/setup/setup.css");

  server.on("/wifi.html", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/setup/wifi.html");
  });

  server.on("/setup", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/setup/");
  });

  server.on("/ota.html", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/setup/ota.html");
  });

  server.on("/styles.css", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/setup/setup.css");
  });

  server.on("/ui.js", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/setup/setup.js");
  });
}
