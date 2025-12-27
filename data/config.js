// config.js - Handles config page logic and navigation

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('back-to-dashboard');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = '/service/main.html';
    });
  }

  // CLOCK SETUP
  const clockForm = document.getElementById('clock-form');
  if (clockForm) {
    clockForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // Gather clock settings
      const config = {
        enable: document.getElementById('clock-enable').checked,
        timezoneMode: document.getElementById('clock-timezone-mode').value,
        timezoneManual: document.getElementById('clock-timezone-manual').value,
        format: document.getElementById('clock-format-select').value,
        font: document.getElementById('clock-font-select').value,
        showSeconds: document.getElementById('clock-show-seconds').checked,
        showMillis: document.getElementById('clock-show-millis').checked,
        showDate: document.getElementById('clock-show-date').checked,
        showTimezone: document.getElementById('clock-show-timezone').checked,
        ntpPools: document.getElementById('clock-ntp-pools').value,
        syncInterval: document.getElementById('clock-sync-interval').value
      };
      localStorage.setItem('clockConfig', JSON.stringify(config));
      alert('Clock settings saved!');
    });
  }

  // WEATHER SETUP
  const weatherForm = document.getElementById('weather-form');
  if (weatherForm) {
    weatherForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // Gather weather settings
      const config = {
        provider: document.getElementById('outdoor-provider').value,
        city: document.getElementById('outdoor-search').value
      };
      localStorage.setItem('weatherConfig', JSON.stringify(config));
      alert('Weather settings saved!');
    });
  }

  // MATRIX SETUP
  const matrixForm = document.getElementById('matrix-form');
  if (matrixForm) {
    matrixForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // Gather matrix settings
      const config = {
        enabled: document.getElementById('matrix-enabled').checked,
        nightEnabled: document.getElementById('matrix-night-enabled').checked,
        pin: document.getElementById('matrix-pin').value,
        width: document.getElementById('matrix-width').value,
        height: document.getElementById('matrix-height').value,
        orientation: document.getElementById('matrix-orientation').value,
        brightness: document.getElementById('matrix-brightness').value,
        maxBrightness: document.getElementById('matrix-max-brightness').value,
        nightBrightness: document.getElementById('matrix-night-brightness').value,
        fps: document.getElementById('matrix-fps').value,
        serpentine: document.getElementById('matrix-serpentine').checked,
        bottom: document.getElementById('matrix-bottom').checked,
        flipx: document.getElementById('matrix-flipx').checked,
        colorMode: document.getElementById('matrix-color-mode').value,
        color1: document.getElementById('matrix-color1').value,
        color2: document.getElementById('matrix-color2').value
      };
      localStorage.setItem('matrixConfig', JSON.stringify(config));
      alert('Matrix settings saved!');
    });
    // Add listeners for matrix preview, test, clear, refresh as needed
  }
});
