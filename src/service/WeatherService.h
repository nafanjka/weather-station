#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <Adafruit_BMP5xx.h>

struct WeatherReading {
  bool shtPresent = false;
  bool bmpPresent = false;
  bool shtOk = false;
  bool bmpOk = false;
  float temperatureC = NAN;
  float humidity = NAN;
  float dewPointC = NAN;
  float pressurePa = NAN;
  float altitudeM = NAN;
  float bmpTemperatureC = NAN;
  unsigned long collectedAtMs = 0;
};

class WeatherService {
public:
  bool begin(TwoWire &wire = Wire);
  bool read(WeatherReading &out);

  bool hasSHT() const { return shtAvailable; }
  bool hasBMP() const { return bmpAvailable; }

  void setSeaLevelPressure(float hPa);
  float seaLevelPressure() const { return seaLevelPressureHpa; }

  const WeatherReading &latest() const { return lastReading; }
  unsigned long lastSampleMs() const { return lastSampleTimestamp; }

private:
  bool performReadings(WeatherReading &reading);
  static float computeDewPoint(float temperatureC, float humidity);
  static float computeAltitude(float pressurePa, float seaLevelHpa);

  bool shtAvailable = false;
  bool bmpAvailable = false;
  float seaLevelPressureHpa = 1013.25f;
  unsigned long lastSampleTimestamp = 0;

  TwoWire *wireRef = nullptr;
  Adafruit_SHT31 sht31;
  Adafruit_BMP5xx bmp5;
  WeatherReading lastReading;
};
