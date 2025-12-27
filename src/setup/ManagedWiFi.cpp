#include "ManagedWiFi.h"
#include <Preferences.h>
#include "../common/DeviceHelpers.h"

namespace {
  Preferences wifiPrefs;
  constexpr const char *NS = "wifi";
  constexpr const char *KEY_SSID = "ssid";
  constexpr const char *KEY_PASS = "pass";
  constexpr const char *KEY_HOST = "host";
}

void ManagedWiFi::begin(){
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  loadCredentials();
  if(host.isEmpty()){
    host = DeviceHelpers::makeHostName("esp-weather");
    // Додаємо суфікс з MAC, як у DeviceHelpers
  }
  WiFi.setHostname(host.c_str());
  apName = DeviceHelpers::makeApName("ESPPortal");
  if(hasCredentials()){
    beginConnection();
  } else {
    startAccessPoint();
  }
}

void ManagedWiFi::loop(){
  unsigned long now = millis();
  if(scanPending){
    evaluateScan();
  }

  wl_status_t status = WiFi.status();
  if(state == State::Connecting){
    if(status == WL_CONNECTED){
      state = State::Connected;
      stopAccessPoint();
    } else if(now - connectStartedAt >= CONNECT_TIMEOUT_MS){
      state = State::Idle;
      rescheduleConnect();
      startAccessPoint();
    }
  } else if(state == State::Connected){
    if(status != WL_CONNECTED){
      state = State::Idle;
      rescheduleConnect();
      startAccessPoint();
    }
  } else { // Idle
    if(hasCredentials() && status != WL_CONNECTED && now - lastConnectAttempt >= RETRY_INTERVAL_MS){
      beginConnection();
    }
  }

  if(apActive && hasCredentials() && state != State::Connecting && now - lastConnectAttempt >= RETRY_INTERVAL_MS){
    beginConnection();
  }

  if(scanRequested && !scanPending){
    scanPending = true;
    lastScanRequest = now;
    scanResults.clear();
    int16_t res = WiFi.scanNetworks(false, true);
    if(res > 0){
      for(int i = 0; i < res; ++i){
        NetworkSummary summary;
        summary.ssid = WiFi.SSID(i);
        summary.rssi = WiFi.RSSI(i);
        summary.secure = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
        summary.channel = WiFi.channel(i);
        scanResults.push_back(summary);
      }
    }
    WiFi.scanDelete();
    scanRequested = false;
    scanPending = false;
  }
}

bool ManagedWiFi::hasCredentials() const{
  return credentialsLoaded && storedSSID.length() > 0;
}

bool ManagedWiFi::isConnected() const{
  return WiFi.status() == WL_CONNECTED;
}

bool ManagedWiFi::isAPActive() const{
  return apActive;
}

ManagedWiFi::Mode ManagedWiFi::currentMode() const{
  if(apActive && WiFi.status() == WL_CONNECTED){
    return Mode::StationAndAP;
  }
  if(apActive) return Mode::AccessPoint;
  return Mode::Station;
}

String ManagedWiFi::connectedSSID() const{
  if(isConnected()){
    return WiFi.SSID();
  }
  return String();
}

String ManagedWiFi::apSSID() const{
  return apName;
}

void ManagedWiFi::requestScan(){
  scanRequested = true;
  scanPending = false;
  lastScanRequest = millis();
}

bool ManagedWiFi::scanInProgress() const{
  return scanPending;
}

const std::vector<NetworkSummary> &ManagedWiFi::getScanResults() const{
  return scanResults;
}

bool ManagedWiFi::saveCredentials(const String &ssid, const String &pass){
  if(ssid.isEmpty()){
    return false;
  }
  wifiPrefs.begin(NS, false);
  wifiPrefs.putString(KEY_SSID, ssid);
  wifiPrefs.putString(KEY_PASS, pass);
  wifiPrefs.end();
  storedSSID = ssid;
  storedPass = pass;
  credentialsLoaded = true;
  beginConnection();
  return true;
}

bool ManagedWiFi::saveHostName(const String &next){
  if(next.isEmpty()){
    return false;
  }
  wifiPrefs.begin(NS, false);
  wifiPrefs.putString(KEY_HOST, next);
  wifiPrefs.end();
  host = next;
  WiFi.setHostname(host.c_str());
  if(hasCredentials()){
    beginConnection();
  }
  return true;
}

void ManagedWiFi::forgetCredentials(){
  wifiPrefs.begin(NS, false);
  wifiPrefs.remove(KEY_SSID);
  wifiPrefs.remove(KEY_PASS);
  wifiPrefs.end();
  storedSSID.clear();
  storedPass.clear();
  credentialsLoaded = false;
  WiFi.disconnect(true);
  state = State::Idle;
  startAccessPoint();
}

bool ManagedWiFi::triggerConnect(){
  if(!hasCredentials()){
    return false;
  }
  beginConnection();
  return true;
}

void ManagedWiFi::loadCredentials(){
  wifiPrefs.begin(NS, true);
  storedSSID = wifiPrefs.getString(KEY_SSID, "");
  storedPass = wifiPrefs.getString(KEY_PASS, "");
  host = wifiPrefs.getString(KEY_HOST, "");
  wifiPrefs.end();
  credentialsLoaded = storedSSID.length() > 0;
}

void ManagedWiFi::startAccessPoint(){
  if(apActive){
    return;
  }
  WiFi.mode(WIFI_AP_STA);
  bool started = WiFi.softAP(apName.c_str());
  if(started){
    apActive = true;
  }
}

void ManagedWiFi::stopAccessPoint(){
  if(!apActive){
    return;
  }
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  apActive = false;
}

void ManagedWiFi::beginConnection(){
  if(!hasCredentials()){
    return;
  }
  WiFi.mode(apActive ? WIFI_AP_STA : WIFI_STA);
  if(host.isEmpty()){
    host = DeviceHelpers::makeHostName("esp-weather");
  }
  WiFi.setHostname(host.c_str());
  WiFi.begin(storedSSID.c_str(), storedPass.c_str());
  state = State::Connecting;
  connectStartedAt = millis();
  lastConnectAttempt = connectStartedAt;
}

void ManagedWiFi::evaluateScan(){
  int16_t result = WiFi.scanComplete();
  if(result == WIFI_SCAN_RUNNING){
    return;
  }
  scanPending = false;
  scanRequested = false;
  scanResults.clear();
  if(result <= 0){
    WiFi.scanDelete();
    return;
  }
  for(int i = 0; i < result; ++i){
    NetworkSummary summary;
    summary.ssid = WiFi.SSID(i);
    summary.rssi = WiFi.RSSI(i);
    summary.secure = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
    summary.channel = WiFi.channel(i);
    scanResults.push_back(summary);
  }
  WiFi.scanDelete();
}

void ManagedWiFi::rescheduleConnect(){
  lastConnectAttempt = millis();
}
