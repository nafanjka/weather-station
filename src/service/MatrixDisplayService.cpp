#include "MatrixDisplayService.h"

#include <math.h>
#include <time.h>
#include <ArduinoJson.h>

#include "setup/MqttService.h"

namespace {
constexpr const char *NS = "matrix";
constexpr unsigned long STALE_MS = 15UL * 60UL * 1000UL; // 15 minutes
constexpr uint16_t DEFAULT_NIGHT_START = 23 * 60; // 11pm
constexpr uint16_t DEFAULT_NIGHT_END = 7 * 60;    // 7am

uint8_t clamp8(uint32_t v) { return v > 255 ? 255 : static_cast<uint8_t>(v); }
uint16_t clamp16(uint32_t v, uint16_t maxV) { return v > maxV ? maxV : static_cast<uint16_t>(v); }
MatrixDisplayService *ACTIVE_MATRIX = nullptr;

struct Glyph {
  char ch;
  uint8_t rows[5]; // 3 bits per row stored in LSBs
};

// Minimal 3x5 font for digits, a subset of uppercase, and symbols used.
constexpr Glyph FONT[] = {
  {'0', {0b111, 0b101, 0b101, 0b101, 0b111}},
  {'1', {0b010, 0b110, 0b010, 0b010, 0b111}},
  {'2', {0b111, 0b001, 0b111, 0b100, 0b111}},
  {'3', {0b111, 0b001, 0b111, 0b001, 0b111}},
  {'4', {0b101, 0b101, 0b111, 0b001, 0b001}},
  {'5', {0b111, 0b100, 0b111, 0b001, 0b111}},
  {'6', {0b111, 0b100, 0b111, 0b101, 0b111}},
  {'7', {0b111, 0b001, 0b010, 0b010, 0b010}},
  {'8', {0b111, 0b101, 0b111, 0b101, 0b111}},
  {'9', {0b111, 0b101, 0b111, 0b001, 0b111}},
  {'-', {0b000, 0b000, 0b111, 0b000, 0b000}},
  {'.', {0b000, 0b000, 0b000, 0b000, 0b010}},
  {':', {0b000, 0b010, 0b000, 0b010, 0b000}},
  {' ', {0b000, 0b000, 0b000, 0b000, 0b000}},
  {'A', {0b111, 0b101, 0b111, 0b101, 0b101}},
  {'B', {0b110, 0b101, 0b110, 0b101, 0b110}},
  {'C', {0b111, 0b100, 0b100, 0b100, 0b111}},
  {'D', {0b110, 0b101, 0b101, 0b101, 0b110}},
  {'E', {0b111, 0b100, 0b110, 0b100, 0b111}},
  {'F', {0b111, 0b100, 0b110, 0b100, 0b100}},
  {'H', {0b101, 0b101, 0b111, 0b101, 0b101}},
  {'I', {0b111, 0b010, 0b010, 0b010, 0b111}},
  {'L', {0b100, 0b100, 0b100, 0b100, 0b111}},
  {'M', {0b101, 0b111, 0b101, 0b101, 0b101}},
  {'N', {0b101, 0b111, 0b111, 0b111, 0b101}},
  {'O', {0b111, 0b101, 0b101, 0b101, 0b111}},
  {'R', {0b110, 0b101, 0b110, 0b101, 0b101}},
  {'S', {0b111, 0b100, 0b111, 0b001, 0b111}},
  {'T', {0b111, 0b010, 0b010, 0b010, 0b010}},
  {'U', {0b101, 0b101, 0b101, 0b101, 0b111}},
  {'W', {0b101, 0b101, 0b101, 0b111, 0b101}},
  {'Y', {0b101, 0b101, 0b010, 0b010, 0b010}},
  {'V', {0b101, 0b101, 0b101, 0b101, 0b010}},
};

const Glyph *lookupGlyph(char c) {
  for (const auto &g : FONT) {
    if (g.ch == c) return &g;
  }
  return nullptr;
}
}

void MatrixDisplayService::begin(WeatherService *weather, OutdoorService *outdoor) {
  ACTIVE_MATRIX = this;
  weatherRef = weather;
  outdoorRef = outdoor;
  loadConfig();
  ensureStrip();
  sceneStartMs = millis();
  refreshData();
}

void MatrixDisplayService::shutdown() {
  config.enabled = false;
  clearStrip();
}

void MatrixDisplayService::ensureStrip() {
  const uint16_t count = pixelCount();
  if (!count) return;
  if (!strip || strip->numPixels() != count || strip->getPin() != config.pin) {
    strip.reset(new Adafruit_NeoPixel(count, config.pin, NEO_GRB + NEO_KHZ800));
    strip->begin();
  }
  strip->setBrightness(config.brightness);
  strip->show();
}

void MatrixDisplayService::clearStrip() {
  if (!strip) return;
  strip->clear();
  strip->show();
}

bool MatrixDisplayService::saveConfig(const MatrixConfig &next) {
  MatrixConfig sanitized = next;
  sanitized.sceneCount = 1;
  sanitized.sceneOrder[0] = 0;
  sanitized.sceneOrder[1] = 0;
  sanitized.sceneOrder[2] = 0;
  sanitized.sceneOrder[3] = 0;
  sanitized.sceneDwellMs = 0;
  sanitized.transitionMs = 0;
  sanitized.nightStartMin = DEFAULT_NIGHT_START;
  sanitized.nightEndMin = DEFAULT_NIGHT_END;

  if (sanitized.colorMode > MatrixColorMode::Cycle) {
    sanitized.colorMode = MatrixColorMode::Solid;
  }

  prefs.begin(NS, false);
  prefs.putBool("enabled", sanitized.enabled);
  prefs.putUChar("pin", sanitized.pin);
  prefs.putUShort("w", sanitized.width);
  prefs.putUShort("h", sanitized.height);
  prefs.putBool("serp", sanitized.serpentine);
  prefs.putBool("bottom", sanitized.startBottom);
  prefs.putBool("flipx", sanitized.flipX);
  prefs.putUChar("orient", static_cast<uint8_t>(sanitized.orientation));
  prefs.putUChar("bright", sanitized.brightness);
  prefs.putUChar("maxb", sanitized.maxBrightness);
  prefs.putBool("night", sanitized.nightEnabled);
  prefs.putUShort("nstart", sanitized.nightStartMin);
  prefs.putUShort("nend", sanitized.nightEndMin);
  prefs.putUChar("nbright", sanitized.nightBrightness);
  prefs.putUShort("fps", sanitized.fps);
  prefs.putUShort("dwell", sanitized.sceneDwellMs);
  prefs.putUShort("transition", sanitized.transitionMs);
  prefs.putUChar("scenes", sanitized.sceneCount);
  prefs.putUChar("s0", sanitized.sceneOrder[0]);
  prefs.putUChar("s1", sanitized.sceneOrder[1]);
  prefs.putUChar("s2", sanitized.sceneOrder[2]);
  prefs.putUChar("s3", sanitized.sceneOrder[3]);
  prefs.putBool("use12h", sanitized.clockUse12h);
  prefs.putBool("showSec", sanitized.clockShowSeconds);
  prefs.putBool("showMs", sanitized.clockShowMillis);
  prefs.putUChar("cMode", static_cast<uint8_t>(sanitized.colorMode));
  prefs.putUChar("c1r", sanitized.color1R);
  prefs.putUChar("c1g", sanitized.color1G);
  prefs.putUChar("c1b", sanitized.color1B);
  prefs.putUChar("c2r", sanitized.color2R);
  prefs.putUChar("c2g", sanitized.color2G);
  prefs.putUChar("c2b", sanitized.color2B);
  prefs.end();
  config = sanitized;
  ensureStrip();
  publishState();
  return true;
}

void MatrixDisplayService::loadConfig() {
  prefs.begin(NS, true);
  config.enabled = prefs.getBool("enabled", config.enabled);
  config.pin = prefs.getUChar("pin", config.pin);
  config.width = prefs.getUShort("w", config.width);
  config.height = prefs.getUShort("h", config.height);
  config.serpentine = prefs.getBool("serp", config.serpentine);
  config.startBottom = prefs.getBool("bottom", config.startBottom);
  config.flipX = prefs.getBool("flipx", config.flipX);
  config.orientation = static_cast<MatrixOrientation>(prefs.getUChar("orient", static_cast<uint8_t>(config.orientation)));
  config.brightness = prefs.getUChar("bright", config.brightness);
  config.maxBrightness = prefs.getUChar("maxb", config.maxBrightness);
  config.nightEnabled = prefs.getBool("night", config.nightEnabled);
  config.nightStartMin = prefs.getUShort("nstart", config.nightStartMin);
  config.nightEndMin = prefs.getUShort("nend", config.nightEndMin);
  config.nightBrightness = prefs.getUChar("nbright", config.nightBrightness);
  config.fps = prefs.getUShort("fps", config.fps);
  config.sceneDwellMs = prefs.getUShort("dwell", config.sceneDwellMs);
  config.transitionMs = prefs.getUShort("transition", config.transitionMs);
  config.sceneCount = prefs.getUChar("scenes", config.sceneCount);
  config.sceneOrder[0] = prefs.getUChar("s0", config.sceneOrder[0]);
  config.sceneOrder[1] = prefs.getUChar("s1", config.sceneOrder[1]);
  config.sceneOrder[2] = prefs.getUChar("s2", config.sceneOrder[2]);
  config.sceneOrder[3] = prefs.getUChar("s3", config.sceneOrder[3]);
  config.clockUse12h = prefs.getBool("use12h", config.clockUse12h);
  config.clockShowSeconds = prefs.getBool("showSec", config.clockShowSeconds);
  config.clockShowMillis = prefs.getBool("showMs", config.clockShowMillis);
  config.colorMode = static_cast<MatrixColorMode>(prefs.getUChar("cMode", static_cast<uint8_t>(config.colorMode)) % 3);
  config.color1R = prefs.getUChar("c1r", config.color1R);
  config.color1G = prefs.getUChar("c1g", config.color1G);
  config.color1B = prefs.getUChar("c1b", config.color1B);
  config.color2R = prefs.getUChar("c2r", config.color2R);
  config.color2G = prefs.getUChar("c2g", config.color2G);
  config.color2B = prefs.getUChar("c2b", config.color2B);
  prefs.end();

  config.sceneCount = 1;
  config.sceneOrder[0] = 0;
  config.sceneOrder[1] = 0;
  config.sceneOrder[2] = 0;
  config.sceneOrder[3] = 0;
  config.sceneDwellMs = 0;
  config.transitionMs = 0;
  config.nightStartMin = DEFAULT_NIGHT_START;
  config.nightEndMin = DEFAULT_NIGHT_END;
  // keep user clock prefs as loaded; defaults already applied
}

uint16_t MatrixDisplayService::pixelIndex(uint16_t x, uint16_t y) const {
  if (x >= config.width || y >= config.height) return UINT16_MAX;

  uint16_t rx = x;
  uint16_t ry = y;

  switch (config.orientation) {
    case MatrixOrientation::Deg0:
      break;
    case MatrixOrientation::Deg90:
      rx = y;
      ry = (config.width > 0) ? (config.width - 1 - x) : 0;
      break;
    case MatrixOrientation::Deg180:
      rx = (config.width > 0) ? (config.width - 1 - x) : 0;
      ry = (config.height > 0) ? (config.height - 1 - y) : 0;
      break;
    case MatrixOrientation::Deg270:
      rx = (config.height > 0) ? (config.height - 1 - y) : 0;
      ry = x;
      break;
  }

  if (config.flipX && config.width > 0) {
    rx = config.width - 1 - rx;
  }
  if (config.startBottom && config.height > 0) {
    ry = config.height - 1 - ry;
  }

  if (ry >= config.height) return UINT16_MAX;

  if (config.serpentine && (ry % 2 == 1)) {
    rx = config.width - 1 - rx;
  }

  return (ry * config.width) + rx;
}

void MatrixDisplayService::refreshData() {
  unsigned long now = millis();
  if (now - lastSampleMs < 3000) return;
  lastSampleMs = now;

  if (weatherRef) {
    WeatherReading reading;
    // Use a non-blocking read if available; fallback to latest snapshot when read fails.
    if (weatherRef->read(reading)) {
      indoorSample = reading;
    } else {
      indoorSample = weatherRef->latest();
    }
  }

  if (outdoorRef) {
    outdoorSample = outdoorRef->current();
    outdoorSampleMs = outdoorRef->lastFetchMs();
  }
}

bool MatrixDisplayService::timeValid() const {
  time_t now = time(nullptr);
  // Treat times beyond year 2005 as valid.
  return now > 1104537600;
}

bool outdoorStale(unsigned long sampleMs) {
  if (sampleMs == 0) return true;
  unsigned long now = millis();
  return now - sampleMs > STALE_MS;
}

static bool isMinutesInRange(uint16_t startMin, uint16_t endMin, uint16_t nowMin) {
  if (startMin == endMin) return false; // disabled window
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // wraps midnight
  return nowMin >= startMin || nowMin < endMin;
}

uint8_t effectiveBrightness(const MatrixConfig &cfg) {
  uint8_t base = cfg.brightness;
  if (cfg.maxBrightness && base > cfg.maxBrightness) base = cfg.maxBrightness;
  if (!cfg.nightEnabled) return base;
  if (!time(nullptr)) return base;
  time_t now = time(nullptr);
  struct tm tmNow = {};
  localtime_r(&now, &tmNow);
  uint16_t minuteOfDay = static_cast<uint16_t>(tmNow.tm_hour * 60 + tmNow.tm_min);
  if (isMinutesInRange(cfg.nightStartMin % 1440, cfg.nightEndMin % 1440, minuteOfDay)) {
    return cfg.nightBrightness ? cfg.nightBrightness : base;
  }
  return base;
}

uint8_t MatrixDisplayService::drawChar(uint16_t x, uint16_t y, char c, uint32_t color) {
  const Glyph *g = lookupGlyph(c);
  if (!g) return 4; // unknown glyph fallback to spacing
  for (uint8_t row = 0; row < 5; ++row) {
    uint8_t bits = g->rows[row];
    for (uint8_t col = 0; col < 3; ++col) {
      if (bits & (1 << (2 - col))) {
        uint16_t idx = pixelIndex(x + col, y + row);
        if (idx != UINT16_MAX) {
          strip->setPixelColor(idx, color);
        }
      }
    }
  }
  return 4; // width including 1px spacing
}

uint16_t MatrixDisplayService::textWidth(const String &text) const {
  uint16_t w = 0;
  for (size_t i = 0; i < text.length(); ++i) {
    const Glyph *g = lookupGlyph(text[i]);
    w += g ? 4 : 4;
  }
  return w;
}

void MatrixDisplayService::drawText(uint16_t x, uint16_t y, const String &text, uint32_t color) {
  uint16_t cursor = x;
  for (size_t i = 0; i < text.length(); ++i) {
    cursor += drawChar(cursor, y, text[i], color);
  }
}

void MatrixDisplayService::drawTextCentered(uint16_t y, const String &text, uint32_t color) {
  const uint16_t w = textWidth(text);
  if (w >= config.width) {
    drawText(0, y, text, color);
    return;
  }
  uint16_t x = (config.width - w) / 2;
  drawText(x, y, text, color);
}

void MatrixDisplayService::drawNumber(uint16_t x, uint16_t y, int value, uint32_t color, int width, bool signedFlag) {
  char buf[12];
  if (signedFlag) {
    snprintf(buf, sizeof(buf), "%*d", width, value);
  } else {
    snprintf(buf, sizeof(buf), "%*u", width, value < 0 ? 0 : static_cast<unsigned>(value));
  }
  String s(buf);
  s.replace(" ", "");
  drawText(x, y, s, color);
}

void MatrixDisplayService::drawFloat(uint16_t x, uint16_t y, float value, uint8_t decimals, uint32_t color, int width) {
  if (isnan(value)) {
    drawText(x, y, "--", color);
    return;
  }
  char fmt[8];
  snprintf(fmt, sizeof(fmt), "%%.%df", decimals);
  char buf[16];
  snprintf(buf, sizeof(buf), fmt, value);
  String s(buf);
  if (width > 0 && s.length() < static_cast<size_t>(width)) {
    const unsigned int pad = static_cast<unsigned int>(width - s.length());
    String padding;
    padding.reserve(pad + 1);
    for (unsigned int i = 0; i < pad; ++i) padding += ' ';
    s = padding + s;
  }
  s.replace(" ", "");
  drawText(x, y, s, color);
}

void MatrixDisplayService::performAction(const String &action) {
  if (action.equalsIgnoreCase("test")) {
    testUntilMs = millis() + 3000;
    return;
  }
  if (action.equalsIgnoreCase("clear")) {
    testUntilMs = 0;
    clearStrip();
    return;
  }
}

String MatrixDisplayService::stateTopic() const {
  if (!mqttRef) return String();
  return mqttRef->baseTopic() + "/matrix/state";
}

String MatrixDisplayService::commandTopic() const {
  if (!mqttRef) return String();
  return mqttRef->baseTopic() + "/matrix/cmd";
}

void MatrixDisplayService::publishState() {
  if (!mqttRef || !mqttRef->isConnected()) return;
  JsonDocument doc;
  doc["enabled"] = config.enabled;
  doc["brightness"] = config.brightness;
  doc["effectiveBrightness"] = effectiveBrightness(config);
  doc["maxBrightness"] = config.maxBrightness;
  doc["night"] = config.nightEnabled;
  doc["scene"] = 0;
  doc["width"] = config.width;
  doc["height"] = config.height;
  doc["fps"] = config.fps;
  doc["dwell"] = 0;
  doc["transition"] = 0;
  doc["clockUse12h"] = config.clockUse12h;
  doc["clockShowSeconds"] = config.clockShowSeconds;
  doc["clockShowMillis"] = config.clockShowMillis;
  doc["colorMode"] = static_cast<uint8_t>(config.colorMode);
  JsonArray c1 = doc["color1"].to<JsonArray>();
  c1.add(config.color1R);
  c1.add(config.color1G);
  c1.add(config.color1B);
  JsonArray c2 = doc["color2"].to<JsonArray>();
  c2.add(config.color2R);
  c2.add(config.color2G);
  c2.add(config.color2B);
  String payload;
  serializeJson(doc, payload);
  mqttRef->publish(stateTopic(), payload, true);
}

void MatrixDisplayService::onMqttMessage(char *topic, uint8_t *payload, unsigned int length) {
  if (!mqttRef) return;
  String incomingTopic(topic);
  if (incomingTopic != commandTopic()) return;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;
  JsonObject obj = doc.as<JsonObject>();

  bool changed = false;
  MatrixConfig next = config;

  if (obj["enabled"].is<bool>()) {
    next.enabled = obj["enabled"].as<bool>();
    changed = true;
  }
  if (obj["maxBrightness"].is<uint32_t>()) {
    uint32_t mb = obj["maxBrightness"].as<uint32_t>();
    next.maxBrightness = clamp8(mb);
    changed = true;
  }
  if (obj["night"].is<bool>()) {
    next.nightEnabled = obj["night"].as<bool>();
    changed = true;
  }
  if (obj["nightBrightness"].is<uint32_t>()) {
    next.nightBrightness = clamp8(obj["nightBrightness"].as<uint32_t>());
    changed = true;
  }
  if (obj["nightStart"].is<uint32_t>()) {
    next.nightStartMin = clamp16(obj["nightStart"].as<uint32_t>(), 1440);
    changed = true;
  }
  if (obj["nightEnd"].is<uint32_t>()) {
    next.nightEndMin = clamp16(obj["nightEnd"].as<uint32_t>(), 1440);
    changed = true;
  }
  if (obj["brightness"].is<uint32_t>()) {
    uint32_t b = obj["brightness"].as<uint32_t>();
    next.brightness = clamp8(b);
    changed = true;
  }
  if (obj["scene"].is<int>()) {
    int s = obj["scene"].as<int>();
    activeScene = s >= 0 ? (s % 4) : 0;
    sceneStartMs = millis();
  }
  if (obj["use12h"].is<bool>()) {
    next.clockUse12h = obj["use12h"].as<bool>();
    changed = true;
  }
  if (obj["showSeconds"].is<bool>()) {
    next.clockShowSeconds = obj["showSeconds"].as<bool>();
    changed = true;
  }
  if (obj["showMillis"].is<bool>()) {
    next.clockShowMillis = obj["showMillis"].as<bool>();
    changed = true;
  }
  if (obj["action"].is<const char *>()) {
    performAction(obj["action"].as<const char *>());
  }

  if (obj["colorMode"].is<int>()) {
    int m = obj["colorMode"].as<int>();
    if (m >= 0 && m <= 2) {
      next.colorMode = static_cast<MatrixColorMode>(m);
      changed = true;
    }
  }
  if (obj["color1"].is<JsonArray>()) {
    JsonArray c1 = obj["color1"].as<JsonArray>();
    if (c1.size() >= 3) {
      next.color1R = clamp8(c1[0].as<uint32_t>());
      next.color1G = clamp8(c1[1].as<uint32_t>());
      next.color1B = clamp8(c1[2].as<uint32_t>());
      changed = true;
    }
  }
  if (obj["color2"].is<JsonArray>()) {
    JsonArray c2 = obj["color2"].as<JsonArray>();
    if (c2.size() >= 3) {
      next.color2R = clamp8(c2[0].as<uint32_t>());
      next.color2G = clamp8(c2[1].as<uint32_t>());
      next.color2B = clamp8(c2[2].as<uint32_t>());
      changed = true;
    }
  }

  if (changed) {
    saveConfig(next);
  }
  publishState();
}

void MatrixDisplayService::handleMqtt() {
  if (!mqttRef) return;
  if (!mqttRef->isConnected()) {
    mqttSubscribed = false;
    return;
  }

  PubSubClient &client = mqttRef->client();
  if (!mqttCallbackSet) {
    client.setCallback([](char *topic, uint8_t *payload, unsigned int length) {
      if (ACTIVE_MATRIX) ACTIVE_MATRIX->onMqttMessage(topic, payload, length);
    });
    mqttCallbackSet = true;
  }
  if (!mqttSubscribed) {
    client.subscribe(commandTopic().c_str());
    mqttSubscribed = true;
    publishState();
  }
}

void MatrixDisplayService::renderClockScene(float phase01) {
  (void)phase01;
  if (!strip) return;
  strip->clear();

  String timeStr = "--:--";
  String msMarker = "";
  String ampm = "";
  if (timeValid()) {
    time_t now = time(nullptr);
    struct tm tmNow = {};
    localtime_r(&now, &tmNow);

    int hour = tmNow.tm_hour;
    if (config.clockUse12h) {
      hour = hour % 12;
      if (hour == 0) hour = 12;
      ampm = ""; // no AM/PM label on matrix
    }

    if (config.clockShowSeconds) {
      char buf[9];
      snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hour, tmNow.tm_min, tmNow.tm_sec);
      timeStr = String(buf);
    } else {
      char buf[6];
      snprintf(buf, sizeof(buf), "%02d:%02d", hour, tmNow.tm_min);
      timeStr = String(buf);
    }

    // Colon is always present for smooth pulse animation
  }

  auto colorAt = [&](uint16_t x) {
    switch (config.colorMode) {
      case MatrixColorMode::Solid:
        return strip->Color(config.color1R, config.color1G, config.color1B);
      case MatrixColorMode::Gradient: {
        float t = (config.width > 1) ? static_cast<float>(x) / static_cast<float>(config.width - 1) : 0.0f;
        uint8_t r = clamp8(static_cast<uint32_t>((1.0f - t) * config.color1R + t * config.color2R));
        uint8_t g = clamp8(static_cast<uint32_t>((1.0f - t) * config.color1G + t * config.color2G));
        uint8_t b = clamp8(static_cast<uint32_t>((1.0f - t) * config.color1B + t * config.color2B));
        return strip->Color(r, g, b);
      }
      case MatrixColorMode::Cycle:
      default: {
        float t = fmodf((millis() % 8000) / 8000.0f + (config.width ? static_cast<float>(x) / config.width : 0), 1.0f);
        uint8_t r = clamp8(sin((t) * 6.28318f) * 127 + 128);
        uint8_t g = clamp8(sin((t + 0.33f) * 6.28318f) * 127 + 128);
        uint8_t b = clamp8(sin((t + 0.66f) * 6.28318f) * 127 + 128);
        return strip->Color(r, g, b);
      }
    }
  };

  uint16_t y = config.height > 6 ? 1 : 0;

  auto drawTextColorized = [&](uint16_t x, uint16_t yPos, const String &txt) {
    uint16_t cursor = x;
    // Smooth, visually strong sinusoidal pulse in sync with each second (1 Hz)
    unsigned long ms = millis();
    float phase = static_cast<float>(ms % 1000) / 1000.0f; // 0..1
    // Use a full sine wave for smoothness: 0.5 + 0.5*sin(2π*phase - π/2)
    float pulseValue = 0.5f + 0.5f * sinf(2.0f * 3.1415926f * phase - 1.5708f); // 0..1, smooth
    float minPulse = 0.35f, maxPulse = 1.0f; // Make the pulse more visible
    float pulse = minPulse + (maxPulse - minPulse) * pulseValue;
    for (size_t i = 0; i < txt.length(); ++i) {
      char ch = txt[i];
      uint32_t col = colorAt(cursor);
      // Pulse effect for ':' delimiters only
      if (ch == ':') {
        uint8_t r = (col >> 16) & 0xFF;
        uint8_t g = (col >> 8) & 0xFF;
        uint8_t b = col & 0xFF;
        r = clamp8(static_cast<uint32_t>(r * pulse));
        g = clamp8(static_cast<uint32_t>(g * pulse));
        b = clamp8(static_cast<uint32_t>(b * pulse));
        col = strip->Color(r, g, b);
      }
      cursor += drawChar(cursor, yPos, ch, col);
    }
  };

  uint16_t textW = textWidth(timeStr);
  uint16_t startX = (textW >= config.width) ? 0 : (config.width - textW) / 2;
  drawTextColorized(startX, y, timeStr);

  // Milliseconds are intentionally not shown on the matrix
}

void MatrixDisplayService::renderWeatherScene(float phase01) {
  (void)phase01;
  if (!strip) return;
  strip->clear();

  float inTemp = indoorSample.temperatureC;
  float inHum = indoorSample.humidity;
  float outTemp = outdoorSample.temperatureC;
  float outWind = outdoorSample.windSpeed;
  bool outStale = outdoorStale(outdoorSampleMs);

  const uint32_t tempColor = strip->Color(255, 170, 90);
  const uint32_t humColor = strip->Color(120, 200, 255);
  const uint32_t windColor = strip->Color(160, 255, 200);
  const uint32_t staleColor = strip->Color(120, 120, 120);

  const uint8_t lineHeight = 5;
  uint8_t line1Y = 0;
  uint8_t line2Y = (config.height > (lineHeight + 1)) ? (lineHeight + 1) : (config.height > lineHeight ? 1 : 0);

  // Line 1: IN
  drawText(0, line1Y, "IN", tempColor);
  drawFloat(2 * 4, line1Y, inTemp, 0, tempColor);
  drawText(5 * 4, line1Y, "C", tempColor);
  drawText(7 * 4, line1Y, "H", humColor);
  drawFloat(8 * 4, line1Y, inHum, 0, humColor);

  // Line 2: OUT
  const uint32_t outLabelColor = outStale ? staleColor : tempColor;
  const uint32_t outWindColor = outStale ? staleColor : windColor;

  drawText(0, line2Y, "OUT", outLabelColor);
  if (!outStale && !isnan(outTemp)) {
    drawFloat(3 * 4, line2Y, outTemp, 0, outLabelColor);
    drawText(6 * 4, line2Y, "C", outLabelColor);
  } else {
    drawText(3 * 4, line2Y, "--", outLabelColor);
  }
  drawText(8 * 4, line2Y, "W", outWindColor);
  if (!outStale && !isnan(outWind)) {
    drawFloat(9 * 4, line2Y, outWind, 1, outWindColor);
  } else {
    drawText(9 * 4, line2Y, "--", outWindColor);
  }
}

void MatrixDisplayService::renderForecastScene(float phase01) {
  (void)phase01;
  if (!strip) return;
  strip->clear();

  bool stale = outdoorStale(outdoorSampleMs);

  if (!outdoorRef || stale) {
    drawTextCentered(1, "NO OUT", strip->Color(255, 120, 120));
    return;
  }

  uint16_t chosen = 0;
  OutdoorSnapshot snap{};
  for (uint16_t h : OUTLOOK_HORIZONS) {
    OutdoorSnapshot candidate = outdoorRef->forecastFor(h);
    if (!isnan(candidate.temperatureC)) {
      chosen = h;
      snap = candidate;
      break;
    }
  }

  if (chosen == 0) {
    drawTextCentered(1, "NO FC", strip->Color(255, 120, 120));
    return;
  }

  const uint32_t tempColor = strip->Color(255, 190, 110);
  const uint32_t humColor = strip->Color(140, 210, 255);

  char label[6];
  snprintf(label, sizeof(label), "F%uh", chosen);
  drawText(0, 0, label, tempColor);
  drawFloat(4 * 1 + 4, 0, snap.temperatureC, 0, tempColor);
  drawText(4 * 4, 0, "C", tempColor);

  uint8_t y2 = (config.height > 6) ? 6 : 5;
  drawText(0, y2, "H", humColor);
  drawFloat(4, y2, snap.humidity, 0, humColor);

  // gentle bar to show phase
  uint16_t idxBar = pixelIndex(static_cast<uint16_t>(phase01 * config.width) % config.width, config.height > 0 ? config.height - 1 : 0);
  if (idxBar != UINT16_MAX) strip->setPixelColor(idxBar, strip->Color(60, 120, 200));
}

void MatrixDisplayService::renderScene(uint8_t sceneIndex, float phase01) {
  if (!strip) return;
  const uint16_t w = config.width;
  const uint16_t h = config.height;
  if (!w || !h) return;

  switch (sceneIndex % 4) {
    case 0:
      renderClockScene(phase01);
      break;
    case 1:
      renderWeatherScene(phase01);
      break;
    case 2:
      renderForecastScene(phase01);
      break;
    default: { // fallback gradient
      strip->clear();
      for (uint16_t y = 0; y < h; ++y) {
        for (uint16_t x = 0; x < w; ++x) {
          float t = (static_cast<float>(x) / (w ? w : 1)) + phase01;
          t = fmodf(t, 1.0f);
          uint8_t r = clamp8(t * 180);
          uint8_t g = clamp8((1.0f - t) * 140);
          uint8_t b = 40;
          uint16_t idx = pixelIndex(x, y);
          if (idx != UINT16_MAX) strip->setPixelColor(idx, strip->Color(r, g, b));
        }
      }
      break;
    }
  }

  strip->setBrightness(effectiveBrightness(config));
  strip->show();
}

void MatrixDisplayService::renderFrame() {
  if (!config.enabled || !strip) return;
  const uint16_t targetFps = config.fps ? config.fps : 30;
  const uint16_t frameInterval = 1000 / targetFps;
  unsigned long now = millis();
  if (now - lastFrameMs < frameInterval) return;
  lastFrameMs = now;

  refreshData();

  if (testUntilMs && now >= testUntilMs) {
    testUntilMs = 0;
  }

  if (testUntilMs && now < testUntilMs) {
    // simple rainbow test sweep
    strip->clear();
    for (uint16_t y = 0; y < config.height; ++y) {
      for (uint16_t x = 0; x < config.width; ++x) {
        float t = (static_cast<float>(x + y) / (config.width + config.height));
        t = fmodf(t, 1.0f);
        uint8_t r = clamp8(sin(t * 6.28318f) * 127 + 128);
        uint8_t g = clamp8(sin((t + 0.33f) * 6.28318f) * 127 + 128);
        uint8_t b = clamp8(sin((t + 0.66f) * 6.28318f) * 127 + 128);
        uint16_t idx = pixelIndex(x, y);
        if (idx != UINT16_MAX) strip->setPixelColor(idx, strip->Color(r, g, b));
      }
    }
    strip->setBrightness(effectiveBrightness(config));
    strip->show();
    return;
  }

  renderClockScene(0.0f);
  strip->setBrightness(effectiveBrightness(config));
  strip->show();
}

void MatrixDisplayService::loop() {
  handleMqtt();
  if (!config.enabled) {
    return;
  }
  ensureStrip();
  renderFrame();
}

void MatrixDisplayService::showSolid(uint32_t color) {
  if (!strip) return;
  for (uint16_t i = 0; i < strip->numPixels(); ++i) {
    strip->setPixelColor(i, color);
  }
  strip->show();
}
