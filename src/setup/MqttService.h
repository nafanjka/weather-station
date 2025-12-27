#pragma once

#include <Arduino.h>
#include <WiFiClient.h>
#include "../common/DeviceHelpers.h"
#include <PubSubClient.h>
#include <Preferences.h>

class ManagedWiFi;

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

// Handles MQTT config persistence and connection management.
class MqttService {
public:
  void begin(ManagedWiFi *wifi);
  void loop();

  MqttConfig currentConfig() const { return config; }
  bool saveConfig(const MqttConfig &next);
  void loadConfig();
  bool isConnected();

  PubSubClient &client() { return mqttClient; }

  String deviceId() const;
  String baseTopic() const { return config.baseTopic; }
  String statusTopic() const;
  String stateTopic() const; // kept for compatibility with publishers

  bool publish(const String &topic, const String &payload, bool retain = false);
  bool publishStatus(const char *status, bool retain = true);

private:
  bool ensureConnected();
  void disconnect();
  void sanitizeBaseTopic();

  ManagedWiFi *wifiRef = nullptr;
  Preferences prefs;
  WiFiClient wifiClient;
  PubSubClient mqttClient{wifiClient};
  MqttConfig config;
  unsigned long lastReconnectAttempt = 0;
};
