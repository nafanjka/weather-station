#include "MqttService.h"

#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <esp32/spiram.h>

#include "WeatherService.h"
#include "setup/ManagedWiFi.h"
#include "OutdoorService.h"

namespace {
constexpr const char *NS = "mqtt";
constexpr unsigned long RECONNECT_INTERVAL_MS = 5000;
constexpr unsigned long DISCOVERY_REFRESH_MS = 300000;
}

void MqttService::begin(ManagedWiFi *wifi, WeatherService *weather, OutdoorService *outdoor) {
  wifiRef = wifi;
  weatherRef = weather;
  outdoorRef = outdoor;
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
  discoverySent = false;
  lastDiscovery = 0;
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

String MqttService::discoveryPrefix() const {
  return String("homeassistant");
}

bool MqttService::addFinite(JsonObject obj, const char *key, float value) {
  if (isnan(value)) return false;
  obj[key] = value;
  return true;
}

bool MqttService::ensureConnected() {
  if (!config.enabled || !wifiRef || !wifiRef->isConnected()) {
    return false;
  }
  if (client.connected()) {
    return true;
  }
  unsigned long now = millis();
  if (now - lastReconnectAttempt < RECONNECT_INTERVAL_MS) {
    return false;
  }
  lastReconnectAttempt = now;
  client.setServer(config.host.c_str(), config.port);
  String willTopic = statusTopic();
  client.setBufferSize(2048);
  client.setKeepAlive(30);
  client.setSocketTimeout(10);
  String clientId = String("esp32-") + deviceId();
  const char *user = config.username.length() ? config.username.c_str() : nullptr;
  const char *pass = config.password.length() ? config.password.c_str() : nullptr;
  bool ok = client.connect(clientId.c_str(), user, pass, willTopic.c_str(), 1, true, "offline");
  if (ok) {
    publishStatus("online", true);
    discoverySent = false;
    lastPublish = 0;
  }
  return ok;
}

bool MqttService::isConnected() {
  if (!config.enabled || !wifiRef || !wifiRef->isConnected()) {
    return false;
  }
  if (!client.connected()) {
    ensureConnected();
  }
  return client.connected();
}

void MqttService::disconnect() {
  if (client.connected()) {
    publishStatus("offline", true);
    client.disconnect();
  }
}

void MqttService::publishStatus(const char *status, bool retain) {
  String topic = statusTopic();
  client.publish(topic.c_str(), status, retain);
}

void MqttService::publishSensorConfig(const String &id, const String &name, const String &templatePath, const char *unit, const char *deviceClass, const char *icon) {
  JsonDocument doc;
  doc["name"] = name;
  doc["state_topic"] = stateTopic();
  doc["unique_id"] = id;
  doc["value_template"] = templatePath;
  if (unit) doc["unit_of_measurement"] = unit;
  if (deviceClass) doc["device_class"] = deviceClass;
  if (icon) doc["icon"] = icon;

  JsonObject device = doc["device"].to<JsonObject>();
  device["identifiers"] = deviceId();
  device["name"] = config.deviceName;
  device["model"] = "ESP32 Weather Station";
  device["manufacturer"] = "Custom";

  String topic = discoveryPrefix() + "/sensor/" + deviceId() + "/" + id + "/config";
  String payload;
  serializeJson(doc, payload);
  client.publish(topic.c_str(), reinterpret_cast<const uint8_t *>(payload.c_str()), payload.length(), true);
}

void MqttService::publishDiscovery() {
  if (!config.haDiscovery || !client.connected()) return;
  unsigned long now = millis();
  if (discoverySent && now - lastDiscovery < DISCOVERY_REFRESH_MS) return;

  publishSensorConfig("temp_c", config.deviceName + " Temperature", "{{ value_json.indoor.temperatureC }}", "°C", "temperature");
  publishSensorConfig("humidity", config.deviceName + " Humidity", "{{ value_json.indoor.humidity }}", "%", "humidity");
  publishSensorConfig("pressure", config.deviceName + " Pressure", "{{ value_json.indoor.pressureHpa }}", "hPa", "pressure");
  publishSensorConfig("dewpoint", config.deviceName + " Dew Point", "{{ value_json.indoor.dewPointC }}", "°C", nullptr, "mdi:water-percent");
  publishSensorConfig("altitude", config.deviceName + " Altitude", "{{ value_json.indoor.altitudeM }}", "m", "distance");
  publishSensorConfig("heap_free", config.deviceName + " Heap Free", "{{ value_json.system.heap.free }}", "bytes", nullptr, "mdi:memory");
  publishSensorConfig("heap_used_pct", config.deviceName + " Heap Used %", "{{ value_json.system.heap.usedPct }}", "%", nullptr, "mdi:percent");
  publishSensorConfig("fs_used_pct", config.deviceName + " FS Used %", "{{ value_json.system.fs.usedPct }}", "%", nullptr, "mdi:sd");
  publishSensorConfig("psram_used_pct", config.deviceName + " PSRAM Used %", "{{ value_json.system.psram.usedPct }}", "%", nullptr, "mdi:memory");
  publishSensorConfig("wifi_rssi", config.deviceName + " Wi-Fi RSSI", "{{ value_json.network.rssi }}", "dBm", "signal_strength", "mdi:wifi-strength-2");
  publishSensorConfig("wifi_ssid", config.deviceName + " Wi-Fi SSID", "{{ value_json.network.ssid }}", nullptr, nullptr, "mdi:wifi");
  publishSensorConfig("location_city", config.deviceName + " City", "{{ value_json.city }}", nullptr, nullptr, "mdi:city");
  publishSensorConfig("location_country", config.deviceName + " Country", "{{ value_json.country }}", nullptr, nullptr, "mdi:flag");

  publishSensorConfig("out_temp_c", config.deviceName + " Outdoor Temp", "{{ value_json.outdoor.temperatureC }}", "°C", "temperature");
  publishSensorConfig("out_humidity", config.deviceName + " Outdoor Humidity", "{{ value_json.outdoor.humidity }}", "%", "humidity");
  publishSensorConfig("out_pressure", config.deviceName + " Outdoor Pressure", "{{ value_json.outdoor.pressureHpa }}", "hPa", "pressure");

  for (uint16_t h : OUTLOOK_HORIZONS) {
    String suffix = String(h) + "h";
    publishSensorConfig("fc_temp_" + suffix, config.deviceName + " Forecast Temp +" + suffix, "{{ value_json.outlook.h" + String(h) + ".tempC }}", "°C", "temperature");
    publishSensorConfig("fc_hum_" + suffix, config.deviceName + " Forecast Hum +" + suffix, "{{ value_json.outlook.h" + String(h) + ".humidity }}", "%", "humidity");
    publishSensorConfig("fc_press_" + suffix, config.deviceName + " Forecast Press +" + suffix, "{{ value_json.outlook.h" + String(h) + ".pressureHpa }}", "hPa", "pressure");
  }

  discoverySent = true;
  lastDiscovery = now;
}

void MqttService::publishTelemetry() {
  if (!client.connected() || !weatherRef) return;
  WeatherReading reading;
  weatherRef->read(reading);

  JsonDocument doc;
  if (config.city.length()) doc["city"] = config.city;
  if (config.country.length()) doc["country"] = config.country;

  JsonObject sensors = doc["sensors"].to<JsonObject>();
  sensors["sht31"].to<JsonObject>()["present"] = reading.shtPresent;
  sensors["sht31"].to<JsonObject>()["ok"] = reading.shtOk;
  sensors["bmp580"].to<JsonObject>()["present"] = reading.bmpPresent;
  sensors["bmp580"].to<JsonObject>()["ok"] = reading.bmpOk;

  JsonObject indoor = doc["indoor"].to<JsonObject>();
  addFinite(indoor, "temperatureC", reading.temperatureC);
  addFinite(indoor, "temperatureF", isnan(reading.temperatureC) ? NAN : reading.temperatureC * 9.0f / 5.0f + 32.0f);
  addFinite(indoor, "humidity", reading.humidity);
  addFinite(indoor, "dewPointC", reading.dewPointC);
  addFinite(indoor, "dewPointF", isnan(reading.dewPointC) ? NAN : reading.dewPointC * 9.0f / 5.0f + 32.0f);
  addFinite(indoor, "pressurePa", reading.pressurePa);
  addFinite(indoor, "pressureHpa", isnan(reading.pressurePa) ? NAN : reading.pressurePa / 100.0f);
  addFinite(indoor, "pressureMmHg", isnan(reading.pressurePa) ? NAN : reading.pressurePa / 133.322f);
  addFinite(indoor, "altitudeM", reading.altitudeM);
  addFinite(indoor, "bmpTemperatureC", reading.bmpTemperatureC);
  addFinite(indoor, "seaLevelPressureHpa", weatherRef->seaLevelPressure());
  indoor["sampleMs"] = reading.collectedAtMs;

  JsonObject system = doc["system"].to<JsonObject>();
  system["uptimeMs"] = millis();

  JsonObject heap = system["heap"].to<JsonObject>();
  uint32_t heapFree = ESP.getFreeHeap();
  uint32_t heapSize = ESP.getHeapSize();
  uint32_t heapUsed = heapSize >= heapFree ? heapSize - heapFree : 0;
  heap["free"] = heapFree;
  heap["size"] = heapSize;
  heap["usedPct"] = heapSize ? (heapUsed * 100.0f / heapSize) : 0.0f;
  heap["minFree"] = ESP.getMinFreeHeap();
  heap["maxAlloc"] = ESP.getMaxAllocHeap();

  JsonObject psram = system["psram"].to<JsonObject>();
  bool psramPresent = psramFound() && ESP.getPsramSize() > 0;
  psram["present"] = psramPresent;
  psram["size"] = psramPresent ? ESP.getPsramSize() : 0;
  psram["free"] = psramPresent ? ESP.getFreePsram() : 0;
  psram["minFree"] = psramPresent ? ESP.getMinFreePsram() : 0;
  psram["maxAlloc"] = psramPresent ? ESP.getMaxAllocPsram() : 0;
  psram["usedPct"] = (psramPresent && ESP.getPsramSize()) ? ((ESP.getPsramSize() - ESP.getFreePsram()) * 100.0f / ESP.getPsramSize()) : 0.0f;

  JsonObject fs = system["fs"].to<JsonObject>();
  size_t fsTotal = LittleFS.totalBytes();
  size_t fsUsed = LittleFS.usedBytes();
  fs["total"] = fsTotal;
  fs["used"] = fsUsed;
  fs["usedPct"] = fsTotal ? (fsUsed * 100.0f / fsTotal) : 0.0f;

  system["cpuMhz"] = ESP.getCpuFreqMHz();
  system["sdk"] = ESP.getSdkVersion();
  system["chipRevision"] = ESP.getChipRevision();

  JsonObject net = doc["network"].to<JsonObject>();
  net["connected"] = wifiRef && wifiRef->isConnected();
  net["ssid"] = wifiRef ? wifiRef->connectedSSID() : "";
  net["apSSID"] = wifiRef ? wifiRef->apSSID() : "";
  net["ip"] = WiFi.localIP().toString();
  net["apIP"] = WiFi.softAPIP().toString();
  net["mac"] = WiFi.macAddress();
  net["bssid"] = WiFi.BSSIDstr();
  addFinite(net, "rssi", WiFi.RSSI());

  if (outdoorRef && outdoorRef->hasConfig()) {
    outdoorRef->ensureFresh(false);
    OutdoorConfig ocfg = outdoorRef->currentConfig();
    OutdoorSnapshot out = outdoorRef->current();

    // Surface location at top-level for easier HA template access and compatibility.
    doc["outdoorCity"] = ocfg.city;
    doc["outdoorCountry"] = ocfg.country;
    doc["outdoorLat"] = ocfg.lat;
    doc["outdoorLon"] = ocfg.lon;
    doc["lat"] = ocfg.lat;
    doc["lon"] = ocfg.lon;
    doc["city"] = ocfg.city;
    doc["country"] = ocfg.country;

    JsonObject outdoor = doc["outdoor"].to<JsonObject>();
    outdoor["city"] = ocfg.city;
    outdoor["country"] = ocfg.country;
    outdoor["lat"] = ocfg.lat;
    outdoor["lon"] = ocfg.lon;
    addFinite(outdoor, "temperatureC", out.temperatureC);
    addFinite(outdoor, "humidity", out.humidity);
    addFinite(outdoor, "pressureHpa", out.pressureHpa);
    addFinite(outdoor, "pressureMmHg", out.pressureMmHg);
    addFinite(outdoor, "altitudeM", out.altitudeM);

    JsonObject outlook = doc["outlook"].to<JsonObject>();
    for (uint16_t h : OUTLOOK_HORIZONS) {
      OutdoorSnapshot snap = outdoorRef->forecastFor(h);
      JsonObject slot = outlook[String("h") + String(h)].to<JsonObject>();
      addFinite(slot, "tempC", snap.temperatureC);
      addFinite(slot, "humidity", snap.humidity);
      addFinite(slot, "pressureHpa", snap.pressureHpa);
      addFinite(slot, "pressureMmHg", snap.pressureMmHg);
    }
  }

  String payload;
  serializeJson(doc, payload);
  client.publish(stateTopic().c_str(), reinterpret_cast<const uint8_t *>(payload.c_str()), payload.length(), false);
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

  client.loop();

  unsigned long now = millis();
  unsigned long interval = config.publishIntervalMs > 0 ? config.publishIntervalMs : 30000;
  if (now - lastPublish >= interval) {
    publishTelemetry();
    lastPublish = now;
  }

  publishDiscovery();
}
