#!/bin/zsh
# Full build, OTA upload, and .gz management for remote upload

set -e

OTA_IP="192.168.1.139"

echo "[1/3] Gzipping UI assets..."
python3 scripts/gzip_fs.py

echo "[2/3] Building firmware and filesystem..."
if ! pio run; then
  echo "Build failed. Aborting OTA upload to protect device."
  find data/service data/setup -name '*.gz' -delete
  exit 1
fi
if ! pio run -t buildfs; then
  echo "Filesystem build failed. Aborting OTA upload."
  find data/service data/setup -name '*.gz' -delete
  exit 1
fi

echo "[3/3] OTA firmware upload via curl..."
curl --fail --max-time 120 --connect-timeout 10 -H 'Expect:' -F firmware=@.pio/build/esp32dev/firmware.bin http://$OTA_IP/api/ota/upload

echo "Waiting 20 seconds for ESP32 to reboot..."
sleep 20

echo "OTA filesystem upload via curl..."
curl --fail --max-time 180 --connect-timeout 10 -H 'Expect:' -F littlefs=@.pio/build/esp32dev/littlefs.bin http://$OTA_IP/api/fs/upload

echo "Cleaning up .gz files..."
find data/service data/setup -name '*.gz' -delete

echo "Done. All .gz files removed from workspace."
