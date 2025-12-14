#include "ResponseHelpers.h"

void sendJson(AsyncWebServerRequest *request, std::function<void(JsonVariant)> fn) {
  AsyncJsonResponse *response = new AsyncJsonResponse(false);
  fn(response->getRoot());
  response->setLength();
  request->send(response);
}
