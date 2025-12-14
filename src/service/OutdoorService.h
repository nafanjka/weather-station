#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <map>
#include <vector>

class ManagedWiFi;

struct OutdoorConfig {
  bool enabled = true;
  double lat = 0.0;
  double lon = 0.0;
  String city;
  String country;
};

struct OutdoorSnapshot {
  float temperatureC = NAN;
  float humidity = NAN;
  float pressureHpa = NAN;
  float pressureMmHg = NAN;
  float altitudeM = NAN;
};

constexpr uint16_t OUTLOOK_HORIZONS[] = {1, 3, 6, 12, 24, 48, 72, 96};
constexpr size_t OUTLOOK_HORIZON_COUNT = sizeof(OUTLOOK_HORIZONS) / sizeof(OUTLOOK_HORIZONS[0]);

class OutdoorService {
public:
  void begin(ManagedWiFi *wifi);
  void loop();

  OutdoorConfig currentConfig() const { return config; }
  bool saveConfig(const OutdoorConfig &next);
  void loadConfig();

  bool ensureFresh(bool force = false);
  unsigned long lastFetchMs() const { return lastFetch; }
  unsigned long lastAttemptMs() const { return lastAttempt; }
  int lastStatusCode() const { return lastStatus; }
  String lastError() const { return lastErr; }

  void updateCache(const OutdoorSnapshot &current, const std::map<uint16_t, OutdoorSnapshot> &future, unsigned long fetchedAtMs);

  OutdoorSnapshot current() const { return currentSnapshot; }
  OutdoorSnapshot forecastFor(uint16_t hours) const;

  bool hasConfig() const { return config.enabled && !isnan(config.lat) && !isnan(config.lon) && config.lat != 0.0 && config.lon != 0.0; }
  bool hasData() const { return !isnan(currentSnapshot.temperatureC) || !isnan(currentSnapshot.humidity) || !isnan(currentSnapshot.pressureHpa); }

private:
  bool fetch();
  void clearForecast();

  ManagedWiFi *wifiRef = nullptr;
  Preferences prefs;
  OutdoorConfig config;
  OutdoorSnapshot currentSnapshot;
  std::map<uint16_t, OutdoorSnapshot> outlook;

  unsigned long lastFetch = 0;
  unsigned long lastAttempt = 0;
  int lastStatus = 0;
  String lastErr;
};
