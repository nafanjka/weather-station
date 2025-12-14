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
};

let scanTimer = 0;
let activeNetworkForm = null;

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

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "wifi") {
    initWifiPage();
  } else if (page === "ota") {
    initOtaPage();
  }
});
