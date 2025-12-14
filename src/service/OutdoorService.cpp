#include "OutdoorService.h"

#include "setup/ManagedWiFi.h"

namespace {
constexpr const char *NS = "outdoor";
}

void OutdoorService::begin(ManagedWiFi *wifi) {
  wifiRef = wifi;
  loadConfig();
}

void OutdoorService::loop() {
  // Auto-fetch disabled: rely on UI/host to push cache to avoid blocking.
}

void OutdoorService::loadConfig() {
  prefs.begin(NS, true);
  config.enabled = prefs.getBool("enabled", true);
  config.lat = prefs.getDouble("lat", 0.0);
  config.lon = prefs.getDouble("lon", 0.0);
  config.city = prefs.getString("city", "");
  config.country = prefs.getString("country", "");
  prefs.end();
}

bool OutdoorService::saveConfig(const OutdoorConfig &next) {
  prefs.begin(NS, false);
  prefs.putBool("enabled", next.enabled);
  prefs.putDouble("lat", next.lat);
  prefs.putDouble("lon", next.lon);
  prefs.putString("city", next.city);
  prefs.putString("country", next.country);
  prefs.end();
  config = next;
  lastFetch = 0;
  lastAttempt = 0;
  lastStatus = 0;
  lastErr = "";
  clearForecast();
  currentSnapshot = OutdoorSnapshot{};
  return true;
}

OutdoorSnapshot OutdoorService::forecastFor(uint16_t hours) const {
  auto it = outlook.find(hours);
  if (it == outlook.end()) return OutdoorSnapshot{};
  return it->second;
}

void OutdoorService::clearForecast() {
  outlook.clear();
}

bool OutdoorService::ensureFresh(bool force) {
  (void)force;
  return hasData();
}

bool OutdoorService::fetch() {
  lastAttempt = millis();
  lastStatus = -99;
  lastErr = "fetch_disabled";
  return false;
}

void OutdoorService::updateCache(const OutdoorSnapshot &current, const std::map<uint16_t, OutdoorSnapshot> &future, unsigned long fetchedAtMs) {
  currentSnapshot = current;
  outlook = future;
  lastFetch = fetchedAtMs;
  lastAttempt = fetchedAtMs;
  lastStatus = 200;
  lastErr = "";
}

