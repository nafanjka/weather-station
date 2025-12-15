#pragma once

#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include <Preferences.h>
#include <memory>

#include "WeatherService.h"
#include "OutdoorService.h"

class MqttService;

enum class MatrixOrientation : uint8_t {
  Deg0 = 0,
  Deg90 = 1,
  Deg180 = 2,
  Deg270 = 3,
};

enum class MatrixColorMode : uint8_t {
  Solid = 0,
  Gradient = 1,
  Cycle = 2,
};

struct MatrixConfig {
  bool enabled = false;
  uint8_t pin = 2;           // Default data pin
  uint16_t width = 32;       // Horizontal pixel count
  uint16_t height = 8;       // Vertical pixel count
  bool serpentine = true;    // True for zig-zag wiring
  bool startBottom = false;  // True if row 0 begins at bottom edge
  bool flipX = false;        // Optional horizontal flip
  MatrixOrientation orientation = MatrixOrientation::Deg0;
  uint8_t brightness = 48;   // 0-255
  uint8_t maxBrightness = 96; // Hard ceiling for safety
  bool nightEnabled = false;
  uint16_t nightStartMin = 1380; // 23:00 in minutes
  uint16_t nightEndMin = 420;    // 07:00 in minutes
  uint8_t nightBrightness = 16;  // Dim level at night
  uint16_t fps = 30;         // Target frames per second
  uint16_t sceneDwellMs = 0;
  uint16_t transitionMs = 0;

  uint8_t sceneOrder[4] = {0, 0, 0, 0}; // single clock scene only
  uint8_t sceneCount = 1;               // clock-only

  bool clockUse12h = false;
  bool clockShowSeconds = true;
  bool clockShowMillis = false;

  MatrixColorMode colorMode = MatrixColorMode::Solid;
  uint8_t color1R = 120;
  uint8_t color1G = 210;
  uint8_t color1B = 255;
  uint8_t color2R = 180;
  uint8_t color2G = 120;
  uint8_t color2B = 255;
};

class MatrixDisplayService {
public:
  void begin(WeatherService *weather, OutdoorService *outdoor);
  void loop();
  void attachMqtt(MqttService *mqtt) { mqttRef = mqtt; }

  MatrixConfig currentConfig() const { return config; }
  bool saveConfig(const MatrixConfig &next);
  void loadConfig();

  void showSolid(uint32_t color);
  void shutdown();
  void performAction(const String &action);

private:
  void ensureStrip();
  void renderFrame();
  void renderScene(uint8_t sceneIndex, float phase01);
  void renderClockScene(float phase01);
  void renderWeatherScene(float phase01);
  void renderForecastScene(float phase01);
  void clearStrip();
  uint16_t pixelIndex(uint16_t x, uint16_t y) const;
  uint16_t pixelCount() const { return config.width * config.height; }
  void refreshData();
  bool timeValid() const;

  // Tiny 3x5 font helpers
  uint8_t drawChar(uint16_t x, uint16_t y, char c, uint32_t color);
  uint16_t textWidth(const String &text) const;
  void drawText(uint16_t x, uint16_t y, const String &text, uint32_t color);
  void drawTextCentered(uint16_t y, const String &text, uint32_t color);
  void drawNumber(uint16_t x, uint16_t y, int value, uint32_t color, int width = 0, bool signedFlag = false);
  void drawFloat(uint16_t x, uint16_t y, float value, uint8_t decimals, uint32_t color, int width = 0);
  void handleMqtt();
  void onMqttMessage(char *topic, uint8_t *payload, unsigned int length);
  void publishState();
  String stateTopic() const;
  String commandTopic() const;

  Preferences prefs;
  MatrixConfig config;
  std::unique_ptr<Adafruit_NeoPixel> strip;
  unsigned long lastFrameMs = 0;
  unsigned long sceneStartMs = 0;
  uint8_t activeScene = 0;
  unsigned long lastSampleMs = 0;
  WeatherService *weatherRef = nullptr;
  OutdoorService *outdoorRef = nullptr;
  MqttService *mqttRef = nullptr;
  bool mqttSubscribed = false;
  bool mqttCallbackSet = false;
  WeatherReading indoorSample;
  OutdoorSnapshot outdoorSample;
  unsigned long outdoorSampleMs = 0;
  unsigned long testUntilMs = 0;
};
