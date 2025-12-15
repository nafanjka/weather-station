const selectors = {
  weatherStatus: () => document.getElementById("weather-status"),
  weatherInterval: () => document.getElementById("weather-interval"),
  weatherTempIndoor: () => document.getElementById("weather-temp-indoor"),
  weatherTempFIndoor: () => document.getElementById("weather-temp-f-indoor"),
  weatherTempOutdoor: () => document.getElementById("weather-temp-outdoor"),
  weatherTempFOutdoor: () => document.getElementById("weather-temp-f-outdoor"),
  weatherHumidityIndoor: () => document.getElementById("weather-humidity-indoor"),
  weatherHumidityOutdoor: () => document.getElementById("weather-humidity-outdoor"),
  weatherDewPoint: () => document.getElementById("weather-dewpoint"),
  weatherWindOutdoor: () => document.getElementById("weather-wind-outdoor"),
  weatherPressureIndoor: () => document.getElementById("weather-pressure-indoor"),
  weatherPressureHpaIndoor: () => document.getElementById("weather-pressure-hpa-indoor"),
  weatherPressureOutdoor: () => document.getElementById("weather-pressure-outdoor"),
  weatherPressureHpaOutdoor: () => document.getElementById("weather-pressure-hpa-outdoor"),
  weatherAltitudeIndoor: () => document.getElementById("weather-altitude-indoor"),
  weatherAltitudeFtIndoor: () => document.getElementById("weather-altitude-ft-indoor"),
  weatherAltitudeOutdoor: () => document.getElementById("weather-altitude-outdoor"),
  weatherAltitudeFtOutdoor: () => document.getElementById("weather-altitude-ft-outdoor"),
  weatherUpdated: () => document.getElementById("weather-updated"),
  weatherChart: () => document.getElementById("weather-chart"),
  pressureChart: () => document.getElementById("pressure-chart"),
  clockBanner: () => document.getElementById("clock-banner"),
  clockTime: () => document.getElementById("clock-time"),
  clockMs: () => document.getElementById("clock-ms"),
  clockDate: () => document.getElementById("clock-date"),
  clockZone: () => document.getElementById("clock-zone"),
  clockFontSelect: () => document.getElementById("clock-font-select"),
  sensorSht31Status: () => document.getElementById("sensor-sht31-status"),
  sensorBmp580Status: () => document.getElementById("sensor-bmp580-status"),
  outdoorConditionIcon: () => document.getElementById("outdoor-condition-icon"),
  locationSummary: () => document.getElementById("location-summary"),
  setupBtn: () => document.getElementById("outdoor-setup-btn"),
  modal: () => document.getElementById("outdoor-modal"),
  modalClose: () => document.getElementById("outdoor-close"),
  modalCancel: () => document.getElementById("outdoor-cancel"),
  modalSave: () => document.getElementById("outdoor-save"),
  providerSelect: () => document.getElementById("outdoor-provider"),
  citySelectors: () => document.getElementById("city-selectors"),
  searchInput: () => document.getElementById("outdoor-search"),
  searchResults: () => document.getElementById("outdoor-search-results"),
  searchStatus: () => document.getElementById("outdoor-search-status"),
  clockEnable: () => document.getElementById("clock-enable"),
  clockTimezoneMode: () => document.getElementById("clock-timezone-mode"),
  clockTimezoneManual: () => document.getElementById("clock-timezone-manual"),
  clockFormatSelect: () => document.getElementById("clock-format-select"),
  clockShowSeconds: () => document.getElementById("clock-show-seconds"),
  clockShowMillis: () => document.getElementById("clock-show-millis"),
  clockShowDate: () => document.getElementById("clock-show-date"),
  clockShowTimezone: () => document.getElementById("clock-show-timezone"),
  clockNtpPools: () => document.getElementById("clock-ntp-pools"),
  clockSyncInterval: () => document.getElementById("clock-sync-interval"),
  forecastGrid: () => document.getElementById("forecast-grid"),
  forecastUpdated: () => document.getElementById("forecast-updated"),
  forecastValue: (metric, horizon) => document.getElementById(`forecast-${metric}-${horizon}`),
  forecastIcon: (horizon) => document.getElementById(`forecast-icon-${horizon}`),
  resourcesUpdated: () => document.getElementById("resources-updated"),
  resUptime: () => document.getElementById("res-uptime"),
  resHeap: () => document.getElementById("res-heap"),
  resPsram: () => document.getElementById("res-psram"),
  resFs: () => document.getElementById("res-fs"),
  resCpu: () => document.getElementById("res-cpu"),
  historyModal: () => document.getElementById("history-modal"),
  historyClose: () => document.getElementById("history-close"),
  historyBackdrop: () => document.getElementById("history-backdrop"),
  historyTempChart: () => document.getElementById("history-weather-chart"),
  historyPressureChart: () => document.getElementById("history-pressure-chart"),
};

const weatherState = {
  intervalMs: 60000,
  timer: 0,
  history: [],
  maxAgeMs: 7 * 24 * 60 * 60 * 1000, // retain one week in storage
  historyCap: 7000,
  lastFetch: 0,
  lastPayload: null,
};

const resourceState = {
  intervalMs: 10000,
  timer: 0,
};

const clockState = {
  timer: 0,
  config: null,
};

const outdoorState = {
  config: null,
  metrics: null,
  lastFetch: 0,
  lastPush: 0,
  fetching: false,
  selection: null,
  searchResults: [],
};

const forecastState = {
  horizons: [1, 3, 6, 12, 24, 48, 72, 96],
  data: {},
  lastFetch: 0,
  lastLocation: null,
};

const chartMeta = {
  weatherMain: null,
  pressureMain: null,
  weatherWeek: null,
  pressureWeek: null,
};

const chartVisibility = {
  tempIn: true,
  tempOut: true,
  humIn: true,
  humOut: true,
  pressIn: true,
  pressOut: true,
};

function loadWeatherHistory() {
  try {
    const raw = localStorage.getItem("weatherHistory");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const cutoff = Date.now() - weatherState.maxAgeMs;
    weatherState.history = parsed
      .filter((entry) => Number.isFinite(entry?.timestamp) && entry.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-weatherState.historyCap);
    saveWeatherHistory();
  } catch (_) {
    /* ignore */
  }
}

function saveWeatherHistory() {
  try {
    localStorage.setItem("weatherHistory", JSON.stringify(weatherState.history));
  } catch (_) {
    /* ignore */
  }
}

function historyWindow(hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return weatherState.history.filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp >= cutoff);
}

function loadChartVisibility() {
  try {
    const raw = localStorage.getItem("chartVisibility");
    if (raw) {
      const stored = JSON.parse(raw);
      Object.assign(chartVisibility, stored);
    }
  } catch (_) {
    /* ignore */
  }
}

function saveChartVisibility() {
  try {
    localStorage.setItem("chartVisibility", JSON.stringify(chartVisibility));
  } catch (_) {
    /* ignore */
  }
}

function loadClockConfig() {
  const defaults = {
    enabled: true,
    timezoneMode: "location",
    manualTimezone: "",
    format: "24h",
    fontFamily: "inherit",
    showSeconds: true,
    showMillis: false,
    showDate: true,
    showTimezone: true,
    ntpPools: "pool.ntp.org",
    syncIntervalMin: 60,
  };
  try {
    const raw = localStorage.getItem("clockConfig");
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (_) {
    return { ...defaults };
  }
}

function saveClockConfig(cfg) {
  try {
    localStorage.setItem("clockConfig", JSON.stringify(cfg));
  } catch (_) {
    /* ignore */
  }
}

const tooltipState = {
  hideTimer: null,
};

let historyTooltipsAttached = false;

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

function showBanner(element, message, type = "info") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("error", "success");
  if (type === "error") {
    element.classList.add("error");
  } else if (type === "success") {
    element.classList.add("success");
  }
  element.hidden = false;
}

function hideBanner(element) {
  if (!element) return;
  element.hidden = true;
  element.textContent = "";
  element.classList.remove("error", "success");
}

function clearWeatherTimer() {
  if (weatherState.timer) {
    clearTimeout(weatherState.timer);
    weatherState.timer = 0;
  }
}

function clearResourceTimer() {
  if (resourceState.timer) {
    clearTimeout(resourceState.timer);
    resourceState.timer = 0;
  }
}

function setSensorState(element, available, ok) {
  if (!element) return;
  element.classList.remove("online", "offline");
  if (!available) {
    element.textContent = "Missing";
    element.classList.add("offline");
    return;
  }
  if (ok) {
    element.textContent = "Online";
    element.classList.add("online");
  } else {
    element.textContent = "Error";
    element.classList.add("offline");
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatMetric(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[idx]}`;
}

function formatUptime(ms) {
  if (!Number.isFinite(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatRelativeTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "—";
  }
  const diff = Date.now() - timestamp;
  if (diff < 2000) return "just now";
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatShortTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function resolveCondition(code) {
  const n = toNumber(code);
  const mapping = [
    { codes: [0], key: "sunny", label: "Clear sky" },
    { codes: [1, 2], key: "partly", label: "Partly cloudy" },
    { codes: [3], key: "cloudy", label: "Overcast" },
    { codes: [45, 48], key: "mist", label: "Foggy" },
    { codes: [51, 53, 55, 56, 57], key: "drizzle", label: "Drizzle" },
    { codes: [61, 63, 65, 80, 81, 82], key: "rain", label: "Rain showers" },
    { codes: [66, 67], key: "icy", label: "Freezing rain" },
    { codes: [71, 73, 75, 77, 85, 86], key: "snow", label: "Snow" },
    { codes: [95], key: "storm", label: "Thunderstorm" },
    { codes: [96, 99], key: "storm-rain", label: "Storm with hail" },
  ];
  const match = mapping.find((m) => m.codes.includes(n));
  if (match) return { key: match.key, label: match.label, code: n };
  return { key: "unknown", label: "Outdoor status", code: Number.isFinite(n) ? n : null };
}

function buildWeatherIcon(kind = "unknown") {
  const k = kind || "unknown";
  const gradients = `
    <defs>
      <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fde047" />
        <stop offset="100%" stop-color="#f97316" />
      </linearGradient>
      <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#cbd5e1" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#94a3b8" stop-opacity="0.9" />
      </linearGradient>
      <linearGradient id="rainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#60a5fa" />
        <stop offset="100%" stop-color="#22d3ee" />
      </linearGradient>
      <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#facc15" />
        <stop offset="100%" stop-color="#f97316" />
      </linearGradient>
      <linearGradient id="mistGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#cbd5e1" />
        <stop offset="100%" stop-color="#94a3b8" />
      </linearGradient>
    </defs>
  `;

  const sun = `
    <g>
      <circle class="wx-sun-core" cx="30" cy="30" r="12" />
      <g class="wx-sun-rays">
        <line x1="30" y1="7" x2="30" y2="18" />
        <line x1="30" y1="42" x2="30" y2="53" />
        <line x1="7" y1="30" x2="18" y2="30" />
        <line x1="42" y1="30" x2="53" y2="30" />
        <line x1="14" y1="14" x2="21" y2="21" />
        <line x1="39" y1="39" x2="46" y2="46" />
        <line x1="14" y1="46" x2="21" y2="39" />
        <line x1="39" y1="21" x2="46" y2="14" />
      </g>
    </g>
  `;

  const cloudBack = '<path class="wx-cloud wx-cloud-back" d="M18 36c-5.5 0-10 3.8-10 8.8C8 49.7 12.5 54 18 54h29c6.2 0 11.2-4.3 11.2-9.2 0-4.5-4.4-8.3-9.8-9-1.3-7-6.9-12-13.7-12-6.6 0-11.9 4.4-13.4 10.2-0.9-0.2-1.7-0.2-2.3-0.2Z" />';
  const cloudFront = '<path class="wx-cloud" d="M22 40c-4.8 0-8.6 3.4-8.6 7.8 0 4.4 3.8 8 8.6 8h22.5c5.1 0 9.1-3.6 9.1-8 0-3.8-3.7-7-8.4-7.8-1.1-5.6-5.5-9.6-10.9-9.6-5.2 0-9.5 3.5-10.7 8.4-0.7-0.2-1.4-0.3-2-0.3Z" />';

  const drops = `
    <g transform="translate(10,44)">
      <path class="wx-raindrop" d="M8 0c-3 4-4 7-4 9.5C4 13 6.5 15 8.5 15 10.8 15 13 12.8 13 9.8 13 6.8 11 4 8 0Z" />
      <path class="wx-raindrop" d="M22 2c-2.6 3.4-3.6 6-3.6 8.2 0 2.5 1.8 4.4 3.8 4.4 2.2 0 4.2-1.9 4.2-4.5 0-2.5-1.5-5.1-4.4-8.1Z" />
      <path class="wx-raindrop" d="M36 -1c-2.8 3.6-3.8 6.3-3.8 8.7C32.2 10.8 34 13 36 13c2.3 0 4.2-2.2 4.2-4.8 0-2.6-1.4-5.4-4.2-9.2Z" />
    </g>
  `;

  const snow = `
    <g transform="translate(12,44)">
      <circle class="wx-snow" cx="8" cy="8" r="3" />
      <circle class="wx-snow" cx="22" cy="10" r="3" />
      <circle class="wx-snow" cx="36" cy="8" r="3" />
    </g>
  `;

  const mist = `
    <g transform="translate(10,42)">
      <line class="wx-mist-line" x1="0" y1="0" x2="44" y2="0" />
      <line class="wx-mist-line" x1="4" y1="10" x2="48" y2="10" />
      <line class="wx-mist-line" x1="2" y1="20" x2="42" y2="20" />
    </g>
  `;

  const bolt = '<path class="wx-bolt" d="M34 28h8l-7 12h7l-16 18 5-13h-8l7-17Z" />';

  const iconByKind = {
    sunny: `${sun}`,
    partly: `${sun}${cloudFront}`,
    cloudy: `${cloudBack}${cloudFront}`,
    drizzle: `${cloudBack}${cloudFront}${drops}`,
    rain: `${cloudBack}${cloudFront}${drops}`,
    icy: `${cloudBack}${cloudFront}${drops}`,
    snow: `${cloudBack}${cloudFront}${snow}`,
    mist: `${cloudBack}${cloudFront}${mist}`,
    storm: `${cloudBack}${cloudFront}${bolt}`,
    "storm-rain": `${cloudBack}${cloudFront}${bolt}${drops}`,
    unknown: `${cloudBack}${cloudFront}`,
  };

  const body = iconByKind[k] || iconByKind.unknown;
  return `<div class="wx-icon wx-${k}"><svg viewBox="0 0 64 64" role="presentation" aria-hidden="true">${gradients}${body}</svg></div>`;
}

function debounce(fn, delay = 250) {
  let t = 0;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function loadOutdoorConfig() {
  try {
    const raw = localStorage.getItem("outdoorConfig");
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  return {
    provider: "open-meteo",
    mode: "city",
    country: "USA",
    city: "New York",
    lat: 40.7128,
    lon: -74.0060,
  };
}

function saveOutdoorConfig(cfg) {
  try {
    localStorage.setItem("outdoorConfig", JSON.stringify(cfg));
  } catch (_) {
    /* ignore */
  }
  try {
    fetchJSON("/api/outdoor/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        lat: cfg.lat,
        lon: cfg.lon,
        city: cfg.city,
        country: cfg.country,
        timezone: cfg.timezone,
      }),
    });
  } catch (_) {
    /* non-blocking */
  }
}

function updateLocationSummary() {
  const el = selectors.locationSummary();
  if (!el) return;
  const cfg = outdoorState.config;
  if (!cfg) {
    el.textContent = "Location: not set";
    return;
  }
  const label = formatLocationLabel(outdoorState.selection || cfg) || "?";
  el.textContent = `Location: ${label}`;
}

function formatLocationLabel(loc) {
  const parts = [loc?.name || loc?.city, loc?.admin1, loc?.country].filter(Boolean);
  return parts.join(", ");
}

function setSearchStatus(message) {
  const status = selectors.searchStatus();
  if (status) status.textContent = message;
}

function setSelection(loc) {
  outdoorState.selection = loc;
  const input = selectors.searchInput();
  if (input) input.value = formatLocationLabel(loc);
  setSearchStatus(`Selected: ${formatLocationLabel(loc)} (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)})`);
  if ((clockState.config || loadClockConfig()).timezoneMode === "location") {
    startClockLoop();
  }
}

function renderOutdoorCondition(metrics) {
  const iconEl = selectors.outdoorConditionIcon();
  const conditionKey = metrics?.conditionKey || "unknown";
  if (iconEl) iconEl.innerHTML = buildWeatherIcon(conditionKey);
}

function resolveActiveTimezone() {
  const cfg = clockState.config || loadClockConfig();
  if (cfg.timezoneMode === "manual" && cfg.manualTimezone) return cfg.manualTimezone;
  const sel = outdoorState.selection || outdoorState.config;
  if (cfg.timezoneMode === "location" && sel?.timezone) return sel.timezone;
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return browserTz || "UTC";
}

function renderClock() {
  const banner = selectors.clockBanner();
  if (!banner) return;
  const cfg = clockState.config || loadClockConfig();
  if (!cfg.enabled) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;

  const timeEl = selectors.clockTime();
  const msEl = selectors.clockMs();
  const dateEl = selectors.clockDate();
  const zoneEl = selectors.clockZone();
  const tz = resolveActiveTimezone();
  const now = new Date();
  const fontFamily = cfg.fontFamily && cfg.fontFamily !== "inherit" ? cfg.fontFamily : "";
  if (fontFamily) {
    banner.style.setProperty("--clock-font", fontFamily);
  } else {
    banner.style.removeProperty("--clock-font");
  }
  const formatOpts = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: cfg.format === "12h",
    timeZone: tz,
  };
  if (cfg.showSeconds) formatOpts.second = "2-digit";
  let timeString = new Intl.DateTimeFormat("en-US", formatOpts).format(now);
  // Only animate if seconds are shown and colon is present
  if (cfg.showSeconds && timeString.includes(":")) {
    // Find the first colon and wrap it in a span
    const colonIdx = timeString.indexOf(":");
    const before = timeString.slice(0, colonIdx);
    const after = timeString.slice(colonIdx + 1);
    // If there is a second colon (for HH:MM:SS), wrap both
    let html;
    if (after.includes(":")) {
      const secondColonIdx = after.indexOf(":");
      html = `${before}<span id="clock-colon">:</span>${after.slice(0, secondColonIdx)}<span id="clock-colon2">:</span>${after.slice(secondColonIdx + 1)}`;
    } else {
      html = `${before}<span id="clock-colon">:</span>${after}`;
    }
    if (timeEl) timeEl.innerHTML = html;
  } else {
    if (timeEl) timeEl.textContent = timeString;
  }

  if (msEl) {
    if (cfg.showMillis) {
      const ms = String(now.getMilliseconds()).padStart(3, "0");
      msEl.textContent = `.${ms}`;
      msEl.hidden = false;
    } else {
      msEl.hidden = true;
    }
  }
  if (dateEl) {
    if (cfg.showDate) {
      dateEl.textContent = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: tz,
      }).format(now);
      dateEl.hidden = false;
    } else {
      dateEl.hidden = true;
    }
  }

  if (zoneEl) {
    zoneEl.textContent = cfg.showTimezone ? tz : "";
    zoneEl.hidden = !cfg.showTimezone;
  }
}

function stopClockLoop() {
  if (clockState.timer) {
    clearInterval(clockState.timer);
    clockState.timer = 0;
  }
}

function startClockLoop() {
  stopClockLoop();
  clockState.config = clockState.config || loadClockConfig();
  renderClock();
  // Start colon animation if seconds are shown
  if (clockState.config.showSeconds) {
    animateColonPulse();
  }
  const interval = clockState.config.showMillis ? 120 : 1000;
  clockState.timer = window.setInterval(() => {
    renderClock();
    if (clockState.config.showSeconds) animateColonPulse();
  }, interval);
}

// Animate the colon(s) in the clock with a smooth sinusoidal pulse
function animateColonPulse() {
  const colon = document.getElementById("clock-colon");
  const colon2 = document.getElementById("clock-colon2");
  if (!colon) return;
  function update() {
    const now = performance.now();
    // 1 Hz pulse, phase 0 at second start
    const ms = now % 1000;
    const phase = ms / 1000;
    // Sine wave: 0.5 + 0.5*sin(2π*phase - π/2)
    const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase - Math.PI / 2);
    const min = 0.25, max = 1.0;
    const opacity = min + (max - min) * pulse;
    colon.style.opacity = opacity;
    if (colon2) colon2.style.opacity = opacity;
    colon._pulseAnim = requestAnimationFrame(update);
  }
  if (colon._pulseAnim) cancelAnimationFrame(colon._pulseAnim);
  update();
}

function updateForecastCards() {
  forecastState.horizons.forEach((h) => {
    const tempEl = selectors.forecastValue("temp", h);
    const humEl = selectors.forecastValue("hum", h);
    const presEl = selectors.forecastValue("pres", h);
    const iconEl = selectors.forecastIcon(h);
    const data = forecastState.data[h];
    const temp = data ? formatMetric(toNumber(data.temp), 1) : "—";
    const hum = data ? formatMetric(toNumber(data.humidity), 0) : "—";
    const pres = data ? formatMetric(toNumber(data.pressureMmHg), 0) : "—";
    const conditionKey = data?.conditionKey || "unknown";
    if (tempEl) tempEl.textContent = `${temp}°C`;
    if (humEl) humEl.textContent = `${hum}%`;
    if (presEl) presEl.textContent = `${pres} mmHg`;
    if (iconEl) {
      iconEl.innerHTML = buildWeatherIcon(conditionKey);
      iconEl.dataset.kind = conditionKey;
      iconEl.setAttribute("aria-label", conditionKey);
    }
  });

  const updatedEl = selectors.forecastUpdated();
  if (updatedEl) {
    updatedEl.textContent = forecastState.lastFetch
      ? `Updated ${formatShortTime(forecastState.lastFetch)}`
      : "Awaiting forecast…";
  }
}

async function fetchForecast(cfg) {
  if (!cfg || cfg.provider !== "open-meteo" || !Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) return;
  const locationChanged = !forecastState.lastLocation
    || forecastState.lastLocation.lat !== cfg.lat
    || forecastState.lastLocation.lon !== cfg.lon;
  if (locationChanged) {
    forecastState.lastFetch = 0;
    forecastState.data = {};
    forecastState.lastLocation = { lat: cfg.lat, lon: cfg.lon };
    updateForecastCards();
  }
  const now = Date.now();
  if (forecastState.lastFetch && now - forecastState.lastFetch < 10 * 60 * 1000) {
    return; // cache for 10 minutes
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.lat}&longitude=${cfg.lon}&hourly=temperature_2m,relative_humidity_2m,pressure_msl,weathercode&timezone=auto`;
  const data = await fetchJSON(url);
  const times = data?.hourly?.time || [];
  const temps = data?.hourly?.temperature_2m || [];
  const hums = data?.hourly?.relative_humidity_2m || [];
  const presses = data?.hourly?.pressure_msl || [];
  const codes = data?.hourly?.weathercode || [];
  const targets = forecastState.horizons.map((h) => now + h * 60 * 60 * 1000);

  const parsed = {};
  targets.forEach((target, idx) => {
    let bestIdx = -1;
    for (let i = 0; i < times.length; i += 1) {
      const ts = Date.parse(times[i]);
      if (!Number.isFinite(ts)) continue;
      if (ts >= target) {
        bestIdx = i;
        break;
      }
    }
    const horizon = forecastState.horizons[idx];
    if (bestIdx >= 0) {
      const condition = resolveCondition(codes[bestIdx]);
      parsed[horizon] = {
        temp: temps[bestIdx],
        humidity: hums[bestIdx],
        pressureHpa: presses[bestIdx],
        pressureMmHg: Number.isFinite(presses[bestIdx]) ? presses[bestIdx] / 1.33322 : NaN,
        conditionKey: condition.key,
        conditionLabel: condition.label,
        conditionCode: condition.code,
      };
    } else {
      parsed[horizon] = null;
    }
  });

  forecastState.data = parsed;
  forecastState.lastFetch = now;
  forecastState.lastLocation = { lat: cfg.lat, lon: cfg.lon };
  updateForecastCards();
}

function renderSearchResults(results) {
  const container = selectors.searchResults();
  if (!container) return;
  outdoorState.searchResults = results || [];
  if (!results.length) {
    container.innerHTML = "";
    setSearchStatus("No matches. Try a different name.");
    return;
  }
  container.innerHTML = results
    .map((loc, idx) => {
      const label = formatLocationLabel(loc);
      const coords = Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
        ? `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`
        : "";
      return `<button type="button" class="search-result" data-idx="${idx}"><span>${label}</span><small>${coords}</small></button>`;
    })
    .join("");

  container.querySelectorAll("button.search-result").forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const loc = results[idx];
      if (loc) {
        setSelection(loc);
        container.innerHTML = "";
      }
    });
  });
}

async function queryLocations(query) {
  if (!query || query.trim().length < 2) {
    return [];
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=10&language=en&format=json`;
  const data = await fetchJSON(url);
  const results = data?.results || [];
  return results
    .map((r) => ({
      name: r.name,
      country: r.country,
      admin1: r.admin1 || r.admin2 || "",
      lat: toNumber(r.latitude),
      lon: toNumber(r.longitude),
      timezone: r.timezone || r.timezone_abbreviation || "",
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

function clearSearchResults() {
  const container = selectors.searchResults();
  if (container) container.innerHTML = "";
  outdoorState.searchResults = [];
}

function applyConfigToForm(cfg) {
  const provider = selectors.providerSelect();
  const cityWrap = selectors.citySelectors();
  const searchInput = selectors.searchInput();
  if (provider) provider.value = cfg.provider || "open-meteo";
  if (cityWrap) cityWrap.hidden = false;

  if (Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon)) {
    const loc = {
      name: cfg.city || cfg.name || "",
      country: cfg.country || "",
      admin1: cfg.admin1 || "",
      lat: cfg.lat,
      lon: cfg.lon,
      timezone: cfg.timezone,
    };
    outdoorState.selection = loc;
    if (searchInput) searchInput.value = formatLocationLabel(loc);
    setSearchStatus(`Selected: ${formatLocationLabel(loc)} (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)})`);
  } else {
    outdoorState.selection = null;
    if (searchInput) searchInput.value = "";
    setSearchStatus("Type 2+ letters to search.");
  }
}

function applyClockConfigToForm(cfg) {
  selectors.clockEnable()?.setAttribute("aria-checked", cfg.enabled ? "true" : "false");
  const enable = selectors.clockEnable();
  if (enable) enable.checked = Boolean(cfg.enabled);
  const mode = selectors.clockTimezoneMode();
  if (mode) mode.value = cfg.timezoneMode || "location";
  const manual = selectors.clockTimezoneManual();
  if (manual) manual.value = cfg.manualTimezone || "";
  const formatSel = selectors.clockFormatSelect();
  if (formatSel) formatSel.value = cfg.format || "24h";
  const fontSel = selectors.clockFontSelect();
  if (fontSel) fontSel.value = cfg.fontFamily || "inherit";
  const sec = selectors.clockShowSeconds();
  if (sec) sec.checked = Boolean(cfg.showSeconds);
  const ms = selectors.clockShowMillis();
  if (ms) ms.checked = Boolean(cfg.showMillis);
  const date = selectors.clockShowDate();
  if (date) date.checked = Boolean(cfg.showDate);
  const tz = selectors.clockShowTimezone();
  if (tz) tz.checked = Boolean(cfg.showTimezone);
  const pools = selectors.clockNtpPools();
  if (pools) pools.value = cfg.ntpPools || "";
  const sync = selectors.clockSyncInterval();
  if (sync) sync.value = cfg.syncIntervalMin || 60;
}

function readClockConfigFromForm() {
  const cfg = clockState.config || loadClockConfig();
  const enable = selectors.clockEnable();
  cfg.enabled = enable ? enable.checked : cfg.enabled;
  const mode = selectors.clockTimezoneMode();
  cfg.timezoneMode = mode ? mode.value : cfg.timezoneMode;
  const manual = selectors.clockTimezoneManual();
  cfg.manualTimezone = manual ? manual.value.trim() : cfg.manualTimezone;
  const formatSel = selectors.clockFormatSelect();
  cfg.format = formatSel ? formatSel.value : cfg.format;
  const fontSel = selectors.clockFontSelect();
  cfg.fontFamily = fontSel ? fontSel.value : cfg.fontFamily;
  const sec = selectors.clockShowSeconds();
  cfg.showSeconds = sec ? sec.checked : cfg.showSeconds;
  const ms = selectors.clockShowMillis();
  cfg.showMillis = ms ? ms.checked : cfg.showMillis;
  const date = selectors.clockShowDate();
  cfg.showDate = date ? date.checked : cfg.showDate;
  const tz = selectors.clockShowTimezone();
  cfg.showTimezone = tz ? tz.checked : cfg.showTimezone;
  const pools = selectors.clockNtpPools();
  cfg.ntpPools = pools ? pools.value.trim() : cfg.ntpPools;
  const sync = selectors.clockSyncInterval();
  cfg.syncIntervalMin = sync ? Number(sync.value) || cfg.syncIntervalMin : cfg.syncIntervalMin;
  return cfg;
}

function readConfigFromForm() {
  const provider = selectors.providerSelect()?.value || "open-meteo";
  const cfg = { provider, mode: "city" };
  const sel = outdoorState.selection;
  if (sel) {
    cfg.country = sel.country;
    cfg.city = sel.name;
    cfg.admin1 = sel.admin1;
    cfg.lat = sel.lat;
    cfg.lon = sel.lon;
    cfg.timezone = sel.timezone;
  }
  return cfg;
}

function closeModal() {
  const modal = selectors.modal();
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function openModal() {
  const modal = selectors.modal();
  if (modal) modal.hidden = false;
  document.body.classList.add('modal-open');
}

function ensureGeolocation(cfg) {
  return new Promise((resolve) => {
    if (cfg.mode !== "auto") {
      resolve(cfg);
      return;
    }
    if (!navigator.geolocation) {
      resolve(cfg);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cfg.lat = pos.coords.latitude;
        cfg.lon = pos.coords.longitude;
        resolve(cfg);
      },
      () => resolve(cfg),
      { enableHighAccuracy: false, timeout: 4000 }
    );
  });
}

function updateWeatherTiles(payload) {
  const metrics = payload?.metrics || {};
  const sensors = payload?.sensors || {};
  const out = outdoorState.metrics || {};

  const tempC = toNumber(metrics.temperatureC);
  const tempF = toNumber(metrics.temperatureF);
  const dewPointC = toNumber(metrics.dewPointC);
  const humidity = toNumber(metrics.humidity);
  const pressureHpa = toNumber(metrics.pressureHpa);
  const pressureMmHg = toNumber(metrics.pressureMmHg);
  const altitudeM = toNumber(metrics.altitudeM);
  const altitudeFt = toNumber(metrics.altitudeFt);

  const outTempC = toNumber(out.temperatureC);
  const outTempF = Number.isFinite(outTempC) ? outTempC * 9.0 / 5.0 + 32.0 : NaN;
  const outHumidity = toNumber(out.humidity);
  const outPressureHpa = toNumber(out.pressureHpa);
  const outPressureMmHg = Number.isFinite(outPressureHpa) ? outPressureHpa / 1.33322 : NaN;
  const outAltitudeM = toNumber(out.altitudeM);
  const outAltitudeFt = Number.isFinite(outAltitudeM) ? outAltitudeM * 3.28084 : NaN;
  const outWindSpeed = toNumber(out.windSpeed);

  const tempInEl = selectors.weatherTempIndoor();
  if (tempInEl) tempInEl.textContent = formatMetric(tempC);
  const tempInFEl = selectors.weatherTempFIndoor();
  if (tempInFEl) tempInFEl.textContent = `${formatMetric(tempF)} °F`;
  const tempOutEl = selectors.weatherTempOutdoor();
  if (tempOutEl) tempOutEl.textContent = formatMetric(outTempC);
  const tempOutFEl = selectors.weatherTempFOutdoor();
  if (tempOutFEl) tempOutFEl.textContent = `${formatMetric(outTempF)} °F`;

  const dewEl = selectors.weatherDewPoint();
  if (dewEl) dewEl.textContent = formatMetric(dewPointC);

  const humidityInEl = selectors.weatherHumidityIndoor();
  if (humidityInEl) humidityInEl.textContent = formatMetric(humidity);
  const humidityOutEl = selectors.weatherHumidityOutdoor();
  if (humidityOutEl) humidityOutEl.textContent = formatMetric(outHumidity);

  const windOutEl = selectors.weatherWindOutdoor();
  if (windOutEl) windOutEl.textContent = formatMetric(outWindSpeed);

  const pressureInEl = selectors.weatherPressureIndoor();
  if (pressureInEl) pressureInEl.textContent = formatMetric(pressureMmHg);
  const pressureInHpaEl = selectors.weatherPressureHpaIndoor();
  if (pressureInHpaEl) pressureInHpaEl.textContent = `${formatMetric(pressureHpa)} hPa`;
  const pressureOutEl = selectors.weatherPressureOutdoor();
  if (pressureOutEl) pressureOutEl.textContent = formatMetric(outPressureMmHg);
  const pressureOutHpaEl = selectors.weatherPressureHpaOutdoor();
  if (pressureOutHpaEl) pressureOutHpaEl.textContent = `${formatMetric(outPressureHpa)} hPa`;

  const altitudeInEl = selectors.weatherAltitudeIndoor();
  if (altitudeInEl) altitudeInEl.textContent = formatMetric(altitudeM, 0);
  const altitudeInFtEl = selectors.weatherAltitudeFtIndoor();
  if (altitudeInFtEl) altitudeInFtEl.textContent = `${formatMetric(altitudeFt, 0)} ft`;
  const altitudeOutEl = selectors.weatherAltitudeOutdoor();
  if (altitudeOutEl) altitudeOutEl.textContent = formatMetric(outAltitudeM, 0);
  const altitudeOutFtEl = selectors.weatherAltitudeFtOutdoor();
  if (altitudeOutFtEl) altitudeOutFtEl.textContent = `${formatMetric(outAltitudeFt, 0)} ft`;

  const updatedEl = selectors.weatherUpdated();
  if (updatedEl) updatedEl.textContent = formatRelativeTime(weatherState.lastFetch);

  const shtStatus = selectors.sensorSht31Status();
  const bmpStatus = selectors.sensorBmp580Status();
  const shtInfo = sensors?.sht31 || {};
  const bmpInfo = sensors?.bmp580 || {};
  setSensorState(shtStatus, Boolean(shtInfo.present), Boolean(shtInfo.ok));
  setSensorState(bmpStatus, Boolean(bmpInfo.present), Boolean(bmpInfo.ok));

  renderOutdoorCondition(outdoorState.metrics);
}

function pushWeatherHistory(payload, timestamp) {
  const metrics = payload?.metrics || {};
  const out = outdoorState.metrics || {};
  const entry = {
    timestamp,
    temperatureC: toNumber(metrics.temperatureC),
    humidity: toNumber(metrics.humidity),
    pressureHpa: toNumber(metrics.pressureHpa),
    pressureMmHg: toNumber(metrics.pressureMmHg),
    temperatureOutC: toNumber(out.temperatureC),
    humidityOut: toNumber(out.humidity),
    pressureOutHpa: toNumber(out.pressureHpa),
    pressureOutMmHg: Number.isFinite(out.pressureHpa) ? out.pressureHpa / 1.33322 : NaN,
  };
  weatherState.history.push(entry);
  const cutoff = timestamp - weatherState.maxAgeMs;
  while (weatherState.history.length && weatherState.history[0].timestamp < cutoff) {
    weatherState.history.shift();
  }
  if (weatherState.history.length > weatherState.historyCap) {
    weatherState.history = weatherState.history.slice(-weatherState.historyCap);
  }
  saveWeatherHistory();
}

function renderWeatherChart(options = {}) {
  const {
    canvas = selectors.weatherChart(),
    history = historyWindow(24),
    metaKey = "weatherMain",
    emptyLabel = "Collecting 24-hour history…",
  } = options;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  const normalizedHistory = history.length === 1
    ? [...history, { ...history[0], timestamp: history[0].timestamp + 60 * 1000 }]
    : history;

  if (!normalizedHistory.length) {
    chartMeta[metaKey] = null;
    ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
    ctx.font = `${14 * dpr}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emptyLabel, width / 2, height / 2);
    return;
  }

  const margin = {
    top: 24 * dpr,
    right: 32 * dpr,
    bottom: 40 * dpr,
    left: 60 * dpr,
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  if (chartWidth <= 0 || chartHeight <= 0) return;

  const tempsIn = chartVisibility.tempIn ? normalizedHistory.filter((entry) => Number.isFinite(entry.temperatureC)) : [];
  const tempsOut = chartVisibility.tempOut ? normalizedHistory.filter((entry) => Number.isFinite(entry.temperatureOutC)) : [];
  const humsIn = chartVisibility.humIn ? normalizedHistory.filter((entry) => Number.isFinite(entry.humidity)) : [];
  const humsOut = chartVisibility.humOut ? normalizedHistory.filter((entry) => Number.isFinite(entry.humidityOut)) : [];

  const hasTempIn = chartVisibility.tempIn && tempsIn.length >= 2;
  const hasTempOut = chartVisibility.tempOut && tempsOut.length >= 2;
  const hasHumIn = chartVisibility.humIn && humsIn.length >= 2;
  const hasHumOut = chartVisibility.humOut && humsOut.length >= 2;
  const hasTempSeries = hasTempIn || hasTempOut;
  const hasHumSeries = hasHumIn || hasHumOut;

  if (!hasTempSeries && !hasHumSeries) {
    chartMeta[metaKey] = null;
    ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
    ctx.font = `${14 * dpr}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Enable a series to view chart…", width / 2, height / 2);
    return;
  }

  const tempValues = [...tempsIn.map((e) => e.temperatureC), ...tempsOut.map((e) => e.temperatureOutC)].filter((v) => Number.isFinite(v));
  const tempMin = tempValues.length ? Math.min(...tempValues) : 0;
  const tempMax = tempValues.length ? Math.max(...tempValues) : 1;
  const tempRange = tempMax - tempMin || 1;

  const humValues = [...humsIn.map((e) => e.humidity), ...humsOut.map((e) => e.humidityOut)].filter((v) => Number.isFinite(v));
  const humMin = humValues.length ? Math.min(...humValues, 0) : 0;
  const humMax = humValues.length ? Math.max(...humValues, 100) : 100;
  const humRange = humMax - humMin || 1;

  const firstTs = normalizedHistory[0].timestamp;
  const lastTs = normalizedHistory[normalizedHistory.length - 1].timestamp;
  const domain = Math.max(1, lastTs - firstTs);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1 * dpr;
  ctx.font = `${12 * dpr}px "Segoe UI", sans-serif`;
  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const y = margin.top + chartHeight * ratio;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartWidth, y);
    ctx.stroke();

    const tempValue = tempMax - tempRange * ratio;
    ctx.textAlign = "right";
    ctx.fillText(`${tempValue.toFixed(1)}°C`, margin.left - 12 * dpr, y);
  }

  ctx.textAlign = "left";

  const projectX = (ts) => margin.left + ((ts - firstTs) / domain) * chartWidth;
  const projectTempY = (value) => margin.top + (1 - (value - tempMin) / tempRange) * chartHeight;
  const projectHumY = (value) => margin.top + (1 - (value - humMin) / humRange) * chartHeight;

  const colors = {
    tempIn: "rgba(249, 115, 22, 0.9)",
    tempOut: "rgba(52, 211, 153, 0.9)",
    humIn: "rgba(99, 102, 241, 0.9)",
    humOut: "rgba(6, 182, 212, 0.9)",
  };

  const drawSeries = (entries, accessor, yProject, strokeStyle, dashed = false) => {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2 * dpr;
    if (dashed) {
      ctx.setLineDash([6 * dpr, 4 * dpr]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    let started = false;
    entries.forEach((entry) => {
      const v = accessor(entry);
      if (!Number.isFinite(v)) return;
      const x = projectX(entry.timestamp);
      const y = yProject(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    if (started) ctx.stroke();
  };

  if (chartVisibility.tempIn) drawSeries(normalizedHistory, (e) => e.temperatureC, projectTempY, colors.tempIn, false);
  if (chartVisibility.tempOut) drawSeries(normalizedHistory, (e) => e.temperatureOutC, projectTempY, colors.tempOut, true);
  if (chartVisibility.humIn) drawSeries(normalizedHistory, (e) => e.humidity, projectHumY, colors.humIn, false);
  if (chartVisibility.humOut) drawSeries(normalizedHistory, (e) => e.humidityOut, projectHumY, colors.humOut, true);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  const tickCount = Math.min(3, normalizedHistory.length);
  const includeSeconds = domain < 6 * 60 * 60 * 1000;
  const labelOptions = includeSeconds
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" };
  for (let i = 0; i < tickCount; i += 1) {
    const ratio = i / Math.max(1, tickCount - 1);
    const ts = firstTs + ratio * domain;
    const x = projectX(ts);
    const label = new Date(ts).toLocaleTimeString([], labelOptions);
    ctx.fillText(label, x, height - margin.bottom + 10 * dpr);
  }

  chartMeta[metaKey] = {
    firstTs,
    lastTs,
    margin,
    chartWidth,
    chartHeight,
    tempMin,
    tempRange,
    humMin,
    humRange,
    dpr,
    hasTempSeries,
    hasHumSeries,
    colors,
    width,
    height,
    history: normalizedHistory,
    canvas,
  };
}

function renderPressureChart(options = {}) {
  const {
    canvas = selectors.pressureChart(),
    history = historyWindow(24),
    metaKey = "pressureMain",
    emptyLabel = "Collecting pressure history…",
  } = options;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  const normalizedHistory = history.length === 1
    ? [...history, { ...history[0], timestamp: history[0].timestamp + 60 * 1000 }]
    : history;

  const seriesIn = normalizedHistory.filter((entry) => Number.isFinite(entry.pressureMmHg));
  const seriesOut = normalizedHistory.filter((entry) => Number.isFinite(entry.pressureOutMmHg));
  const hasIn = chartVisibility.pressIn && seriesIn.length >= 2;
  const hasOut = chartVisibility.pressOut && seriesOut.length >= 2;
  if (!hasIn && !hasOut) {
    chartMeta[metaKey] = null;
    ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
    ctx.font = `${14 * dpr}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emptyLabel, width / 2, height / 2);
    return;
  }

  const margin = {
    top: 24 * dpr,
    right: 40 * dpr,
    bottom: 36 * dpr,
    left: 68 * dpr,
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  if (chartWidth <= 0 || chartHeight <= 0) return;

  const values = [
    ...(chartVisibility.pressIn ? seriesIn.map((entry) => entry.pressureMmHg) : []),
    ...(chartVisibility.pressOut ? seriesOut.map((entry) => entry.pressureOutMmHg) : []),
  ].filter((v) => Number.isFinite(v));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max(0.5, (max - min) * 0.1);
  const rangeMin = min - pad;
  const rangeMax = max + pad;
  const range = rangeMax - rangeMin || 1;

  const firstTs = normalizedHistory[0].timestamp;
  const lastTs = normalizedHistory[normalizedHistory.length - 1].timestamp;
  const domain = Math.max(1, lastTs - firstTs);

  const projectX = (ts) => margin.left + ((ts - firstTs) / domain) * chartWidth;
  const projectY = (value) => margin.top + (1 - (value - rangeMin) / range) * chartHeight;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1 * dpr;
  ctx.font = `${12 * dpr}px "Segoe UI", sans-serif`;
  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const tickCount = 3;
  for (let i = 0; i < tickCount; i += 1) {
    const ratio = i / (tickCount - 1);
    const value = rangeMax - ratio * range;
    const y = projectY(value);
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartWidth, y);
    ctx.stroke();
    ctx.fillText(`${value.toFixed(1)} mmHg`, margin.left - 12 * dpr, y);
  }

  const colors = {
    pressureIn: "rgba(250, 204, 21, 0.9)",
    pressureOut: "rgba(56, 189, 248, 0.9)",
  };

  const drawSeries = (entries, accessor, strokeStyle, dashed = false) => {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2 * dpr;
    if (dashed) {
      ctx.setLineDash([6 * dpr, 4 * dpr]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    let started = false;
    entries.forEach((entry) => {
      const v = accessor(entry);
      if (!Number.isFinite(v)) return;
      const x = projectX(entry.timestamp);
      const y = projectY(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    if (started) ctx.stroke();
  };

  if (chartVisibility.pressIn) drawSeries(normalizedHistory, (e) => e.pressureMmHg, colors.pressureIn, false);
  if (chartVisibility.pressOut) drawSeries(normalizedHistory, (e) => e.pressureOutMmHg, colors.pressureOut, true);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  const includeSeconds = domain < 6 * 60 * 60 * 1000;
  const labelOptions = includeSeconds
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" };
  const maxTicks = Math.min(3, normalizedHistory.length);
  for (let i = 0; i < maxTicks; i += 1) {
    const ratio = i / Math.max(1, maxTicks - 1);
    const ts = firstTs + ratio * domain;
    const x = projectX(ts);
    const label = new Date(ts).toLocaleTimeString([], labelOptions);
    ctx.fillText(label, x, height - margin.bottom + 8 * dpr);
  }

  chartMeta[metaKey] = {
    firstTs,
    lastTs,
    margin,
    chartWidth,
    chartHeight,
    rangeMin,
    range,
    dpr,
    colors,
    width,
    height,
    history: normalizedHistory,
    canvas,
  };
}

function nearestHistoryEntry(ts, history, predicate) {
  let best = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const entry of history) {
    if (!predicate(entry)) continue;
    const delta = Math.abs(entry.timestamp - ts);
    if (delta < bestDelta) {
      best = entry;
      bestDelta = delta;
    }
  }
  return best;
}

function ensureTooltip(canvas) {
  if (!canvas) return null;
  const parent = canvas.parentElement;
  if (!parent) return null;
  let tip = parent.querySelector(".chart-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tooltip";
    parent.appendChild(tip);
  }
  return tip;
}

function positionTooltip(tip, rect, x, y) {
  const margin = 10;
  const left = Math.min(rect.width - tip.offsetWidth - margin, Math.max(margin, x + margin));
  const top = Math.min(rect.height - tip.offsetHeight - margin, Math.max(margin, y + margin));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showTooltip(tip) {
  if (!tip) return;
  tip.style.display = "block";
  requestAnimationFrame(() => {
    tip.style.opacity = "1";
  });
}

function hideTooltip(tip) {
  if (!tip) return;
  tip.style.opacity = "0";
  setTimeout(() => {
    tip.style.display = "none";
  }, 180);
}

function scheduleHideTooltip(tip) {
  if (tooltipState.hideTimer) {
    clearTimeout(tooltipState.hideTimer);
  }
  tooltipState.hideTimer = setTimeout(() => hideTooltip(tip), 3000);
}

function buildWeatherTooltip(event, metaKey) {
  const meta = chartMeta[metaKey];
  if (!meta || (!meta.hasTempSeries && !meta.hasHumSeries)) return;
  const canvas = meta.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const tip = ensureTooltip(canvas);
  if (!tip) return;

  const dpr = meta.dpr || 1;
  const xDraw = (event.clientX - rect.left) * dpr;
  const domain = Math.max(1, meta.lastTs - meta.firstTs);
  const xClamped = Math.min(Math.max(xDraw - meta.margin.left, 0), meta.chartWidth);
  const ts = meta.firstTs + (xClamped / Math.max(1, meta.chartWidth)) * domain;

  const entry = nearestHistoryEntry(ts, meta.history || [], (e) => (
    (chartVisibility.tempIn && Number.isFinite(e.temperatureC)) ||
    (chartVisibility.tempOut && Number.isFinite(e.temperatureOutC)) ||
    (chartVisibility.humIn && Number.isFinite(e.humidity)) ||
    (chartVisibility.humOut && Number.isFinite(e.humidityOut))
  ));
  if (!entry) return;

  const timeLabel = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = [`<div class="tip-time">${timeLabel}</div>`];
  if (chartVisibility.tempIn) {
    const label = Number.isFinite(entry.temperatureC) ? `${entry.temperatureC.toFixed(1)}°C` : "—";
    parts.push(`<div class="tip-value">Temp in: ${label}</div>`);
  }
  if (chartVisibility.tempOut) {
    const label = Number.isFinite(entry.temperatureOutC) ? `${entry.temperatureOutC.toFixed(1)}°C` : "—";
    parts.push(`<div class="tip-value">Temp out: ${label}</div>`);
  }
  if (chartVisibility.humIn) {
    const label = Number.isFinite(entry.humidity) ? `${entry.humidity.toFixed(1)}%` : "—";
    parts.push(`<div class="tip-value">Hum in: ${label}</div>`);
  }
  if (chartVisibility.humOut) {
    const label = Number.isFinite(entry.humidityOut) ? `${entry.humidityOut.toFixed(1)}%` : "—";
    parts.push(`<div class="tip-value">Hum out: ${label}</div>`);
  }
  tip.innerHTML = parts.join("");
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  positionTooltip(tip, rect, offsetX, offsetY);
  showTooltip(tip);
  scheduleHideTooltip(tip);
}

function buildPressureTooltip(event, metaKey) {
  const meta = chartMeta[metaKey];
  if (!meta) return;
  const canvas = meta.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const tip = ensureTooltip(canvas);
  if (!tip) return;

  const dpr = meta.dpr || 1;
  const xDraw = (event.clientX - rect.left) * dpr;
  const domain = Math.max(1, meta.lastTs - meta.firstTs);
  const xClamped = Math.min(Math.max(xDraw - meta.margin.left, 0), meta.chartWidth);
  const ts = meta.firstTs + (xClamped / Math.max(1, meta.chartWidth)) * domain;

  const entry = nearestHistoryEntry(ts, meta.history || [], (e) => (
    (chartVisibility.pressIn && Number.isFinite(e.pressureMmHg)) ||
    (chartVisibility.pressOut && Number.isFinite(e.pressureOutMmHg))
  ));
  if (!entry) return;

  const timeLabel = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = [`<div class="tip-time">${timeLabel}</div>`];
  if (chartVisibility.pressIn) {
    const mmHgInLabel = Number.isFinite(entry.pressureMmHg) ? `${entry.pressureMmHg.toFixed(1)} mmHg` : "—";
    const hpaInLabel = Number.isFinite(entry.pressureHpa) ? `${entry.pressureHpa.toFixed(1)} hPa` : "—";
    parts.push(`<div class="tip-value">Indoor: ${mmHgInLabel} (${hpaInLabel})</div>`);
  }
  if (chartVisibility.pressOut) {
    const mmHgOutLabel = Number.isFinite(entry.pressureOutMmHg) ? `${entry.pressureOutMmHg.toFixed(1)} mmHg` : "—";
    const hpaOutLabel = Number.isFinite(entry.pressureOutHpa) ? `${entry.pressureOutHpa.toFixed(1)} hPa` : "—";
    parts.push(`<div class="tip-value">Outdoor: ${mmHgOutLabel} (${hpaOutLabel})</div>`);
  }
  tip.innerHTML = parts.join("");
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  positionTooltip(tip, rect, offsetX, offsetY);
  showTooltip(tip);
  scheduleHideTooltip(tip);
}

function attachHistoryModalTooltips() {
  const weatherCanvas = selectors.historyTempChart();
  const pressureCanvas = selectors.historyPressureChart();
  if (weatherCanvas) {
    weatherCanvas.addEventListener("mousemove", (event) => buildWeatherTooltip(event, "weatherWeek"));
    weatherCanvas.addEventListener("mouseleave", () => {
      const tip = ensureTooltip(weatherCanvas);
      if (tip) hideTooltip(tip);
    });
    weatherCanvas.addEventListener("touchstart", (event) => {
      const touch = event.touches ? event.touches[0] : event;
      buildWeatherTooltip(touch, "weatherWeek");
    });
    weatherCanvas.addEventListener("touchmove", (event) => {
      const touch = event.touches ? event.touches[0] : event;
      buildWeatherTooltip(touch, "weatherWeek");
    });
    weatherCanvas.addEventListener("touchend", () => {
      const tip = ensureTooltip(weatherCanvas);
      if (tip) scheduleHideTooltip(tip);
    });
  }
  if (pressureCanvas) {
    pressureCanvas.addEventListener("mousemove", (event) => buildPressureTooltip(event, "pressureWeek"));
    pressureCanvas.addEventListener("mouseleave", () => {
      const tip = ensureTooltip(pressureCanvas);
      if (tip) hideTooltip(tip);
    });
    pressureCanvas.addEventListener("touchstart", (event) => {
      const touch = event.touches ? event.touches[0] : event;
      buildPressureTooltip(touch, "pressureWeek");
    });
    pressureCanvas.addEventListener("touchmove", (event) => {
      const touch = event.touches ? event.touches[0] : event;
      buildPressureTooltip(touch, "pressureWeek");
    });
    pressureCanvas.addEventListener("touchend", () => {
      const tip = ensureTooltip(pressureCanvas);
      if (tip) scheduleHideTooltip(tip);
    });
  }
}

function applyLegendVisibilityStyles() {
  const legends = document.querySelectorAll(".chart-legend .legend-item[data-series]");
  legends.forEach((item) => {
    const key = item.dataset.series;
    if (key && chartVisibility[key] === false) {
      item.classList.add("disabled");
    } else {
      item.classList.remove("disabled");
    }
  });
}

function attachLegendToggles() {
  const legends = document.querySelectorAll(".chart-legend .legend-item[data-series]");
  legends.forEach((item) => {
    item.addEventListener("click", () => {
      const key = item.dataset.series;
      if (!key) return;
      chartVisibility[key] = !chartVisibility[key];
      applyLegendVisibilityStyles();
      saveChartVisibility();
      renderCharts();
      const historyModal = selectors.historyModal();
      if (historyModal && !historyModal.hidden) {
        renderHistoryCharts();
      }
    });
  });
  applyLegendVisibilityStyles();
}

function renderCharts() {
  renderWeatherChart({ metaKey: "weatherMain" });
  renderPressureChart({ metaKey: "pressureMain" });
}

function renderHistoryCharts() {
  const weekHistory = historyWindow(24 * 7);
  renderWeatherChart({
    canvas: selectors.historyTempChart(),
    history: weekHistory,
    metaKey: "weatherWeek",
    emptyLabel: "Collecting 7-day history…",
  });
  renderPressureChart({
    canvas: selectors.historyPressureChart(),
    history: weekHistory,
    metaKey: "pressureWeek",
    emptyLabel: "Collecting 7-day pressure…",
  });
  if (!historyTooltipsAttached) {
    attachHistoryModalTooltips();
    historyTooltipsAttached = true;
  }
}

function openHistoryModal() {
  const modal = selectors.historyModal();
  if (!modal) return;
  modal.hidden = false;
  renderHistoryCharts();
}

function closeHistoryModal() {
  const modal = selectors.historyModal();
  if (!modal) return;
  modal.hidden = true;
}

async function fetchWeatherMetrics() {
  const statusEl = selectors.weatherStatus();
  try {
    const payload = await fetchJSON("/api/weather/metrics");
    const timestamp = Date.now();
    weatherState.lastFetch = timestamp;
    weatherState.lastPayload = payload || {};
    await fetchOutdoorWeather(true);
    updateWeatherTiles(weatherState.lastPayload);
    pushWeatherHistory(weatherState.lastPayload, timestamp);
    hideBanner(statusEl);
    renderCharts();
  } catch (error) {
    showBanner(statusEl, error.message || "Unable to read weather data", "error");
  }
}

async function fetchOutdoorWeather(force = false) {
  if (outdoorState.fetching) return;
  const cfg = outdoorState.config;
  if (!cfg || (!Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon))) return;
  if (!force && outdoorState.lastFetch && Date.now() - outdoorState.lastFetch < weatherState.intervalMs - 200) {
    return;
  }
  outdoorState.fetching = true;
  try {
    if (cfg.provider === "open-meteo") {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.lat}&longitude=${cfg.lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,apparent_temperature,weather_code,wind_speed_10m&windspeed_unit=ms&timezone=auto`;
      const data = await fetchJSON(url);
      const current = data?.current || {};
      const condition = resolveCondition(current.weather_code);
      const windSpeedMs = toNumber(current.wind_speed_10m);
      outdoorState.metrics = {
        temperatureC: toNumber(current.temperature_2m),
        humidity: toNumber(current.relative_humidity_2m),
        pressureHpa: toNumber(current.pressure_msl),
        pressureMmHg: Number.isFinite(current.pressure_msl) ? current.pressure_msl / 1.33322 : NaN,
        altitudeM: toNumber(data?.elevation),
        windSpeed: Number.isFinite(windSpeedMs) ? windSpeedMs : NaN,
        conditionKey: condition.key,
        conditionLabel: condition.label,
        conditionCode: condition.code,
      };
      await fetchForecast(cfg);
    } else if (cfg.provider === "metno") {
      const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${cfg.lat}&lon=${cfg.lon}`;
      const data = await fetchJSON(url);
      const instant = data?.properties?.timeseries?.[0]?.data?.instant?.details || {};
      outdoorState.metrics = {
        temperatureC: toNumber(instant.air_temperature),
        humidity: toNumber(instant.relative_humidity),
        pressureHpa: toNumber(instant.air_pressure_at_sea_level),
        pressureMmHg: Number.isFinite(instant.air_pressure_at_sea_level)
          ? instant.air_pressure_at_sea_level / 1.33322
          : NaN,
        altitudeM: NaN,
        windSpeed: toNumber(instant.wind_speed),
        conditionKey: "cloudy",
        conditionLabel: "Clouds",
        conditionCode: null,
      };
      // MET Norway: skip forecast to keep traffic low
    } else if (cfg.provider === "weatherapi") {
      // Placeholder: requires API key; we keep values unchanged.
      outdoorState.metrics = outdoorState.metrics || { conditionKey: "unknown", conditionLabel: "Outdoor status" };
    }
    outdoorState.lastFetch = Date.now();
    updateWeatherTiles(weatherState.lastPayload || {});
    pushOutdoorCache();
  } catch (error) {
    /* ignore single failure */
  } finally {
    outdoorState.fetching = false;
  }
}

function pushOutdoorCache() {
  const metrics = outdoorState.metrics;
  if (!metrics) return;
  const now = Date.now();
  if (outdoorState.lastPush && now - outdoorState.lastPush < 5000) return; // throttle a bit

  const outlookPayload = {};
  forecastState.horizons.forEach((h) => {
    const slot = forecastState.data[h];
    if (!slot) return;
    const pressureHpa = toNumber(slot.pressureHpa);
    const pressureMmHg = Number.isFinite(slot.pressureMmHg)
      ? slot.pressureMmHg
      : Number.isFinite(pressureHpa)
        ? pressureHpa / 1.33322
        : NaN;
    outlookPayload[`h${h}`] = {
      tempC: toNumber(slot.temp),
      humidity: toNumber(slot.humidity),
      pressureHpa,
      pressureMmHg,
      conditionKey: slot.conditionKey,
      conditionLabel: slot.conditionLabel,
      conditionCode: slot.conditionCode,
    };
  });

  const pressureHpa = toNumber(metrics.pressureHpa);
  const payload = {
    fetchedAtMs: outdoorState.lastFetch || now,
    current: {
      temperatureC: toNumber(metrics.temperatureC),
      humidity: toNumber(metrics.humidity),
      pressureHpa,
      pressureMmHg: Number.isFinite(metrics.pressureMmHg)
        ? metrics.pressureMmHg
        : Number.isFinite(pressureHpa)
          ? pressureHpa / 1.33322
          : NaN,
      altitudeM: toNumber(metrics.altitudeM),
      windSpeed: toNumber(metrics.windSpeed),
      conditionKey: metrics.conditionKey,
      conditionLabel: metrics.conditionLabel,
      conditionCode: metrics.conditionCode,
    },
    outlook: outlookPayload,
  };

  outdoorState.lastPush = now;
  fetchJSON("/api/outdoor/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* optional */
  });
}

function updateResourceCards(payload) {
  const uptimeEl = selectors.resUptime();
  const heapEl = selectors.resHeap();
  const psramEl = selectors.resPsram();
  const fsEl = selectors.resFs();
  const cpuEl = selectors.resCpu();
  const updatedEl = selectors.resourcesUpdated();

  if (uptimeEl) uptimeEl.textContent = formatUptime(payload?.uptimeMs);

  const heap = payload?.heap || {};
  if (heapEl) {
    const heapUsedPct = Number.isFinite(heap.size) && Number.isFinite(heap.free) && heap.size > 0
      ? ((heap.size - heap.free) / heap.size) * 100
      : NaN;
    const parts = [
      `${formatBytes(heap.free)} free`,
      `${formatBytes(heap.minFree)} min`,
      `${formatBytes(heap.maxAlloc)} max block`,
      `${Number.isFinite(heapUsedPct) ? heapUsedPct.toFixed(1) : "—"}% used`,
    ];
    heapEl.textContent = parts.join(" · ");
  }

  const psram = payload?.psram || {};
  if (psramEl) {
    const sizeLabel = psram.size ? `${formatBytes(psram.size)} total` : "no PSRAM";
    const parts = [sizeLabel];
    if (psram.size) {
      const psramUsedPct = Number.isFinite(psram.size) && Number.isFinite(psram.free) && psram.size > 0
        ? ((psram.size - psram.free) / psram.size) * 100
        : NaN;
      parts.push(`${formatBytes(psram.free)} free`);
      parts.push(`${formatBytes(psram.minFree)} min`);
      parts.push(`${formatBytes(psram.maxAlloc)} max block`);
      parts.push(`${Number.isFinite(psramUsedPct) ? psramUsedPct.toFixed(1) : "—"}% used`);
    }
    psramEl.textContent = parts.join(" · ");
  }

  const fs = payload?.fs || {};
  if (fsEl) {
    const used = Number.isFinite(fs.used) ? fs.used : NaN;
    const total = Number.isFinite(fs.total) ? fs.total : NaN;
    const pct = Number.isFinite(used) && Number.isFinite(total) && total > 0
      ? `${((used / total) * 100).toFixed(1)}%`
      : "—";
    fsEl.textContent = `${formatBytes(used)} / ${formatBytes(total)} (${pct})`;
  }

  if (cpuEl) {
    const freq = Number.isFinite(payload?.cpuFreqMhz) ? `${payload.cpuFreqMhz} MHz` : "—";
    const sdk = payload?.sdkVersion || "—";
    const rev = Number.isFinite(payload?.chipRevision) ? `rev ${payload.chipRevision}` : "—";
    cpuEl.textContent = `${freq} · SDK ${sdk} · ${rev}`;
  }

  if (updatedEl) {
    updatedEl.textContent = payload?.uptimeMs ? `Updated ${formatShortTime(Date.now())}` : "—";
  }
}

async function fetchResources() {
  try {
    const payload = await fetchJSON("/api/system/resources");
    updateResourceCards(payload || {});
  } catch (_) {
    updateResourceCards(null);
  }
}

function scheduleResourcePoll() {
  clearTimeout(resourceState.timer);
  resourceState.timer = setTimeout(async () => {
    await fetchResources();
    scheduleResourcePoll();
  }, resourceState.intervalMs);
}

async function pollWeatherOnce() {
  weatherState.timer = 0;
  await fetchWeatherMetrics();
  scheduleWeatherPoll();
}

function scheduleWeatherPoll() {
  clearWeatherTimer();
  weatherState.timer = setTimeout(pollWeatherOnce, weatherState.intervalMs);
}

function startWeatherLoop(immediate = true) {
  clearWeatherTimer();
  if (immediate) {
    pollWeatherOnce();
  } else {
    scheduleWeatherPoll();
  }
}

function handleWeatherVisibility() {
  if (document.hidden) {
    clearWeatherTimer();
    stopClockLoop();
  } else {
    startWeatherLoop(false);
    startClockLoop();
  }
}

function initServicePage() {
  const intervalSelect = selectors.weatherInterval();
  if (intervalSelect) {
    weatherState.intervalMs = Number(intervalSelect.value) || weatherState.intervalMs;
    intervalSelect.addEventListener("change", () => {
      weatherState.intervalMs = Number(intervalSelect.value) || weatherState.intervalMs;
      startWeatherLoop(true);
    });
  }

  // Load configs before starting the clock to avoid a local-time flash
  outdoorState.config = loadOutdoorConfig();
  outdoorState.selection = outdoorState.config || null;
  applyConfigToForm(outdoorState.config);
  updateLocationSummary();

  clockState.config = loadClockConfig();
  applyClockConfigToForm(clockState.config);

  const startClockWithTimezone = () => {
    // Re-read after potential updates to outdoorState config
    clockState.config = clockState.config || loadClockConfig();
    stopClockLoop();
    startClockLoop();
  };

  loadChartVisibility();
  loadWeatherHistory();
  updateForecastCards();
  fetchResources();
  scheduleResourcePoll();

  renderCharts();
  startWeatherLoop(true);
  document.addEventListener("visibilitychange", handleWeatherVisibility);
  window.addEventListener("resize", renderCharts);
  window.addEventListener("beforeunload", () => {
    clearWeatherTimer();
    clearResourceTimer();
  });
  attachLegendToggles();

  // Pull stored location from device before starting the clock to avoid timezone flicker.
  fetchJSON("/api/outdoor/config")
    .then((cfg) => {
      if (!cfg) return;
      const merged = {
        provider: "open-meteo",
        mode: "city",
        country: cfg.country || outdoorState.config.country,
        city: cfg.city || outdoorState.config.city,
        lat: Number(cfg.lat),
        lon: Number(cfg.lon),
        timezone: cfg.timezone || outdoorState.config.timezone,
      };
      if (Number.isFinite(merged.lat) && Number.isFinite(merged.lon)) {
        outdoorState.config = merged;
        outdoorState.selection = merged;
        saveOutdoorConfig(merged);
        applyConfigToForm(merged);
        updateLocationSummary();
        fetchOutdoorWeather(true);
      }
    })
    .catch(() => {
      /* optional sync; ignore errors */
    })
    .finally(() => {
      startClockWithTimezone();
    });

  // If device fetch is slow or fails, still start clock once with stored config
  setTimeout(() => {
    if (!clockState.timer) startClockWithTimezone();
  }, 150);

  const searchInput = selectors.searchInput();
  if (searchInput) {
    const runSearch = debounce(async (value) => {
      try {
        setSearchStatus("Searching...");
        const results = await queryLocations(value);
        renderSearchResults(results);
      } catch (_) {
        clearSearchResults();
        setSearchStatus("Search failed. Check connection.");
      }
    }, 350);

    searchInput.addEventListener("input", (e) => {
      const value = e.target.value || "";
      const selectedLabel = outdoorState.selection ? formatLocationLabel(outdoorState.selection) : "";
      if (value.trim() !== selectedLabel.trim()) {
        outdoorState.selection = null;
      }
      if (value.trim().length < 2) {
        if (!outdoorState.selection) setSearchStatus("Type 2+ letters to search.");
        clearSearchResults();
        return;
      }
      runSearch(value);
    });

    searchInput.addEventListener("focus", () => {
      const value = searchInput.value || "";
      if (value.trim().length >= 2) {
        runSearch(value);
      }
    });
  }

  const setupBtn = selectors.setupBtn();
  if (setupBtn) {
    setupBtn.addEventListener("click", () => {
      applyConfigToForm(outdoorState.config || loadOutdoorConfig());
      applyClockConfigToForm(clockState.config || loadClockConfig());
      openModal();
    });
  }

  const cancelBtn = selectors.modalCancel();
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  const saveBtn = selectors.modalSave();
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!outdoorState.selection && outdoorState.searchResults.length) {
        setSelection(outdoorState.searchResults[0]);
      }
      const cfg = readConfigFromForm();
      if (!Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) {
        setSearchStatus("Select a city from the list before saving.");
        return;
      }
      const withGeo = await ensureGeolocation(cfg);
      outdoorState.config = withGeo;
      forecastState.lastFetch = 0;
      forecastState.lastLocation = null;
      forecastState.data = {};
      updateForecastCards();
      saveOutdoorConfig(withGeo);
      clockState.config = readClockConfigFromForm();
      saveClockConfig(clockState.config);
      startClockLoop();
      updateLocationSummary();
      closeModal();
      fetchOutdoorWeather(true);
    });
  }

  // Ensure modal stays closed on initial load.
  closeModal();

  const weatherCanvas = selectors.weatherChart();
  const pressureCanvas = selectors.pressureChart();
  [weatherCanvas, pressureCanvas].forEach((canvas) => {
    if (!canvas) return;
    canvas.addEventListener("click", openHistoryModal);
  });

  const historyModal = selectors.historyModal();
  const historyClose = selectors.historyClose();
  if (historyClose) historyClose.addEventListener("click", closeHistoryModal);
  if (historyModal) {
    historyModal.addEventListener("click", (event) => {
      if (event.target === historyModal) {
        closeHistoryModal();
      }
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHistoryModal();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.page === "service") {
    initServicePage();
  }
});
