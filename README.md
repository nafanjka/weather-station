# ESP32 Weather + MQTT Node

ESP32 firmware that serves a web UI from LittleFS, publishes indoor metrics to MQTT/Home Assistant, caches outdoor weather pushed from a host/UI, and supports OTA updates. Auto-fetch of outdoor weather is disabled to avoid hangs; outdoor data is injected via the cache endpoint.

## Highlights
- Managed Wi-Fi portal with STA/AP fallback and retry.
- LittleFS-backed service UI (`/service/main.html`) plus setup pages.
- OTA firmware upload at `/api/ota/upload` or `/setup/ota.html`.
- Indoor sensing via SHT31/BMP580 with dew point, altitude, pressures, and system/network stats.
- Outdoor cache support: host/UI POSTs data, MQTT and HTTP expose it; fetch is disabled on-device.
- MQTT telemetry + HA discovery, including outdoor metrics and top-level city/country/lat/lon, plus separate city/country text entities.
- Async stack: ESPAsyncWebServer, AsyncTCP, ArduinoJson v7, PubSubClient.
- Modern web UI with animated sky icons, forecast snapshots, and a configurable clock banner.

## Web UI Overview (`/service/main.html`)
- **Weather tiles**: Indoor/outdoor temperature, humidity (with wind), pressure, altitude, dew point, and live status of SHT31/BMP580 sensors.
- **Clock banner**: Toggleable clock with optional seconds/milliseconds, selectable font, 12/24h format, auto/manual timezone, and NTP pool list (for display/metadata).
- **Charts**: 24h temperature/humidity and pressure charts with click-to-open 7-day history modal; legend toggles persist; humidity axis labels removed per UX choice.
- **Forecast**: 1–96h outlook cards with condition icons and core metrics.
- **Resources**: Uptime, heap/PSRAM, FS usage, CPU percent.

## Clock & Time Setup (Weather modal)
- **Enable clock**: Show/hide banner.
- **Timezone**: Auto from selected city or manual TZ string (IANA, e.g., `Europe/Prague`).
- **Format**: 12h/24h toggle (rendering adapts silently; badge hidden on banner).
- **Details**: Show seconds, milliseconds, date, timezone label.
- **Font**: Dropdown includes system default plus Inter, Montserrat, Poppins, Fira Code, and casual options (Comic Sans, Marker Felt, Snell Roundhand).
- **NTP pools & sync interval**: Stored in UI for display/metadata; device-side NTP handling can be hooked to these if desired.

## Outdoor Data Flow
- Device does **not** call internet weather APIs. Push data to `POST /api/outdoor/cache` (e.g., from your server/UI after calling an external API). Cached data is served via `/api/outdoor/forecast` and published over MQTT.
- The setup modal saves city/country/lat/lon/timezone to `/api/outdoor/config`; timezone is used for the clock when in “Use selected city” mode.

## Build & Upload
1. Install [PlatformIO](https://platformio.org/) and open this folder in VS Code.
2. Build firmware: `pio run`
3. Flash over USB: `pio run -t upload -e esp32dev --upload-port /dev/tty.usbserial-130` (adjust port as needed).
4. Upload static assets (if changed): `pio run -t uploadfs`
5. OTA alternative over Wi-Fi:
	 - Firmware (code changes): `pio run` ➜ `curl --fail --max-time 120 --connect-timeout 10 -H 'Expect:' -F firmware=@.pio/build/esp32dev/firmware.bin http://<device>/api/ota/upload`
	 - LittleFS assets (UI/static changes only): `pio run -t buildfs` ➜ 
		 `curl --fail --max-time 180 --connect-timeout 10 -H 'Expect:' -F littlefs=@.pio/build/esp32dev/littlefs.bin http://<device>/api/fs/upload`

When to use which flow
- USB flash (`pio run -t upload ...`): first-time flash, bootloader/partition changes, or recovery if OTA fails.
- OTA firmware (`/api/ota/upload`): when you change C++ code/logic; keeps settings and avoids USB.
- OTA LittleFS (`/api/fs/upload`): when you change web assets (HTML/JS/CSS) without firmware changes. Safe to run after firmware OTA if both changed.

On first boot the board exposes an AP `ESPPortal-XXXXXX`. Visit `http://192.168.4.1/` to set Wi-Fi or use the OTA page. Once connected to Wi-Fi, the service UI is at `/service/main.html` and OTA remains available.

## Runtime Behaviour
- STA connect attempts for 60 s; falls back to AP if no link, retries periodically when credentials exist.
- Root routes redirect to the service UI; setup/OTA/Wi-Fi pages remain reachable.
- Outdoor auto-fetch is disabled; cache must be pushed by a host/UI.

## HTTP APIs
- `GET /api/system/resources` – uptime, heap/PSRAM, FS stats, CPU info.
- `GET /api/weather/metrics` – indoor readings (temp, humidity, dew point, pressure, altitude) and sensor status.
- `GET /api/outdoor/config` – outdoor config and last fetch/attempt metadata.
- `POST /api/outdoor/config` – save outdoor location `{enabled,lat,lon,city,country}`.
- `GET /api/outdoor/forecast` – current cached outdoor data and outlook; non-blocking.
- `POST /api/outdoor/cache` – push outdoor cache `{current:{...}, outlook:{h1:{...},...}, fetchedAtMs?}`.
- `POST /api/ota/upload` – upload firmware `.bin` (reboots on success).
- Wi-Fi setup endpoints live under `/api/wifi/*` and serve the portal; see `SetupRoutes` for details.

## MQTT / Home Assistant
- Base topic: `homeassistant/weatherstation` (configurable). Telemetry on `<base>/telemetry`, status on `<base>/status`.
- HA discovery publishes indoor metrics, system/network stats, outdoor metrics, and forecast horizons (1h–96h).
- Location surfaced both as top-level fields (`city`, `country`, `lat`, `lon`, plus `outdoorCity/OutdoorCountry/Lat/Lon`) and dedicated text entities `location_city` and `location_country`.

## Outdoor Data Flow
- Device does NOT fetch from the internet. Push data to `POST /api/outdoor/cache` (e.g., from your server/UI after calling an external API). Cached data is then served via `/api/outdoor/forecast` and published over MQTT.

## Notes / Limits
- LED matrix rendering is not included; clock is UI-side only (no physical display yet). Flash/RAM headroom leaves room to add it.
- Keep WS2812 brightness capped and use a dedicated 5 V supply if you add the matrix.

## Quick Curl Examples
- Push outdoor cache:
	`curl -H "Content-Type: application/json" --data @outdoor.json http://<device>/api/outdoor/cache`
- Read forecast:
	`curl http://<device>/api/outdoor/forecast`
