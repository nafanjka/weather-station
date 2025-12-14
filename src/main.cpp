#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <Wire.h>
#include "setup/ManagedWiFi.h"
#include "setup/SetupRoutes.h"
#include "assets/favicon.h"
#include "service/ServiceRoutes.h"
#include "service/WeatherService.h"
#include "service/MqttService.h"
#include "service/OutdoorService.h"

ManagedWiFi wifiManager;
AsyncWebServer server(80);
WeatherService weatherService;
OutdoorService outdoorService;
MqttService mqttService;
static bool otaRestartPending = false;
static unsigned long otaRestartAt = 0;

void scheduleRestart(uint32_t delayMs = 2000){
  otaRestartPending = true;
  otaRestartAt = millis() + delayMs;
}

void handlePendingRestart(){
  if(otaRestartPending && millis() >= otaRestartAt){
    Serial.println("Restarting after OTA update...");
    otaRestartPending = false;
    ESP.restart();
  }
}

void handleRoot(AsyncWebServerRequest *request){
  if(wifiManager.isAPActive() && !wifiManager.isConnected()){
    request->redirect("/setup/wifi.html");
  } else {
    request->redirect("/service/main.html");
  }
}

void setup(){
  Serial.begin(115200);
  delay(200);

  if(!LittleFS.begin(true)){
    Serial.println("Failed to mount LittleFS");
  }

  wifiManager.begin();
  weatherService.begin();
  outdoorService.begin(&wifiManager);
  mqttService.begin(&wifiManager, &weatherService, &outdoorService);

  registerServiceRoutes(server, weatherService, outdoorService);
  registerSetupRoutes(server, wifiManager, [](){ scheduleRestart(); }, &mqttService);
  server.on("/", HTTP_GET, handleRoot);

  server.on("/favicon.ico", HTTP_GET, [](AsyncWebServerRequest *request){
    auto *response = request->beginResponse(200, "image/x-icon", EmbeddedAssets::FAVICON_ICO, EmbeddedAssets::FAVICON_ICO_LEN);
    response->addHeader("Cache-Control", "public, max-age=86400");
    request->send(response);
  });
  server.begin();
}

void loop(){
  wifiManager.loop();
  outdoorService.loop();
  mqttService.loop();
  handlePendingRestart();
  delay(10);
}
