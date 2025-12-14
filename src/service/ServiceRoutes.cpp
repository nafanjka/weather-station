#include "ServiceRoutes.h"

#include <Arduino.h>
#include <LittleFS.h>
#include <math.h>
#include <AsyncJson.h>
#include <esp32/spiram.h>
#include <map>

#include "WeatherService.h"
#include "OutdoorService.h"
#include "common/ResponseHelpers.h"

void registerServiceRoutes(AsyncWebServer &server, WeatherService &weatherService, OutdoorService &outdoorService) {
  server.on("/api/weather/metrics", HTTP_GET, [&weatherService](AsyncWebServerRequest *request) {
    WeatherReading reading;
    bool ok = weatherService.read(reading);
    sendJson(request, [&weatherService, ok, reading](JsonVariant json) {
      JsonObject root = json.to<JsonObject>();
      root["status"] = ok ? "ok" : "stale";
      root["collectedAtMs"] = reading.collectedAtMs;
      root["seaLevelPressureHpa"] = weatherService.seaLevelPressure();

      JsonObject sensors = root["sensors"].to<JsonObject>();
      JsonObject sht = sensors["sht31"].to<JsonObject>();
      sht["present"] = weatherService.hasSHT();
      sht["ok"] = reading.shtOk;

      JsonObject bmp = sensors["bmp580"].to<JsonObject>();
      bmp["present"] = weatherService.hasBMP();
      bmp["ok"] = reading.bmpOk;

      JsonObject metrics = root["metrics"].to<JsonObject>();
      if (!isnan(reading.temperatureC)) {
        metrics["temperatureC"] = reading.temperatureC;
        metrics["temperatureF"] = reading.temperatureC * 9.0f / 5.0f + 32.0f;
      }
      if (!isnan(reading.humidity)) {
        metrics["humidity"] = reading.humidity;
      }
      if (!isnan(reading.dewPointC)) {
        metrics["dewPointC"] = reading.dewPointC;
        metrics["dewPointF"] = reading.dewPointC * 9.0f / 5.0f + 32.0f;
      }
      if (!isnan(reading.pressurePa)) {
        metrics["pressurePa"] = reading.pressurePa;
        metrics["pressureHpa"] = reading.pressurePa / 100.0f;
        metrics["pressureMmHg"] = reading.pressurePa / 133.322f;
      }
      if (!isnan(reading.altitudeM)) {
        metrics["altitudeM"] = reading.altitudeM;
        metrics["altitudeFt"] = reading.altitudeM * 3.28084f;
      }
      if (!isnan(reading.bmpTemperatureC)) {
        metrics["pressureTemperatureC"] = reading.bmpTemperatureC;
      }
    });
  });

  auto &serviceHandler = server.serveStatic("/service", LittleFS, "/service/");
  serviceHandler.setDefaultFile("main.html");

  // Direct file mapping for clients that request the full path.
  server.serveStatic("/service/main.html", LittleFS, "/service/main.html");

  server.on("/main.html", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/service/main.html");
  });

  server.on("/service", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/service/");
  });

  server.on("/service.css", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/service/service.css");
  });

  server.on("/api/system/resources", HTTP_GET, [](AsyncWebServerRequest *request) {
    auto *response = new AsyncJsonResponse(false);
    if (!response) {
      request->send(503, "application/json", "{\"error\":\"oom\"}");
      return;
    }

    JsonObject root = response->getRoot();
    root["uptimeMs"] = millis();

    JsonObject heap = root["heap"].to<JsonObject>();
    heap["free"] = ESP.getFreeHeap();
    heap["minFree"] = ESP.getMinFreeHeap();
    heap["maxAlloc"] = ESP.getMaxAllocHeap();
    heap["size"] = ESP.getHeapSize();

    JsonObject psram = root["psram"].to<JsonObject>();
    const bool hasPsram = psramFound() && ESP.getPsramSize() > 0;
    psram["present"] = hasPsram;
    psram["size"] = hasPsram ? ESP.getPsramSize() : 0;
    if (hasPsram) {
      psram["free"] = ESP.getFreePsram();
      psram["minFree"] = ESP.getMinFreePsram();
      psram["maxAlloc"] = ESP.getMaxAllocPsram();
    } else {
      psram["free"] = 0;
      psram["minFree"] = 0;
      psram["maxAlloc"] = 0;
    }

    JsonObject fs = root["fs"].to<JsonObject>();
    fs["total"] = LittleFS.totalBytes();
    fs["used"] = LittleFS.usedBytes();

    root["cpuFreqMhz"] = ESP.getCpuFreqMHz();
    root["sdkVersion"] = ESP.getSdkVersion();
    root["chipRevision"] = ESP.getChipRevision();

    response->setLength();
    request->send(response);
  });

  server.on("/api/outdoor/config", HTTP_GET, [&outdoorService](AsyncWebServerRequest *request) {
    sendJson(request, [&outdoorService](JsonVariant json) {
      JsonObject obj = json.as<JsonObject>();
      OutdoorConfig cfg = outdoorService.currentConfig();
      obj["enabled"] = cfg.enabled;
      obj["lat"] = cfg.lat;
      obj["lon"] = cfg.lon;
      obj["city"] = cfg.city;
      obj["country"] = cfg.country;
      obj["configured"] = outdoorService.hasConfig();
      obj["lastFetchMs"] = outdoorService.lastFetchMs();
    });
  });

  auto *outdoorSaveHandler = new AsyncCallbackJsonWebHandler("/api/outdoor/config", [&outdoorService](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }
    JsonObject obj = json.as<JsonObject>();
    OutdoorConfig cfg = outdoorService.currentConfig();
    if (obj["enabled"].is<bool>()) cfg.enabled = obj["enabled"].as<bool>();
    if (obj["lat"].is<double>()) cfg.lat = obj["lat"].as<double>();
    if (obj["lon"].is<double>()) cfg.lon = obj["lon"].as<double>();
    if (obj["city"].is<const char *>()) cfg.city = obj["city"].as<const char *>();
    if (obj["country"].is<const char *>()) cfg.country = obj["country"].as<const char *>();
    outdoorService.saveConfig(cfg);
    request->send(200, "application/json", "{\"status\":\"saved\"}");
  });
  outdoorSaveHandler->setMethod(HTTP_POST);
  server.addHandler(outdoorSaveHandler);

  server.on("/api/outdoor/forecast", HTTP_GET, [&outdoorService](AsyncWebServerRequest *request) {
    bool force = request->hasParam("force");
    // Avoid blocking the HTTP handler; rely on background updates/push cache.
    (void)force;
    sendJson(request, [&outdoorService](JsonVariant json) {
      JsonObject root = json.to<JsonObject>();
      OutdoorConfig cfg = outdoorService.currentConfig();
      root["enabled"] = cfg.enabled;
      root["configured"] = outdoorService.hasConfig();
      root["lastFetchMs"] = outdoorService.lastFetchMs();
      root["lastAttemptMs"] = outdoorService.lastAttemptMs();
      root["lastStatusCode"] = outdoorService.lastStatusCode();
      root["lastError"] = outdoorService.lastError();

      JsonObject cfgObj = root["config"].to<JsonObject>();
      cfgObj["lat"] = cfg.lat;
      cfgObj["lon"] = cfg.lon;
      cfgObj["city"] = cfg.city;
      cfgObj["country"] = cfg.country;

      OutdoorSnapshot cur = outdoorService.current();
      JsonObject curObj = root["current"].to<JsonObject>();
      curObj["temperatureC"] = cur.temperatureC;
      curObj["humidity"] = cur.humidity;
      curObj["pressureHpa"] = cur.pressureHpa;
      curObj["pressureMmHg"] = cur.pressureMmHg;
      curObj["altitudeM"] = cur.altitudeM;

      JsonObject outlook = root["outlook"].to<JsonObject>();
      for (uint16_t h : OUTLOOK_HORIZONS) {
        OutdoorSnapshot snap = outdoorService.forecastFor(h);
        JsonObject slot = outlook[String("h") + String(h)].to<JsonObject>();
        slot["tempC"] = snap.temperatureC;
        slot["humidity"] = snap.humidity;
        slot["pressureHpa"] = snap.pressureHpa;
        slot["pressureMmHg"] = snap.pressureMmHg;
      }
    });
  });

  auto *outdoorCacheHandler = new AsyncCallbackJsonWebHandler("/api/outdoor/cache", [&outdoorService](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }

    JsonObject obj = json.as<JsonObject>();
    auto parseSnapshot = [](JsonObject snapObj) {
      OutdoorSnapshot snap;
      if (snapObj.isNull()) return snap;

      auto setIfNumber = [&snapObj](const char *key, float &target) {
        JsonVariant v = snapObj[key];
        if (v.is<float>() || v.is<double>() || v.is<long>() || v.is<int>()) {
          target = v.as<float>();
        }
      };

      setIfNumber("temperatureC", snap.temperatureC);
      setIfNumber("tempC", snap.temperatureC);
      setIfNumber("humidity", snap.humidity);
      setIfNumber("pressureHpa", snap.pressureHpa);
      setIfNumber("pressureMmHg", snap.pressureMmHg);
      setIfNumber("altitudeM", snap.altitudeM);
      if (isnan(snap.pressureMmHg) && !isnan(snap.pressureHpa)) {
        snap.pressureMmHg = snap.pressureHpa / 1.33322f;
      }
      return snap;
    };

    OutdoorSnapshot current = parseSnapshot(obj["current"].as<JsonObject>());

    std::map<uint16_t, OutdoorSnapshot> future;
    JsonObject outlookObj = obj["outlook"].as<JsonObject>();
    if (!outlookObj.isNull()) {
      for (uint16_t h : OUTLOOK_HORIZONS) {
        String key = String("h") + String(h);
        JsonVariant slot = outlookObj[key];
        if (!slot.isNull() && slot.is<JsonObject>()) {
          future[h] = parseSnapshot(slot.as<JsonObject>());
          continue;
        }
        slot = outlookObj[String(h)];
        if (!slot.isNull() && slot.is<JsonObject>()) {
          future[h] = parseSnapshot(slot.as<JsonObject>());
        }
      }
    }

    unsigned long fetchedAtMs = millis();
    if (obj["fetchedAtMs"].is<unsigned long>()) {
      fetchedAtMs = obj["fetchedAtMs"].as<unsigned long>();
    } else if (obj["fetchedAtMs"].is<long>()) {
      fetchedAtMs = static_cast<unsigned long>(obj["fetchedAtMs"].as<long>());
    } else if (obj["fetchedAtMs"].is<double>()) {
      fetchedAtMs = static_cast<unsigned long>(obj["fetchedAtMs"].as<double>());
    }

    outdoorService.updateCache(current, future, fetchedAtMs);
    request->send(200, "application/json", "{\"status\":\"cached\"}");
  });
  outdoorCacheHandler->setMethod(HTTP_POST);
  server.addHandler(outdoorCacheHandler);
}
