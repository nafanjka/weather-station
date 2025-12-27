#pragma once
#include <Arduino.h>
#include <WiFi.h>

namespace DeviceHelpers {

inline String getMacAddress() {
    return WiFi.macAddress();
}

inline String getSoftAPMacAddress() {
    return WiFi.softAPmacAddress();
}

inline String makeHostName(const String& prefix = "esp32") {
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return prefix + "-" + mac;
}

inline String makeApName(const String& prefix = "ESP32_AP") {
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return prefix + "-" + mac;
}

inline String makeTopic(const String& base, const String& suffix) {
    String topic = base;
    if (!topic.endsWith("/")) topic += "/";
    topic += suffix;
    return topic;
}

} // namespace DeviceHelpers
