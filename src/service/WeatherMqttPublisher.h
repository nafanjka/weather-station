#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class WeatherService;
class OutdoorService;
class MqttService;

class WeatherMqttPublisher {
public:
  void begin(MqttService *mqtt, WeatherService *weather, OutdoorService *outdoor);
  void loop();

private:
  void publishDiscovery();
  void publishTelemetry();
  void publishSensorConfig(const String &id, const String &name, const String &templatePath, const char *unit, const char *deviceClass, const char *icon = nullptr);
  bool addFinite(JsonObject obj, const char *key, float value);
  String discoveryPrefix() const;

  MqttService *mqttRef = nullptr;
  WeatherService *weatherRef = nullptr;
  OutdoorService *outdoorRef = nullptr;

  unsigned long lastPublish = 0;
  unsigned long lastDiscovery = 0;
  bool discoverySent = false;
};
