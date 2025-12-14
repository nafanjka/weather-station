#include "MqttService.h"

#include <WiFi.h>
#include <ESPmDNS.h>

#include "ManagedWiFi.h"

namespace {
constexpr const char *NS = "mqtt";
constexpr unsigned long RECONNECT_INTERVAL_MS = 5000;
}

void MqttService::begin(ManagedWiFi *wifi) {
  wifiRef = wifi;
  loadConfig();
  sanitizeBaseTopic();
}

void MqttService::sanitizeBaseTopic() {
  while (config.baseTopic.endsWith("/")) {
    config.baseTopic.remove(config.baseTopic.length() - 1);
  }
}

void MqttService::loadConfig() {
  prefs.begin(NS, true);
  config.enabled = prefs.getBool("enabled", false);
  config.haDiscovery = prefs.getBool("ha", true);
  config.publishIntervalMs = prefs.getULong("pubInt", 30000);
  config.host = prefs.getString("host", "");
  config.port = static_cast<uint16_t>(prefs.getUShort("port", 1883));
  config.username = prefs.getString("user", "");
  config.password = prefs.getString("pass", "");
  config.baseTopic = prefs.getString("base", "homeassistant/weatherstation");
  config.deviceName = prefs.getString("name", "ESP Weather Station");
  config.city = prefs.getString("city", "");
  config.country = prefs.getString("country", "");
  prefs.end();
  sanitizeBaseTopic();
}

bool MqttService::saveConfig(const MqttConfig &next) {
  prefs.begin(NS, false);
  prefs.putBool("enabled", next.enabled);
  prefs.putBool("ha", next.haDiscovery);
  prefs.putULong("pubInt", next.publishIntervalMs);
  prefs.putString("host", next.host);
  prefs.putUShort("port", next.port);
  prefs.putString("user", next.username);
  prefs.putString("pass", next.password);
  prefs.putString("base", next.baseTopic);
  prefs.putString("name", next.deviceName);
  prefs.putString("city", next.city);
  prefs.putString("country", next.country);
  prefs.end();
  config = next;
  sanitizeBaseTopic();
  lastReconnectAttempt = 0;
  return true;
}

String MqttService::deviceId() const {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  mac.toLowerCase();
  return mac;
}

String MqttService::stateTopic() const {
  return config.baseTopic + "/telemetry";
}

String MqttService::statusTopic() const {
  return config.baseTopic + "/status";
}

bool MqttService::publishStatus(const char *status, bool retain) {
  return publish(statusTopic(), status, retain);
}

bool MqttService::publish(const String &topic, const String &payload, bool retain) {
  if (!mqttClient.connected()) return false;
  return mqttClient.publish(topic.c_str(), reinterpret_cast<const uint8_t *>(payload.c_str()), payload.length(), retain);
}

bool MqttService::ensureConnected() {
  if (!config.enabled || !wifiRef || !wifiRef->isConnected()) {
    return false;
  }
  if (mqttClient.connected()) {
    return true;
  }
  unsigned long now = millis();
  if (now - lastReconnectAttempt < RECONNECT_INTERVAL_MS) {
    return false;
  }
  lastReconnectAttempt = now;
  mqttClient.setServer(config.host.c_str(), config.port);
  mqttClient.setBufferSize(2048);
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(10);
  String clientId = String("esp32-") + deviceId();
  const char *user = config.username.length() ? config.username.c_str() : nullptr;
  const char *pass = config.password.length() ? config.password.c_str() : nullptr;
  String willTopic = statusTopic();
  bool ok = mqttClient.connect(clientId.c_str(), user, pass, willTopic.c_str(), 1, true, "offline");
  if (ok) {
    publishStatus("online", true);
  }
  return ok;
}

bool MqttService::isConnected() {
  if (!config.enabled || !wifiRef || !wifiRef->isConnected()) {
    return false;
  }
  if (!mqttClient.connected()) {
    ensureConnected();
  }
  return mqttClient.connected();
}

void MqttService::disconnect() {
  if (mqttClient.connected()) {
    publishStatus("offline", true);
    mqttClient.disconnect();
  }
}

void MqttService::loop() {
  if (!config.enabled) {
    disconnect();
    return;
  }
  if (!wifiRef || !wifiRef->isConnected()) {
    disconnect();
    return;
  }

  if (!ensureConnected()) {
    return;
  }

  mqttClient.loop();
}
