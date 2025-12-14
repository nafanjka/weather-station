#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <vector>

struct NetworkSummary {
  String ssid;
  int32_t rssi = 0;
  bool secure = false;
  uint8_t channel = 0;
};

class ManagedWiFi {
public:
  enum class Mode : uint8_t {
    Station,
    AccessPoint,
    StationAndAP
  };

  void begin();
  void loop();

  bool hasCredentials() const;
  bool isConnected() const;
  bool isAPActive() const;
  Mode currentMode() const;
  String connectedSSID() const;
  String apSSID() const;
  String hostName() const { return host; }

  void requestScan();
  bool scanInProgress() const;
  const std::vector<NetworkSummary> &getScanResults() const;

  bool saveCredentials(const String &ssid, const String &pass);
  void forgetCredentials();
  bool triggerConnect();
  bool saveHostName(const String &next);

private:
  enum class State : uint8_t {
    Idle,
    Connecting,
    Connected
  };

  void loadCredentials();
  void startAccessPoint();
  void stopAccessPoint();
  void beginConnection();
  void evaluateScan();
  void rescheduleConnect();

  String storedSSID;
  String storedPass;
  String apName;
  bool credentialsLoaded = false;

  State state = State::Idle;
  Mode mode = Mode::Station;

  unsigned long connectStartedAt = 0;
  unsigned long lastConnectAttempt = 0;
  unsigned long lastScanRequest = 0;

  bool apActive = false;
  bool scanRequested = false;
  bool scanPending = false;

  std::vector<NetworkSummary> scanResults;

  String host;

  static constexpr unsigned long CONNECT_TIMEOUT_MS = 60000UL;
  static constexpr unsigned long RETRY_INTERVAL_MS = 300000UL;
};
