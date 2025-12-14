#include "WeatherService.h"

#include <math.h>

namespace {
  constexpr uint8_t SHT31_I2C_ADDR = 0x44;
  constexpr uint8_t BMP5XX_ADDR_PRIMARY = 0x47;
  constexpr uint8_t BMP5XX_ADDR_SECONDARY = 0x46;
}

bool WeatherService::begin(TwoWire &wire){
  wireRef = &wire;
#if defined(ARDUINO_ARCH_ESP32)
  wireRef->begin();
#else
  wireRef->begin();
#endif

  shtAvailable = sht31.begin(SHT31_I2C_ADDR);
  if(shtAvailable){
    sht31.heater(false);
    Serial.println("SHT31 detected");
  } else {
    Serial.println("SHT31 not detected");
  }

  uint8_t bmpAddress = BMP5XX_ADDR_PRIMARY;
  bmpAvailable = bmp5.begin(bmpAddress, wireRef);
  if(!bmpAvailable){
    Serial.println("BMP580 not detected at 0x47, trying 0x46");
    bmpAddress = BMP5XX_ADDR_SECONDARY;
    bmpAvailable = bmp5.begin(bmpAddress, wireRef);
  }

  if(bmpAvailable){
    bmp5.setTemperatureOversampling(BMP5XX_OVERSAMPLING_8X);
    bmp5.setPressureOversampling(BMP5XX_OVERSAMPLING_16X);
    bmp5.setIIRFilterCoeff(BMP5XX_IIR_FILTER_COEFF_7);
    Serial.printf("BMP580 detected at 0x%02X\n", bmpAddress);
  } else {
    Serial.println("BMP580 not detected");
    Serial.println("Running fallback I2C scan to assist debugging...");
    for(uint8_t address = 0x08; address <= 0x77; ++address){
      wireRef->beginTransmission(address);
      if(wireRef->endTransmission() == 0){
        Serial.printf("  • Device responded at 0x%02X\n", address);
        delay(5);
      }
    }
  }

  lastReading = WeatherReading{};
  lastSampleTimestamp = 0;
  return shtAvailable || bmpAvailable;
}

void WeatherService::setSeaLevelPressure(float hPa){
  if(hPa > 0.0f){
    seaLevelPressureHpa = hPa;
  }
}

bool WeatherService::read(WeatherReading &out){
  WeatherReading reading;
  bool ok = performReadings(reading);
  if(ok || lastSampleTimestamp == 0){
    lastReading = reading;
    lastSampleTimestamp = reading.collectedAtMs;
  }
  out = lastReading;
  return ok;
}

bool WeatherService::performReadings(WeatherReading &reading){
  reading.collectedAtMs = millis();
  reading.shtPresent = shtAvailable;
  reading.bmpPresent = bmpAvailable;

  if(shtAvailable){
    float temperature = sht31.readTemperature();
    float humidity = sht31.readHumidity();
    bool valid = !isnan(temperature) && !isnan(humidity);
    reading.shtOk = valid;
    if(valid){
      reading.temperatureC = temperature;
      reading.humidity = humidity;
      reading.dewPointC = computeDewPoint(temperature, humidity);
    }
  }

  if(bmpAvailable){
    bool valid = bmp5.performReading();
    reading.bmpOk = valid;
    if(valid){
      // Library returns pressure in hPa, convert to Pa for internal math.
      float pressureHpa = bmp5.pressure;
      float pressurePa = pressureHpa * 100.0f;
      reading.pressurePa = pressurePa;
      reading.bmpTemperatureC = bmp5.temperature;
      if(!isnan(pressurePa)){
        reading.altitudeM = computeAltitude(pressurePa, seaLevelPressureHpa);
      }
    } else {
      static unsigned long lastLog = 0;
      unsigned long now = millis();
      if(now - lastLog > 5000){
        Serial.println("BMP580 performReading() timed out or failed");
        lastLog = now;
      }
    }
  }

  bool hasValid = (!shtAvailable || reading.shtOk) || (!bmpAvailable || reading.bmpOk);
  return hasValid;
}

float WeatherService::computeDewPoint(float temperatureC, float humidity){
  if(isnan(temperatureC) || isnan(humidity) || humidity <= 0.0f || humidity > 100.0f){
    return NAN;
  }
  const float a = 17.62f;
  const float b = 243.12f;
  float gamma = logf(humidity / 100.0f) + (a * temperatureC) / (b + temperatureC);
  return (b * gamma) / (a - gamma);
}

float WeatherService::computeAltitude(float pressurePa, float seaLevelHpa){
  if(seaLevelHpa <= 0.0f || pressurePa <= 0.0f){
    return NAN;
  }
  float seaLevelPa = seaLevelHpa * 100.0f;
  return 44330.0f * (1.0f - powf(pressurePa / seaLevelPa, 0.1903f));
}
