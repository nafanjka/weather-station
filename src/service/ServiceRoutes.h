#pragma once

#include <ESPAsyncWebServer.h>

class WeatherService;
class OutdoorService;
class MatrixDisplayService;

// Registers weather API endpoints and service static assets.
void registerServiceRoutes(AsyncWebServer &server, WeatherService &weatherService, OutdoorService &outdoorService, MatrixDisplayService &matrixService);
