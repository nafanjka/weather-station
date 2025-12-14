#pragma once

#include <Arduino.h>
#include <WiFiClient.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>

class WeatherService;
class ManagedWiFi;
class OutdoorService;

struct MqttConfig {
  bool enabled = false;
  bool haDiscovery = true;
  uint32_t publishIntervalMs = 30000;
  String host;
  uint16_t port = 1883;
  String username;
  String password;
  String baseTopic = "homeassistant/weatherstation";
  String deviceName = "ESP Weather Station";
  String city;
  String country;
};

class MqttService {
public:
  void begin(ManagedWiFi *wifi, WeatherService *weather, OutdoorService *outdoor);
  void loop();

  MqttConfig currentConfig() const { return config; }
  bool saveConfig(const MqttConfig &next);
  void loadConfig();
  bool isConnected();

private:
  bool ensureConnected();
  void disconnect();
  void publishStatus(const char *status, bool retain = true);
  void publishTelemetry();
  void publishDiscovery();
  void publishSensorConfig(const String &id, const String &name, const String &templatePath, const char *unit, const char *deviceClass, const char *icon = nullptr);
  String stateTopic() const;
  String statusTopic() const;
  String discoveryPrefix() const;
  String deviceId() const;
  bool addFinite(JsonObject obj, const char *key, float value);
  void sanitizeBaseTopic();

  ManagedWiFi *wifiRef = nullptr;
  WeatherService *weatherRef = nullptr;
  Preferences prefs;
  WiFiClient wifiClient;
  PubSubClient client{wifiClient};
  OutdoorService *outdoorRef = nullptr;
  MqttConfig config;
  unsigned long lastPublish = 0;
  unsigned long lastDiscovery = 0;
  unsigned long lastReconnectAttempt = 0;
  bool discoverySent = false;
};
