#include "ServiceRoutes.h"

#include <Arduino.h>
#include <LittleFS.h>
#include <math.h>
#include <AsyncJson.h>
#include <esp32/spiram.h>
#include <map>
#include <algorithm>

#include "WeatherService.h"
#include "OutdoorService.h"
#include "MatrixDisplayService.h"
#include "common/ResponseHelpers.h"

void registerServiceRoutes(AsyncWebServer &server, WeatherService &weatherService, OutdoorService &outdoorService, MatrixDisplayService &matrixService) {
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

  server.on("/api/matrix/config", HTTP_GET, [&matrixService](AsyncWebServerRequest *request) {
    sendJson(request, [&matrixService](JsonVariant json) {
      JsonObject obj = json.as<JsonObject>();
      MatrixConfig cfg = matrixService.currentConfig();
      obj["enabled"] = cfg.enabled;
      obj["pin"] = cfg.pin;
      obj["width"] = cfg.width;
      obj["height"] = cfg.height;
      obj["serpentine"] = cfg.serpentine;
      obj["startBottom"] = cfg.startBottom;
      obj["flipX"] = cfg.flipX;
      obj["orientationIndex"] = static_cast<uint8_t>(cfg.orientation);
      obj["orientationDegrees"] = static_cast<uint8_t>(cfg.orientation) * 90;
      obj["brightness"] = cfg.brightness;
      obj["maxBrightness"] = cfg.maxBrightness;
      obj["nightEnabled"] = cfg.nightEnabled;
      obj["nightStartMin"] = cfg.nightStartMin;
      obj["nightEndMin"] = cfg.nightEndMin;
      obj["nightBrightness"] = cfg.nightBrightness;
      obj["fps"] = cfg.fps;
      obj["sceneDwellMs"] = cfg.sceneDwellMs;
      obj["transitionMs"] = cfg.transitionMs;
      JsonArray order = obj["sceneOrder"].to<JsonArray>();
      for (uint8_t i = 0; i < cfg.sceneCount && i < 4; ++i) {
        order.add(cfg.sceneOrder[i]);
      }
      obj["sceneCount"] = cfg.sceneCount;
      obj["clockUse12h"] = cfg.clockUse12h;
      obj["clockShowSeconds"] = cfg.clockShowSeconds;
      obj["clockShowMillis"] = cfg.clockShowMillis;
      obj["colorMode"] = static_cast<uint8_t>(cfg.colorMode);
      {
        JsonArray c1 = obj["color1"].to<JsonArray>();
        c1.add(cfg.color1R);
        c1.add(cfg.color1G);
        c1.add(cfg.color1B);
      }
      {
        JsonArray c2 = obj["color2"].to<JsonArray>();
        c2.add(cfg.color2R);
        c2.add(cfg.color2G);
        c2.add(cfg.color2B);
      }
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

  auto *matrixSaveHandler = new AsyncCallbackJsonWebHandler("/api/matrix/config", [&matrixService](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }

    MatrixConfig cfg = matrixService.currentConfig();
    JsonObject obj = json.as<JsonObject>();

    if (obj["enabled"].is<bool>()) cfg.enabled = obj["enabled"].as<bool>();
    if (obj["pin"].is<unsigned long>() || obj["pin"].is<int>() || obj["pin"].is<double>()) {
      uint32_t pin = obj["pin"].as<uint32_t>();
      cfg.pin = pin <= 255 ? static_cast<uint8_t>(pin) : cfg.pin;
    }
    if (obj["width"].is<unsigned long>() || obj["width"].is<int>() || obj["width"].is<double>()) {
      uint32_t w = obj["width"].as<uint32_t>();
      cfg.width = (w > 0 && w <= 256) ? static_cast<uint16_t>(w) : cfg.width;
    }
    if (obj["height"].is<unsigned long>() || obj["height"].is<int>() || obj["height"].is<double>()) {
      uint32_t h = obj["height"].as<uint32_t>();
      cfg.height = (h > 0 && h <= 256) ? static_cast<uint16_t>(h) : cfg.height;
    }
    if (obj["serpentine"].is<bool>()) cfg.serpentine = obj["serpentine"].as<bool>();
    if (obj["startBottom"].is<bool>()) cfg.startBottom = obj["startBottom"].as<bool>();
    if (obj["flipX"].is<bool>()) cfg.flipX = obj["flipX"].as<bool>();
    if (obj["orientationIndex"].is<unsigned long>() || obj["orientationIndex"].is<int>() || obj["orientationIndex"].is<double>()) {
      uint32_t idx = obj["orientationIndex"].as<uint32_t>();
      if (idx <= 3) cfg.orientation = static_cast<MatrixOrientation>(idx);
    } else if (obj["orientationDegrees"].is<unsigned long>() || obj["orientationDegrees"].is<int>()) {
      uint32_t deg = obj["orientationDegrees"].as<uint32_t>();
      if (deg % 90 == 0) {
        uint32_t idx = (deg / 90) % 4;
        cfg.orientation = static_cast<MatrixOrientation>(idx);
      }
    }
    if (obj["brightness"].is<unsigned long>() || obj["brightness"].is<int>() || obj["brightness"].is<double>()) {
      uint32_t b = obj["brightness"].as<uint32_t>();
      cfg.brightness = b <= 255 ? static_cast<uint8_t>(b) : cfg.brightness;
    }
    if (obj["maxBrightness"].is<unsigned long>() || obj["maxBrightness"].is<int>() || obj["maxBrightness"].is<double>()) {
      uint32_t b = obj["maxBrightness"].as<uint32_t>();
      cfg.maxBrightness = b <= 255 ? static_cast<uint8_t>(b) : cfg.maxBrightness;
    }
    if (obj["nightEnabled"].is<bool>()) cfg.nightEnabled = obj["nightEnabled"].as<bool>();
    if (obj["nightStartMin"].is<unsigned long>() || obj["nightStartMin"].is<int>() || obj["nightStartMin"].is<double>()) {
      uint32_t v = obj["nightStartMin"].as<uint32_t>();
      cfg.nightStartMin = v <= 1440 ? static_cast<uint16_t>(v) : cfg.nightStartMin;
    }
    if (obj["nightEndMin"].is<unsigned long>() || obj["nightEndMin"].is<int>() || obj["nightEndMin"].is<double>()) {
      uint32_t v = obj["nightEndMin"].as<uint32_t>();
      cfg.nightEndMin = v <= 1440 ? static_cast<uint16_t>(v) : cfg.nightEndMin;
    }
    if (obj["nightBrightness"].is<unsigned long>() || obj["nightBrightness"].is<int>() || obj["nightBrightness"].is<double>()) {
      uint32_t v = obj["nightBrightness"].as<uint32_t>();
      cfg.nightBrightness = v <= 255 ? static_cast<uint8_t>(v) : cfg.nightBrightness;
    }
    if (obj["fps"].is<unsigned long>() || obj["fps"].is<int>() || obj["fps"].is<double>()) {
      uint32_t f = obj["fps"].as<uint32_t>();
      cfg.fps = (f >= 1 && f <= 200) ? static_cast<uint16_t>(f) : cfg.fps;
    }
    if (obj["sceneDwellMs"].is<unsigned long>() || obj["sceneDwellMs"].is<int>() || obj["sceneDwellMs"].is<double>()) {
      uint32_t d = obj["sceneDwellMs"].as<uint32_t>();
      cfg.sceneDwellMs = d <= 60000 ? static_cast<uint16_t>(d) : cfg.sceneDwellMs;
    }
    if (obj["transitionMs"].is<unsigned long>() || obj["transitionMs"].is<int>() || obj["transitionMs"].is<double>()) {
      uint32_t t = obj["transitionMs"].as<uint32_t>();
      cfg.transitionMs = t <= 5000 ? static_cast<uint16_t>(t) : cfg.transitionMs;
    }

    if (obj["sceneOrder"].is<JsonArray>()) {
      JsonArray arr = obj["sceneOrder"].as<JsonArray>();
      uint8_t i = 0;
      for (JsonVariant v : arr) {
        if (i >= 4) break;
        uint8_t s = v.as<uint8_t>();
        cfg.sceneOrder[i] = s % 4;
        ++i;
      }
      if (i >= 1 && i <= 4) cfg.sceneCount = i;
    } else if (obj["sceneCount"].is<unsigned long>() || obj["sceneCount"].is<int>()) {
      uint32_t c = obj["sceneCount"].as<uint32_t>();
      if (c >= 1 && c <= 4) cfg.sceneCount = static_cast<uint8_t>(c);
    }

    if (obj["clockUse12h"].is<bool>()) cfg.clockUse12h = obj["clockUse12h"].as<bool>();
    if (obj["clockShowSeconds"].is<bool>()) cfg.clockShowSeconds = obj["clockShowSeconds"].as<bool>();
    if (obj["clockShowMillis"].is<bool>()) cfg.clockShowMillis = obj["clockShowMillis"].as<bool>();

    if (obj["colorMode"].is<unsigned long>() || obj["colorMode"].is<int>()) {
      uint32_t m = obj["colorMode"].as<uint32_t>();
      if (m <= 2) cfg.colorMode = static_cast<MatrixColorMode>(m);
    }
    if (obj["color1"].is<JsonArray>()) {
      JsonArray c1 = obj["color1"].as<JsonArray>();
      if (c1.size() >= 3) {
        cfg.color1R = static_cast<uint8_t>(std::min<uint32_t>(255, c1[0].as<uint32_t>()));
        cfg.color1G = static_cast<uint8_t>(std::min<uint32_t>(255, c1[1].as<uint32_t>()));
        cfg.color1B = static_cast<uint8_t>(std::min<uint32_t>(255, c1[2].as<uint32_t>()));
      }
    }
    if (obj["color2"].is<JsonArray>()) {
      JsonArray c2 = obj["color2"].as<JsonArray>();
      if (c2.size() >= 3) {
        cfg.color2R = static_cast<uint8_t>(std::min<uint32_t>(255, c2[0].as<uint32_t>()));
        cfg.color2G = static_cast<uint8_t>(std::min<uint32_t>(255, c2[1].as<uint32_t>()));
        cfg.color2B = static_cast<uint8_t>(std::min<uint32_t>(255, c2[2].as<uint32_t>()));
      }
    }

    matrixService.saveConfig(cfg);
    request->send(200, "application/json", "{\"status\":\"saved\"}");
  });
  matrixSaveHandler->setMethod(HTTP_POST);
  matrixSaveHandler->setMaxContentLength(4096);
  server.addHandler(matrixSaveHandler);

  auto *matrixActionHandler = new AsyncCallbackJsonWebHandler("/api/matrix/action", [&matrixService](AsyncWebServerRequest *request, JsonVariant &json) {
    if (!json.is<JsonObject>()) {
      request->send(400, "application/json", "{\"error\":\"invalid json\"}");
      return;
    }
    JsonObject obj = json.as<JsonObject>();
    const char *action = obj["action"];
    if (!action) {
      request->send(400, "application/json", "{\"error\":\"missing action\"}");
      return;
    }
    matrixService.performAction(String(action));
    request->send(200, "application/json", "{\"status\":\"ok\"}");
  });
  matrixActionHandler->setMethod(HTTP_POST);
  matrixActionHandler->setMaxContentLength(1024);
  server.addHandler(matrixActionHandler);

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
      curObj["windSpeed"] = cur.windSpeed;

      JsonObject outlook = root["outlook"].to<JsonObject>();
      for (uint16_t h : OUTLOOK_HORIZONS) {
        OutdoorSnapshot snap = outdoorService.forecastFor(h);
        JsonObject slot = outlook[String("h") + String(h)].to<JsonObject>();
        slot["tempC"] = snap.temperatureC;
        slot["humidity"] = snap.humidity;
        slot["pressureHpa"] = snap.pressureHpa;
        slot["pressureMmHg"] = snap.pressureMmHg;
        slot["windSpeed"] = snap.windSpeed;
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
      setIfNumber("windSpeed", snap.windSpeed);
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
