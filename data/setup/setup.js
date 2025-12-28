// --- Firmware auto-update section ---
function initFwAutoUpdateSection() {
  const form = document.getElementById("fw-auto-update-form");
  const repoInput = document.getElementById("fw-git-repo");
  const boardSelect = document.getElementById("fw-board-type");
  const status = document.getElementById("fw-auto-update-status");
  const checkBtn = document.getElementById("fw-check-update");
  const updateBtn = document.getElementById("fw-do-update");
  let latestVersion = null;
  const progress = document.getElementById("fw-auto-update-progress");
  const warning = document.getElementById("fw-auto-update-warning");

  async function loadConfig() {
    try {
      const cfg = await fetchJSON("/api/fwupdate/config");
      if (cfg?.repo) repoInput.value = cfg.repo;
      if (cfg?.board) boardSelect.value = cfg.board;
      updateBtn.disabled = true;
      status.hidden = true;
    } catch (e) {
      showBanner(status, "Failed to load update config", "error");
    }
  }

  async function saveConfig() {
    try {
      await fetchJSON("/api/fwupdate/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoInput.value.trim(), board: boardSelect.value })
      });
      status.hidden = true;
    } catch (e) {
      showBanner(status, "Failed to save config", "error");
    }
  }

  async function checkForUpdate() {
    updateBtn.disabled = true;
    showBanner(status, "Checking for update...", "info");
    try {
      await saveConfig();
      const res = await fetchJSON("/api/fwupdate/check");
      // Get installed version from /api/version
      const localVerResp = await fetch("/api/version");
      const localVerData = await localVerResp.json();
      const installedVersion = localVerData.version;
      if (res?.version) {
        const cmp = compareVersions(res.version, installedVersion);
        if (cmp > 0) {
          showBanner(status, `New version available: ${res.version}`, "success");
          updateBtn.disabled = false;
          latestVersion = res.version;
        } else if (cmp === 0) {
          showBanner(status, "No new version found. Installed version is up to date.", "info");
          updateBtn.disabled = true;
        } else {
          showBanner(status, `Installed version (${installedVersion}) is newer than release (${res.version}).`, "info");
          updateBtn.disabled = true;
        }
      } else {
        showBanner(status, "No new version found.", "info");
        updateBtn.disabled = true;
      }
    } catch (e) {
      showBanner(status, e.message || "Update check failed", "error");
      updateBtn.disabled = true;
    }
  }

  async function doUpdate() {
    if (!latestVersion) return;
    updateBtn.disabled = true;
    showBanner(status, "Downloading and updating...", "info");
    if (progress) {
      progress.hidden = false;
      progress.value = 10;
    }
    if (warning) warning.style.display = "block";
    let updateCompleted = false;
    try {
      // Start update request (no real progress, but we can show indeterminate/progress)
      const res = await fetchJSON("/api/fwupdate/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: latestVersion })
      });
      if (res?.ok) {
        if (progress) progress.value = 100;
        showBanner(status, "Update started. Device will reboot. Please wait...", "success");
        updateCompleted = true;
        // Poll device until it disconnects (reboot)
        setTimeout(async () => {
          let tries = 0;
          while (tries < 30) {
            try {
              await fetch("/api/hc", { cache: "no-store" });
              // Still up, wait and try again
              if (progress) progress.value = 100 - Math.min(tries * 3, 90);
              await new Promise(r => setTimeout(r, 1000));
            } catch {
              // Device is rebooting/disconnected
              break;
            }
            tries++;
          }
          if (progress) progress.value = 100;
          showBanner(status, "Device is rebooting. Please reconnect in 10-20 seconds.", "info");
          if (warning) warning.style.display = "none";
        }, 1000);
      } else {
        showBanner(status, res?.error || "Update failed", "error");
        if (progress) progress.value = 0;
        if (warning) warning.style.display = "none";
      }
    } catch (e) {
      showBanner(status, e.message || "Update failed", "error");
      if (progress) progress.value = 0;
      if (warning) warning.style.display = "none";
    }
    // Optionally, after a timeout, hide progress/warning
    if (!updateCompleted) {
      setTimeout(() => {
        if (progress) progress.hidden = true;
        if (warning) warning.style.display = "none";
      }, 8000);
    }
  }

  if (form && repoInput && boardSelect && status && checkBtn && updateBtn) {
    loadConfig();
    repoInput.addEventListener("change", saveConfig);
    boardSelect.addEventListener("change", saveConfig);
    checkBtn.addEventListener("click", checkForUpdate);
    updateBtn.addEventListener("click", doUpdate);
    const saveBtn = document.getElementById("fw-save-config");
    if (saveBtn) saveBtn.addEventListener("click", saveConfig);
  }
}

const selectors = {
  wifiSubtitle: () => document.getElementById("wifi-subtitle"),
  wifiStatus: () => document.getElementById("wifi-status"),
  wifiMode: () => document.getElementById("wifi-mode"),
  wifiSSID: () => document.getElementById("wifi-ssid"),
  wifiIP: () => document.getElementById("wifi-ip"),
  wifiMAC: () => document.getElementById("wifi-mac"),
  wifiSignal: () => document.getElementById("wifi-signal"),
  wifiAP: () => document.getElementById("wifi-ap"),
  scanButton: () => document.getElementById("scan-button"),
  refreshButton: () => document.getElementById("refresh-button"),
  forgetButton: () => document.getElementById("forget-button"),
  hostNameForm: () => document.getElementById("hostname-form"),
  hostNameInput: () => document.getElementById("host-name"),
  hostNameStatus: () => document.getElementById("hostname-status"),
  connectForm: () => document.getElementById("connect-form"),
  connectStatus: () => document.getElementById("connect-status"),
  networkList: () => document.getElementById("network-list"),
  scanHint: () => document.getElementById("scan-hint"),
  otaForm: () => document.getElementById("ota-form"),
  otaStatus: () => document.getElementById("ota-status"),
  otaProgress: () => document.getElementById("ota-progress"),
  otaFile: () => document.getElementById("ota-file"),
  mqttStatus: () => document.getElementById("mqtt-status"),
  mqttForm: () => document.getElementById("mqtt-form"),
  mqttEnabled: () => document.getElementById("mqtt-enabled"),
  mqttHa: () => document.getElementById("mqtt-ha"),
  mqttInterval: () => document.getElementById("mqtt-interval"),
  mqttHost: () => document.getElementById("mqtt-host"),
  mqttPort: () => document.getElementById("mqtt-port"),
  mqttUser: () => document.getElementById("mqtt-username"),
  mqttPass: () => document.getElementById("mqtt-password"),
  mqttBase: () => document.getElementById("mqtt-base"),
  mqttName: () => document.getElementById("mqtt-name"),
  mqttRefresh: () => document.getElementById("mqtt-refresh"),
  mqttConnDot: () => document.getElementById("mqtt-conn-dot"),
  mqttConnLabel: () => document.getElementById("mqtt-conn-label"),
  mqttIndicator: () => document.getElementById("mqtt-indicator"),
  matrixForm: () => document.getElementById("matrix-form"),
  matrixStatus: () => document.getElementById("matrix-status"),
  matrixEnabled: () => document.getElementById("matrix-enabled"),
  matrixPin: () => document.getElementById("matrix-pin"),
  matrixWidth: () => document.getElementById("matrix-width"),
  matrixHeight: () => document.getElementById("matrix-height"),
  matrixSerp: () => document.getElementById("matrix-serpentine"),
  matrixBottom: () => document.getElementById("matrix-bottom"),
  matrixFlipX: () => document.getElementById("matrix-flipx"),
  matrixOrient: () => document.getElementById("matrix-orientation"),
  matrixBrightness: () => document.getElementById("matrix-brightness"),
  matrixMaxBrightness: () => document.getElementById("matrix-max-brightness"),
  matrixNightEnabled: () => document.getElementById("matrix-night-enabled"),
  matrixNightBrightness: () => document.getElementById("matrix-night-brightness"),
  matrixFps: () => document.getElementById("matrix-fps"),
  matrixColorMode: () => document.getElementById("matrix-color-mode"),
  matrixColor1: () => document.getElementById("matrix-color1"),
  matrixColor2: () => document.getElementById("matrix-color2"),
  matrixRefresh: () => document.getElementById("matrix-refresh"),
  matrixTest: () => document.getElementById("matrix-test"),
  matrixClear: () => document.getElementById("matrix-clear"),
  matrixPreview: () => document.getElementById("matrix-preview"),
  matrixPreviewModal: () => document.getElementById("matrix-preview-modal"),
  matrixPreviewClose: () => document.getElementById("matrix-preview-close"),
  matrixPreviewCanvas: () => document.getElementById("matrix-preview-canvas"),
};

let scanTimer = 0;
let activeNetworkForm = null;

// Tiny 3x5 pixel font for preview (1 pixel = 1 LED)
const MATRIX_FONT = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ":": ["0", "1", "0", "1", "0"],
  " ": ["0", "0", "0", "0", "0"],
  "A": ["111", "101", "111", "101", "101"],
  "B": ["110", "101", "110", "101", "110"],
  "C": ["111", "100", "100", "100", "111"],
  "D": ["110", "101", "101", "101", "110"],
  "E": ["111", "100", "111", "100", "111"],
  "F": ["111", "100", "111", "100", "100"],
  "I": ["111", "010", "010", "010", "111"],
  "N": ["101", "111", "111", "101", "101"],
  "O": ["111", "101", "101", "101", "111"],
  "T": ["111", "010", "010", "010", "010"],
  "U": ["101", "101", "101", "101", "111"],
  "L": ["100", "100", "100", "100", "111"],
  "R": ["110", "101", "110", "101", "101"],
  "S": ["111", "100", "111", "001", "111"],
  "P": ["111", "101", "111", "100", "100"],
  "M": ["101", "111", "101", "101", "101"],
};

const NIGHT_START_MINUTES = 23 * 60;
const NIGHT_END_MINUTES = 7 * 60;

let matrixClockPrefs = {
  clockUse12h: false,
  clockShowSeconds: true,
  clockShowMillis: false,
};
let lastClockSignature = "";

function loadClockConfigFull() {
  const defaults = {
    timezoneMode: "location",
    manualTimezone: "",
    format: "24h",
    showSeconds: true,
    showMillis: false,
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

function loadOutdoorConfigFull() {
  try {
    const raw = localStorage.getItem("outdoorConfig");
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  return null;
}

function getClockPrefs() {
  try {
    const raw = localStorage.getItem("clockConfig");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        clockUse12h: parsed?.format === "12h",
        clockShowSeconds: parsed?.showSeconds !== false,
        clockShowMillis: !!parsed?.showMillis,
      };
    }
  } catch (_) {
    /* ignore parse error */
  }
  return { ...matrixClockPrefs };
}

function resolveActiveTimezone() {
  const cfg = loadClockConfigFull();
  if (cfg.timezoneMode === "manual" && cfg.manualTimezone) return cfg.manualTimezone;
  const outdoor = loadOutdoorConfigFull();
  if (cfg.timezoneMode === "location" && outdoor?.timezone) return outdoor.timezone;
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return browserTz || "UTC";
}

function clockSignature(prefs) {
  return `${prefs.clockUse12h ? "12" : "24"}|${prefs.clockShowSeconds ? 1 : 0}|${prefs.clockShowMillis ? 1 : 0}`;
}

async function syncMatrixClockToDevice({ silent = true } = {}) {
  const status = selectors.matrixStatus();
  const payload = readMatrixForm();
  try {
    await fetchJSON("/api/matrix/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    lastClockSignature = clockSignature(getClockPrefs());
    if (!silent && status) {
      showBanner(status, "Matrix clock synced to banner", "success");
    }
  } catch (error) {
    if (!silent && status) {
      showBanner(status, error.message || "Failed to sync matrix clock", "error");
    }
  }
}

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

function signalBucket(rssi) {
  if (typeof rssi !== "number" || Number.isNaN(rssi)) {
    return null;
  }
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

function signalDetails(rssi) {
  const bucket = signalBucket(rssi);
  if (bucket === null) {
    return null;
  }
  return {
    rssi: Math.round(rssi),
    bucket,
    barsLabel: `${bucket}/4 bars`,
  };
}

function createSignalMeter(bucket) {
  const meter = document.createElement("span");
  meter.className = "signal-meter";
  meter.setAttribute("data-level", String(bucket));
  meter.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 4; i += 1) {
    const bar = document.createElement("span");
    bar.className = "signal-bar";
    if (i < bucket) {
      bar.classList.add("active");
    }
    meter.appendChild(bar);
  }
  return meter;
}

function createSignalDisplay(rssi, { compact = false } = {}) {
  const container = document.createElement("span");
  container.className = "signal-display";

  const details = signalDetails(rssi);
  if (!details) {
    container.textContent = compact ? "Signal ?" : "Signal unavailable";
    return container;
  }

  container.title = `${details.rssi} dBm · ${details.barsLabel}`;

  const text = document.createElement("span");
  text.textContent = compact
    ? `${details.rssi} dBm`
    : `${details.rssi} dBm · ${details.barsLabel}`;
  container.appendChild(text);
  container.appendChild(createSignalMeter(details.bucket));

  if (compact) {
    container.classList.add("compact");
  }

  return container;
}

function clearScanTimer() {
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = 0;
  }
}

async function submitWifiCredentials(ssid, password, statusElement) {
  if (!ssid) {
    if (statusElement) {
      showBanner(statusElement, "SSID is required", "error");
    }
    throw new Error("SSID is required");
  }

  if (statusElement) {
    hideBanner(statusElement);
  }

  try {
    await fetchJSON("/api/wifi/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssid, password }),
    });

    if (statusElement) {
      showBanner(statusElement, `Attempting to connect to ${ssid}…`, "success");
    }

    refreshWifiStatus();
    pollScanStatus();
    return true;
  } catch (error) {
    if (statusElement) {
      showBanner(statusElement, error.message || "Failed to save credentials", "error");
    }
    throw error;
  }
}

function formatMode(mode) {
  switch (mode) {
    case "ap":
      return "Access point";
    case "sta+ap":
      return "Station + AP";
    case "station":
    default:
      return "Station";
  }
}

function renderNetworks(data) {
  const list = selectors.networkList();
  const hint = selectors.scanHint();
  if (!list || !hint) return;

  list.innerHTML = "";
  if (activeNetworkForm) {
    activeNetworkForm.close();
    activeNetworkForm = null;
  }

  const networks = Array.isArray(data?.networks) ? data.networks : [];
  if (networks.length === 0) {
    hint.textContent = data?.inProgress ? "Scanning…" : "No networks found yet.";
    return;
  }

  hint.textContent = data?.inProgress
    ? "Scanning…"
    : `Found ${networks.length} network(s).`;

  networks
    .slice()
    .sort((a, b) => (b?.rssi ?? -100) - (a?.rssi ?? -100))
    .forEach((net) => {
      const card = document.createElement("div");
      card.className = "network-card";

      const header = document.createElement("div");
      header.className = "network-card-header";

      const info = document.createElement("div");
      info.className = "network-info";

      const title = document.createElement("div");
      title.className = "network-title";
      const name = net.ssid || "(hidden)";
      title.innerHTML = `<strong>${name}</strong>`;

      const meta = document.createElement("div");
      meta.className = "network-meta";
      const security = document.createElement("span");
      security.textContent = net.secure ? "🔒 secured" : "🔓 open";
      const channel = document.createElement("span");
      channel.textContent = `ch ${net.channel ?? "?"}`;
      meta.append(security, channel);
      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "network-actions";

      const signal = createSignalDisplay(net.rssi, { compact: true });
      signal.classList.add("network-signal");
      actions.appendChild(signal);

      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.className = "secondary";
      useButton.textContent = "Use";
      actions.appendChild(useButton);

      header.append(info, actions);
      card.appendChild(header);

      const inlineContainer = document.createElement("div");
      inlineContainer.className = "network-inline-container";
      inlineContainer.hidden = true;
      card.appendChild(inlineContainer);

      const openInlineForm = () => {
        inlineContainer.innerHTML = "";
        const form = document.createElement("form");
        form.className = "network-inline-form";

        const passwordField = document.createElement("label");
        passwordField.textContent = "Password";
        const passwordInput = document.createElement("input");
        passwordInput.type = "password";
        passwordInput.placeholder = net.secure ? "Enter password" : "Open network";
        passwordInput.disabled = !net.secure;
        passwordField.appendChild(passwordInput);

        const inlineStatus = document.createElement("div");
        inlineStatus.className = "status inline-status";
        inlineStatus.hidden = true;

        const buttons = document.createElement("div");
        buttons.className = "inline-buttons";

        const saveButton = document.createElement("button");
        saveButton.type = "submit";
        saveButton.textContent = "Save";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "secondary";
        cancelButton.textContent = "Cancel";

        buttons.append(saveButton, cancelButton);
        form.append(passwordField, inlineStatus, buttons);
        inlineContainer.appendChild(form);
        inlineContainer.hidden = false;

        const closeForm = () => {
          hideBanner(inlineStatus);
          passwordInput.value = "";
          inlineContainer.hidden = true;
          inlineContainer.innerHTML = "";
          if (activeNetworkForm && activeNetworkForm.container === inlineContainer) {
            activeNetworkForm = null;
          }
        };

        cancelButton.addEventListener("click", closeForm);

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          hideBanner(inlineStatus);
          const ssid = net.ssid || "";
          if (!ssid) {
            showBanner(inlineStatus, "Hidden networks must be added manually below.", "error");
            return;
          }
          const password = net.secure ? passwordInput.value : "";
          if (net.secure && !password) {
            showBanner(inlineStatus, "Password is required", "error");
            return;
          }

          saveButton.disabled = true;
          cancelButton.disabled = true;
          try {
            await submitWifiCredentials(ssid, password, inlineStatus);
            passwordInput.value = "";
            setTimeout(closeForm, 1200);
          } catch (error) {
            /* status already surfaced */
          } finally {
            saveButton.disabled = false;
            cancelButton.disabled = false;
          }
        });

        if (net.secure) {
          passwordInput.focus();
        } else {
          saveButton.focus();
        }

        activeNetworkForm = { container: inlineContainer, close: closeForm };
      };

      useButton.addEventListener("click", () => {
        if (activeNetworkForm && activeNetworkForm.container === inlineContainer) {
          activeNetworkForm.close();
          return;
        }
        if (activeNetworkForm) {
          activeNetworkForm.close();
        }
        openInlineForm();
      });

      list.appendChild(card);
    });
}

async function pollScanStatus() {
  try {
    const result = await fetchJSON("/api/wifi/scan");
    renderNetworks(result);
    if (result?.inProgress) {
      clearScanTimer();
      scanTimer = setTimeout(pollScanStatus, 1500);
    }
  } catch (error) {
    const status = selectors.wifiStatus();
    showBanner(status, error.message || "Scan failed", "error");
  }
}

async function refreshWifiStatus() {
  const statusBanner = selectors.wifiStatus();
  try {
    const state = await fetchJSON("/api/system/state");
    if (!state) return;

    const subtitle = selectors.wifiSubtitle();
    if (subtitle) {
      subtitle.textContent = state.connected
        ? `Connected to ${state.ssid || "unknown"}`
        : `AP active: ${state.apSSID || "ESPPortal"}`;
    }

    const map = {
      mode: selectors.wifiMode(),
      ssid: selectors.wifiSSID(),
      ip: selectors.wifiIP(),
      mac: selectors.wifiMAC(),
      signal: selectors.wifiSignal(),
      ap: selectors.wifiAP(),
      host: selectors.hostNameInput(),
    };

    if (map.mode) map.mode.textContent = formatMode(state.mode || "station");
    if (map.ssid) map.ssid.textContent = state.ssid || "—";
    if (map.ip) map.ip.textContent = state.ip || "—";
    if (map.mac) {
      const macValue = state.mac || "—";
      map.mac.textContent = macValue;
      if (state.connected && state.bssid) {
        map.mac.title = `STA MAC: ${state.mac}\nAP BSSID: ${state.bssid}`;
      } else {
        map.mac.removeAttribute("title");
      }
    }

    if (map.signal) {
      map.signal.innerHTML = "";
      if (state.connected && typeof state.rssi === "number") {
        map.signal.appendChild(createSignalDisplay(state.rssi));
      } else {
        map.signal.textContent = "—";
      }
    }

    if (map.ap) {
      map.ap.textContent = `${state.apSSID || "—"} (${state.apIP || "—"})`;
    }

    if (map.host) {
      map.host.value = state.hostName || "";
    }

    hideBanner(statusBanner);
  } catch (error) {
    showBanner(statusBanner, error.message || "Unable to read status", "error");
  }
}

function initWifiPage() {
  const scanButton = selectors.scanButton();
  const refreshButton = selectors.refreshButton();
  const forgetButton = selectors.forgetButton();
  const connectForm = selectors.connectForm();
  const connectStatus = selectors.connectStatus();
  const hostForm = selectors.hostNameForm();
  const hostStatus = selectors.hostNameStatus();

  refreshWifiStatus();
  pollScanStatus();

  if (scanButton) {
    scanButton.addEventListener("click", async () => {
      clearScanTimer();
      const status = selectors.wifiStatus();
      showBanner(status, "Scanning for networks…");
      try {
        await fetchJSON("/api/wifi/scan", { method: "POST" });
        pollScanStatus();
      } catch (error) {
        showBanner(status, error.message || "Scan request failed", "error");
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      refreshWifiStatus();
      pollScanStatus();
    });
  }

  if (forgetButton) {
    forgetButton.addEventListener("click", async () => {
      const status = selectors.wifiStatus();
      try {
        await fetchJSON("/api/wifi/forget", { method: "POST" });
        showBanner(status, "Stored credentials removed", "success");
        refreshWifiStatus();
      } catch (error) {
        showBanner(status, error.message || "Unable to forget credentials", "error");
      }
    });
  }

  if (connectForm) {
    connectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideBanner(connectStatus);
      const ssid = connectForm.querySelector("#connect-ssid").value.trim();
      const password = connectForm.querySelector("#connect-pass").value;
      if (!ssid) {
        showBanner(connectStatus, "SSID is required", "error");
        return;
      }
      try {
        await submitWifiCredentials(ssid, password, connectStatus);
      } catch (error) {
        /* handled above */
      }
    });
  }

  if (hostForm) {
    hostForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = selectors.hostNameInput();
      hideBanner(hostStatus);
      const next = input?.value.trim() || "";
      if (!next) {
        showBanner(hostStatus, "Host name is required", "error");
        return;
      }
      try {
        await fetchJSON("/api/system/hostname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostName: next }),
        });
        showBanner(hostStatus, "Host name saved. Device will reconnect with the new name.", "success");
        refreshWifiStatus();
      } catch (error) {
        showBanner(hostStatus, error.message || "Failed to save host name", "error");
      }
    });
  }

  window.addEventListener("beforeunload", clearScanTimer);

  initMqttSection();
  initMatrixSection();
}

function updateMqttIndicator(connected) {
  const dot = selectors.mqttConnDot();
  const label = selectors.mqttConnLabel();
  const wrap = selectors.mqttIndicator();
  if (!dot || !label || !wrap) return;
  wrap.hidden = false;
  dot.classList.remove("connected", "disconnected");
  if (connected) {
    dot.classList.add("connected");
    label.textContent = "MQTT connected";
  } else {
    dot.classList.add("disconnected");
    label.textContent = "MQTT disconnected";
  }
}

async function loadMqttConfig() {
  const status = selectors.mqttStatus();
  try {
    const cfg = await fetchJSON("/api/mqtt/config");
    if (!cfg) return;
    const map = {
      enabled: selectors.mqttEnabled(),
      ha: selectors.mqttHa(),
      interval: selectors.mqttInterval(),
      host: selectors.mqttHost(),
      port: selectors.mqttPort(),
      user: selectors.mqttUser(),
      pass: selectors.mqttPass(),
      base: selectors.mqttBase(),
      name: selectors.mqttName(),
    };
    if (map.enabled) map.enabled.checked = !!cfg.enabled;
    if (map.ha) map.ha.checked = !!cfg.haDiscovery;
    if (map.interval && cfg.publishIntervalMs) map.interval.value = cfg.publishIntervalMs;
    if (map.host) map.host.value = cfg.host || "";
    if (map.port && cfg.port) map.port.value = cfg.port;
    if (map.user) map.user.value = cfg.username || "";
    if (map.pass) map.pass.value = cfg.password || "";
    if (map.base) map.base.value = cfg.baseTopic || "";
    if (map.name) map.name.value = cfg.deviceName || "";
    updateMqttIndicator(!!cfg.connected && !!cfg.enabled);
    hideBanner(status);
  } catch (error) {
    showBanner(status, error.message || "Failed to load MQTT settings", "error");
  }
}

function readMqttForm() {
  return {
    enabled: selectors.mqttEnabled()?.checked || false,
    haDiscovery: selectors.mqttHa()?.checked || false,
    host: selectors.mqttHost()?.value.trim() || "",
    port: Number(selectors.mqttPort()?.value) || 1883,
    publishIntervalMs: Number(selectors.mqttInterval()?.value) || 30000,
    username: selectors.mqttUser()?.value.trim() || "",
    password: selectors.mqttPass()?.value || "",
    baseTopic: selectors.mqttBase()?.value.trim() || "homeassistant/weatherstation",
    deviceName: selectors.mqttName()?.value.trim() || "ESP Weather Station",
  };
}

function initMqttSection() {
  const form = selectors.mqttForm();
  const status = selectors.mqttStatus();
  const refresh = selectors.mqttRefresh();
  if (!form || !status) return;

  loadMqttConfig();

  if (refresh) {
    refresh.addEventListener("click", () => {
      loadMqttConfig();
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideBanner(status);
    const payload = readMqttForm();
    if (payload.enabled && !payload.host) {
      showBanner(status, "Broker host is required when MQTT is enabled", "error");
      return;
    }
    try {
      await fetchJSON("/api/mqtt/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showBanner(status, "MQTT settings saved", "success");
    } catch (error) {
      showBanner(status, error.message || "Failed to save MQTT settings", "error");
    }
  });
}

async function loadMatrixConfig() {
  const status = selectors.matrixStatus();
  try {
    const cfg = await fetchJSON("/api/matrix/config");
    if (!cfg) return;
    const map = {
      enabled: selectors.matrixEnabled(),
      pin: selectors.matrixPin(),
      width: selectors.matrixWidth(),
      height: selectors.matrixHeight(),
      serp: selectors.matrixSerp(),
      bottom: selectors.matrixBottom(),
      flipx: selectors.matrixFlipX(),
      orient: selectors.matrixOrient(),
      bright: selectors.matrixBrightness(),
      maxBright: selectors.matrixMaxBrightness(),
      nightEn: selectors.matrixNightEnabled(),
      nightBright: selectors.matrixNightBrightness(),
      fps: selectors.matrixFps(),
      colorMode: selectors.matrixColorMode(),
      color1: selectors.matrixColor1(),
      color2: selectors.matrixColor2(),
    };
    if (map.enabled) map.enabled.checked = !!cfg.enabled;
    if (map.pin) map.pin.value = cfg.pin ?? 2;
    if (map.width) map.width.value = cfg.width ?? 32;
    if (map.height) map.height.value = cfg.height ?? 8;
    if (map.serp) map.serp.checked = !!cfg.serpentine;
    if (map.bottom) map.bottom.checked = !!cfg.startBottom;
    if (map.flipx) map.flipx.checked = !!cfg.flipX;
    if (map.orient) map.orient.value = cfg.orientationIndex ?? 0;
    if (map.bright) map.bright.value = cfg.brightness ?? 48;
    if (map.maxBright) map.maxBright.value = cfg.maxBrightness ?? 96;
    if (map.nightEn) map.nightEn.checked = !!cfg.nightEnabled;
    if (map.nightBright) map.nightBright.value = cfg.nightBrightness ?? 16;
    if (map.fps) map.fps.value = cfg.fps ?? 30;
    if (map.colorMode && typeof cfg.colorMode !== "undefined") map.colorMode.value = cfg.colorMode;
    if (map.color1 && Array.isArray(cfg.color1) && cfg.color1.length >= 3) {
      const [r, g, b] = cfg.color1;
      map.color1.value = `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
    }
    if (map.color2 && Array.isArray(cfg.color2) && cfg.color2.length >= 3) {
      const [r, g, b] = cfg.color2;
      map.color2.value = `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
    }

    const deviceClockPrefs = {
      clockUse12h: !!cfg.clockUse12h,
      clockShowSeconds: cfg.clockShowSeconds !== false,
      clockShowMillis: !!cfg.clockShowMillis,
    };
    matrixClockPrefs = deviceClockPrefs;
    const deviceSig = clockSignature(deviceClockPrefs);
    // Prefer live banner settings when available
    matrixClockPrefs = getClockPrefs();
    const localSig = clockSignature(matrixClockPrefs);
    lastClockSignature = localSig;
    if (localSig !== deviceSig) {
      syncMatrixClockToDevice({ silent: true });
    }
    hideBanner(status);
  } catch (error) {
    showBanner(status, error.message || "Failed to load matrix settings", "error");
  }
}

function readMatrixForm() {
  const nightEnabled = selectors.matrixNightEnabled()?.checked || false;
  const clockPrefs = getClockPrefs();

  return {
    enabled: selectors.matrixEnabled()?.checked || false,
    pin: Number(selectors.matrixPin()?.value) || 2,
    width: Number(selectors.matrixWidth()?.value) || 32,
    height: Number(selectors.matrixHeight()?.value) || 8,
    serpentine: selectors.matrixSerp()?.checked || false,
    startBottom: selectors.matrixBottom()?.checked || false,
    flipX: selectors.matrixFlipX()?.checked || false,
    orientationIndex: Number(selectors.matrixOrient()?.value) || 0,
    brightness: Number(selectors.matrixBrightness()?.value) || 48,
    maxBrightness: Number(selectors.matrixMaxBrightness()?.value) || 96,
    nightEnabled,
    nightStartMin: NIGHT_START_MINUTES,
    nightEndMin: NIGHT_END_MINUTES,
    nightBrightness: Number(selectors.matrixNightBrightness()?.value) || 16,
    fps: Number(selectors.matrixFps()?.value) || 30,
    sceneDwellMs: 0,
    transitionMs: 0,
    sceneOrder: [0],
    sceneCount: 1,
    clockUse12h: !!clockPrefs.clockUse12h,
    clockShowSeconds: clockPrefs.clockShowSeconds !== false,
    clockShowMillis: !!clockPrefs.clockShowMillis,
    colorMode: Number(selectors.matrixColorMode()?.value ?? 0) || 0,
    color1: (() => {
      const v = selectors.matrixColor1()?.value || "#78d2ff";
      const hex = v.replace("#", "");
      if (hex.length !== 6) return [120, 210, 255];
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    })(),
    color2: (() => {
      const v = selectors.matrixColor2()?.value || "#b478ff";
      const hex = v.replace("#", "");
      if (hex.length !== 6) return [180, 120, 255];
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    })(),
  };
}

let matrixPreviewFrame = 0;
let matrixPreviewHandle = null;

function stopMatrixPreview() {
  if (matrixPreviewHandle !== null) {
    cancelAnimationFrame(matrixPreviewHandle);
    matrixPreviewHandle = null;
  }
}

function renderMatrixPreviewOnce(cfg) {
  const canvas = selectors.matrixPreviewCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = Math.max(1, Math.min(256, cfg.width || 32));
  const h = Math.max(1, Math.min(256, cfg.height || 8));
  const scale = Math.max(4, Math.floor(Math.min(canvas.width / w, canvas.height / h)));
  canvas.width = w * scale;
  canvas.height = h * scale;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawPixel = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * scale + 1, y * scale + 1, scale - 2, scale - 2);
  };

  const glyphFor = (ch) => MATRIX_FONT[ch] || MATRIX_FONT[" "];

  const drawPixelChar = (ch, px, py, color) => {
    const rows = glyphFor(ch);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") {
          drawPixel(px + c, py + r, color);
        }
      }
    }
    return rows[0]?.length || 3;
  };

  const measurePixelText = (text) => {
    const upper = text.toUpperCase();
    let width = 0;
    for (let i = 0; i < upper.length; i++) {
      const g = glyphFor(upper[i]);
      const wch = g ? g[0]?.length || 3 : 3;
      width += wch + 1;
    }
    return width > 0 ? width - 1 : 0;
  };

  const drawPixelText = (text, px, py, color) => {
    let cursor = px;
    const upper = text.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const wch = drawPixelChar(upper[i], cursor, py, color);
      cursor += wch + 1;
      if (cursor >= w) break;
    }
  };

  const now = new Date();
  const tz = resolveActiveTimezone();
  const clockPrefs = getClockPrefs();
  const use12h = !!clockPrefs.clockUse12h;
  const showSeconds = clockPrefs.clockShowSeconds !== false;
  const showMillis = !!clockPrefs.clockShowMillis;

  const colorMode = Number(cfg.colorMode ?? 0);
  const color1 = cfg.color1 || [120, 210, 255];
  const color2 = cfg.color2 || [180, 120, 255];

  const colorAt = (x) => {
    if (colorMode === 1) {
      const t = w > 1 ? x / (w - 1) : 0;
      const r = Math.round((1 - t) * color1[0] + t * color2[0]);
      const g = Math.round((1 - t) * color1[1] + t * color2[1]);
      const b = Math.round((1 - t) * color1[2] + t * color2[2]);
      return `rgb(${r},${g},${b})`;
    }
    if (colorMode === 2) {
      const t = ((performance.now() % 8000) / 8000 + (w ? x / w : 0)) % 1;
      const r = Math.round(Math.sin(t * 6.28318) * 127 + 128);
      const g = Math.round(Math.sin((t + 0.33) * 6.28318) * 127 + 128);
      const b = Math.round(Math.sin((t + 0.66) * 6.28318) * 127 + 128);
      return `rgb(${r},${g},${b})`;
    }
    return `rgb(${color1[0]},${color1[1]},${color1[2]})`;
  };

  const pad2 = (v) => v.toString().padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(now);
  const partVal = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  let hour = partVal("hour");
  const minute = partVal("minute");
  const second = partVal("second");
  let ampm = "";
  if (use12h) {
    ampm = ""; // matrix should not show AM/PM label
    hour = hour % 12;
    if (hour === 0) hour = 12;
  }

  let timeStr = `${pad2(hour)}:${pad2(minute)}`;
  if (showSeconds) {
    timeStr = `${timeStr}:${pad2(second)}`;
  }
  // Milliseconds are not shown on the matrix

  const shouldBlink = (second % 2) === 1;
  if (shouldBlink) {
    timeStr = timeStr.replace(/:/g, " ");
  }

  const textWidth = measurePixelText(timeStr);
  const startX = Math.max(0, Math.floor((w - textWidth) / 2));
  const startY = Math.max(0, Math.floor((h - 5) / 2));
  const drawPixelTextColorized = (text, px, py) => {
    let cursor = px;
    const upper = text.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const color = colorAt(cursor);
      const wch = drawPixelChar(upper[i], cursor, py, color);
      cursor += wch + 1;
      if (cursor >= w) break;
    }
  };

  drawPixelTextColorized(timeStr, startX, startY);

  // intentionally no AM/PM on matrix preview
}

function startMatrixPreview() {
  stopMatrixPreview();
  matrixPreviewFrame = 0;
  const loop = () => {
    matrixPreviewFrame += 1;
    renderMatrixPreviewOnce(readMatrixForm());
    matrixPreviewHandle = requestAnimationFrame(loop);
  };
  loop();
}

function initMatrixSection() {
  const form = selectors.matrixForm();
  const status = selectors.matrixStatus();
  const refresh = selectors.matrixRefresh();
  const testBtn = selectors.matrixTest();
  const clearBtn = selectors.matrixClear();
  const previewBtn = selectors.matrixPreview();
  const previewModal = selectors.matrixPreviewModal();
  const previewClose = selectors.matrixPreviewClose();
  if (!form || !status) return;

  // Start with the freshest clock prefs (banner overrides device defaults)
  matrixClockPrefs = getClockPrefs();
  lastClockSignature = clockSignature(matrixClockPrefs);

  window.addEventListener("storage", (evt) => {
    if (evt.key === "clockConfig") {
      matrixClockPrefs = getClockPrefs();
      const sig = clockSignature(matrixClockPrefs);
      if (sig !== lastClockSignature) {
        lastClockSignature = sig;
        syncMatrixClockToDevice({ silent: true });
      }
    }
  });

  if (previewModal) {
    previewModal.hidden = true; // ensure starts closed even if cached state lingered
  }

  loadMatrixConfig();

  if (refresh) {
    refresh.addEventListener("click", () => loadMatrixConfig());
  }

  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      hideBanner(status);
      try {
        await fetchJSON("/api/matrix/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "test" }),
        });
        showBanner(status, "Test pattern running for a few seconds", "success");
      } catch (error) {
        showBanner(status, error.message || "Test action failed", "error");
      }
    matrixClockPrefs = {
      clockUse12h: !!cfg.clockUse12h,
      clockShowSeconds: cfg.clockShowSeconds !== false,
      clockShowMillis: !!cfg.clockShowMillis,
    };

    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      hideBanner(status);
      try {
        await fetchJSON("/api/matrix/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear" }),
        });
        showBanner(status, "Matrix cleared", "success");
      } catch (error) {
        showBanner(status, error.message || "Clear action failed", "error");
      }
    });
  }

  if (previewBtn && previewModal && previewClose) {
    const openPreview = () => {
      previewModal.hidden = false;
      startMatrixPreview();
    };
    const closePreview = () => {
      stopMatrixPreview();
      previewModal.hidden = true;
    };
    previewBtn.addEventListener("click", openPreview);
    previewClose.addEventListener("click", closePreview);
    previewModal.addEventListener("click", (evt) => {
      if (evt.target === previewModal) {
        closePreview();
      }
    });
    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape" && !previewModal.hidden) {
        closePreview();
      }
    });
    window.addEventListener("beforeunload", () => {
      stopMatrixPreview();
      if (previewModal) previewModal.hidden = true;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideBanner(status);
    const payload = readMatrixForm();
    try {
      await fetchJSON("/api/matrix/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showBanner(status, "Matrix settings saved", "success");
    } catch (error) {
      showBanner(status, error.message || "Failed to save matrix settings", "error");
    }
  });
}


function initOtaPage() {
  const form = selectors.otaForm();
  const status = selectors.otaStatus();
  const progress = selectors.otaProgress();
  const fileInput = selectors.otaFile();
  if (!form || !status || !progress || !fileInput) return;

  progress.value = 0;
  progress.hidden = true;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideBanner(status);
    const file = fileInput.files && fileInput.files.length ? fileInput.files[0] : null;
    if (!file) {
      showBanner(status, "Select a firmware .bin file", "error");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    progress.hidden = false;
    progress.value = 0;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ota/upload", true);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const percent = Math.round((evt.loaded / evt.total) * 100);
        progress.value = percent;
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (ok) {
          showBanner(status, "Upload complete. Device will reboot shortly.", "success");
          progress.value = 100;
        } else {
          const message = xhr.responseText || "Upload failed";
          showBanner(status, message, "error");
          progress.value = 0;
        }
        if (submitBtn) submitBtn.disabled = false;
      }
    };

    xhr.onerror = () => {
      showBanner(status, "Upload failed", "error");
      progress.value = 0;
      if (submitBtn) submitBtn.disabled = false;
    };

    const formData = new FormData();
    formData.append("firmware", file);
    xhr.send(formData);
  });
}

// --- Version comparison utility ---
function parseVersion(ver) {
  // Accepts 'ver_1.2.3' or 'ver_1.2' or '1.2.3', returns [1,2,3]
  if (!ver) return [];
  let v = ver.replace(/^ver[_-]?/i, "");
  return v.split("_")[0].split(".").map(x => parseInt(x, 10)).filter(x => !isNaN(x));
}

function compareVersions(a, b) {
  // Returns 1 if a > b, -1 if a < b, 0 if equal
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const na = va[i] || 0;
    const nb = vb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

document.addEventListener("DOMContentLoaded", () => {
    // Show firmware version on all pages with #fw-version
    const fwVerEl = document.getElementById("fw-version");
    if (fwVerEl) {
      fetch("/api/version").then(r => r.json()).then(data => {
        fwVerEl.textContent = data.version || "unknown";
      }).catch(() => {
        fwVerEl.textContent = "unknown";
      });
    }
  const page = document.body.dataset.page;
  if (page === "wifi") {
    initWifiPage();
  } else if (page === "ota") {
    initOtaPage();
    initFwAutoUpdateSection();
  }
});
