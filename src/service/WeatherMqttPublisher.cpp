#include "WeatherMqttPublisher.h"

#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>
#include "../common/DeviceHelpers.h"
#include <esp32/spiram.h>

#include "setup/MqttService.h"
#include "WeatherService.h"
#include "OutdoorService.h"

namespace {
constexpr unsigned long DISCOVERY_REFRESH_MS = 300000;
}

void WeatherMqttPublisher::begin(MqttService *mqtt, WeatherService *weather, OutdoorService *outdoor) {
  mqttRef = mqtt;
  weatherRef = weather;
  outdoorRef = outdoor;
}

bool WeatherMqttPublisher::addFinite(JsonObject obj, const char *key, float value) {
  if (isnan(value)) return false;
  obj[key] = value;
  return true;
}

String WeatherMqttPublisher::discoveryPrefix() const {
  return String("homeassistant");
}

void WeatherMqttPublisher::publishSensorConfig(const String &id, const String &name, const String &templatePath, const char *unit, const char *deviceClass, const char *icon) {
  if (!mqttRef) return;
  JsonDocument doc;
  doc["name"] = name;
  doc["state_topic"] = mqttRef->stateTopic();
  doc["unique_id"] = id;
  doc["value_template"] = templatePath;
  if (unit) doc["unit_of_measurement"] = unit;
  if (deviceClass) doc["device_class"] = deviceClass;
  if (icon) doc["icon"] = icon;

  MqttConfig cfg = mqttRef->currentConfig();
  JsonObject device = doc["device"].to<JsonObject>();
  device["identifiers"] = mqttRef->deviceId();
  device["name"] = cfg.deviceName;
  device["model"] = "ESP32 Weather Station";
  device["manufacturer"] = "Custom";

  String topic = discoveryPrefix() + "/sensor/" + mqttRef->deviceId() + "/" + id + "/config";
  String payload;
  serializeJson(doc, payload);
  mqttRef->publish(topic, payload, true);
}

void WeatherMqttPublisher::publishDiscovery() {
  if (!mqttRef) return;
  MqttConfig cfg = mqttRef->currentConfig();
  if (!cfg.haDiscovery || !mqttRef->isConnected()) return;
  unsigned long now = millis();
  if (discoverySent && now - lastDiscovery < DISCOVERY_REFRESH_MS) return;

  publishSensorConfig("temp_c", cfg.deviceName + " Temperature", "{{ value_json.indoor.temperatureC }}", "°C", "temperature");
  publishSensorConfig("humidity", cfg.deviceName + " Humidity", "{{ value_json.indoor.humidity }}", "%", "humidity");
  publishSensorConfig("pressure", cfg.deviceName + " Pressure", "{{ value_json.indoor.pressureHpa }}", "hPa", "pressure");
  publishSensorConfig("dewpoint", cfg.deviceName + " Dew Point", "{{ value_json.indoor.dewPointC }}", "°C", nullptr, "mdi:water-percent");
  publishSensorConfig("altitude", cfg.deviceName + " Altitude", "{{ value_json.indoor.altitudeM }}", "m", "distance");
  publishSensorConfig("heap_free", cfg.deviceName + " Heap Free", "{{ value_json.system.heap.free }}", "bytes", nullptr, "mdi:memory");
  publishSensorConfig("heap_used_pct", cfg.deviceName + " Heap Used %", "{{ value_json.system.heap.usedPct }}", "%", nullptr, "mdi:percent");
  publishSensorConfig("fs_used_pct", cfg.deviceName + " FS Used %", "{{ value_json.system.fs.usedPct }}", "%", nullptr, "mdi:sd");
  publishSensorConfig("psram_used_pct", cfg.deviceName + " PSRAM Used %", "{{ value_json.system.psram.usedPct }}", "%", nullptr, "mdi:memory");
  publishSensorConfig("wifi_rssi", cfg.deviceName + " Wi-Fi RSSI", "{{ value_json.network.rssi }}", "dBm", "signal_strength", "mdi:wifi-strength-2");
  publishSensorConfig("wifi_ssid", cfg.deviceName + " Wi-Fi SSID", "{{ value_json.network.ssid }}", nullptr, nullptr, "mdi:wifi");
  publishSensorConfig("location_city", cfg.deviceName + " City", "{{ value_json.city }}", nullptr, nullptr, "mdi:city");
  publishSensorConfig("location_country", cfg.deviceName + " Country", "{{ value_json.country }}", nullptr, nullptr, "mdi:flag");

  publishSensorConfig("out_temp_c", cfg.deviceName + " Outdoor Temp", "{{ value_json.outdoor.temperatureC }}", "°C", "temperature");
  publishSensorConfig("out_humidity", cfg.deviceName + " Outdoor Humidity", "{{ value_json.outdoor.humidity }}", "%", "humidity");
  publishSensorConfig("out_pressure", cfg.deviceName + " Outdoor Pressure", "{{ value_json.outdoor.pressureHpa }}", "hPa", "pressure");
  publishSensorConfig("out_wind_ms", cfg.deviceName + " Outdoor Wind", "{{ value_json.outdoor.windSpeed }}", "m/s", "wind_speed", "mdi:weather-windy");

  for (uint16_t h : OUTLOOK_HORIZONS) {
    String suffix = String(h) + "h";
    publishSensorConfig("fc_temp_" + suffix, cfg.deviceName + " Forecast Temp +" + suffix, "{{ value_json.outlook.h" + String(h) + ".tempC }}", "°C", "temperature");
    publishSensorConfig("fc_hum_" + suffix, cfg.deviceName + " Forecast Hum +" + suffix, "{{ value_json.outlook.h" + String(h) + ".humidity }}", "%", "humidity");
    publishSensorConfig("fc_press_" + suffix, cfg.deviceName + " Forecast Press +" + suffix, "{{ value_json.outlook.h" + String(h) + ".pressureHpa }}", "hPa", "pressure");
  }

  discoverySent = true;
  lastDiscovery = now;
}

void WeatherMqttPublisher::publishTelemetry() {
  if (!mqttRef || !weatherRef || !mqttRef->isConnected()) return;
  MqttConfig cfg = mqttRef->currentConfig();
  WeatherReading reading;
  weatherRef->read(reading);

  JsonDocument doc;
  if (cfg.city.length()) doc["city"] = cfg.city;
  if (cfg.country.length()) doc["country"] = cfg.country;

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
  net["connected"] = weatherRef && mqttRef && mqttRef->isConnected();
  net["ssid"] = WiFi.SSID();
  net["apSSID"] = WiFi.softAPSSID();
  net["ip"] = WiFi.localIP().toString();
  net["apIP"] = WiFi.softAPIP().toString();
  net["mac"] = DeviceHelpers::getMacAddress();
  net["bssid"] = WiFi.BSSIDstr();
  addFinite(net, "rssi", WiFi.RSSI());

  if (outdoorRef && outdoorRef->hasConfig()) {
    outdoorRef->ensureFresh(false);
    OutdoorConfig ocfg = outdoorRef->currentConfig();
    OutdoorSnapshot out = outdoorRef->current();

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
    addFinite(outdoor, "windSpeed", out.windSpeed);

    JsonObject outlook = doc["outlook"].to<JsonObject>();
    for (uint16_t h : OUTLOOK_HORIZONS) {
      OutdoorSnapshot snap = outdoorRef->forecastFor(h);
      JsonObject slot = outlook[String("h") + String(h)].to<JsonObject>();
      addFinite(slot, "tempC", snap.temperatureC);
      addFinite(slot, "humidity", snap.humidity);
      addFinite(slot, "pressureHpa", snap.pressureHpa);
      addFinite(slot, "pressureMmHg", snap.pressureMmHg);
      addFinite(slot, "windSpeed", snap.windSpeed);
    }
  }

  String payload;
  serializeJson(doc, payload);
  mqttRef->publish(mqttRef->stateTopic(), payload, false);
}

void WeatherMqttPublisher::loop() {
  if (!mqttRef || !weatherRef) return;
  MqttConfig cfg = mqttRef->currentConfig();
  if (!cfg.enabled) return;
  if (!mqttRef->isConnected()) return;

  unsigned long now = millis();
  unsigned long interval = cfg.publishIntervalMs > 0 ? cfg.publishIntervalMs : 30000;
  if (now - lastPublish >= interval) {
    publishTelemetry();
    lastPublish = now;
  }

  publishDiscovery();
}
