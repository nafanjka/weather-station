#pragma once

#include <functional>
#include <AsyncJson.h>
#include <ESPAsyncWebServer.h>

// Sends a JSON response using the provided serializer callback.
void sendJson(AsyncWebServerRequest *request, std::function<void(JsonVariant)> fn);
