#!/bin/bash

set -e

# Always cleanup .gz files on exit (success or error)
cleanup() {
  echo "Cleaning up .gz files..."
  find data/service data/setup -name '*.gz' -delete
  echo "Done. All .gz files removed from workspace."
}
trap cleanup EXIT

# Detect available serial ports
detect_ports() {
  echo "Available serial ports:" >&2
  ls /dev/tty.usb* 2>/dev/null || echo "  (none found)"
}

# Ask user for board type
select_board() {
  echo "Select your board type:"
  select board in \
    "ESP32 DevKit (esp32dev)" \
    "ESP32 WROOM (esp32wroom)" \
    "ESP32 WROVER (esp32wrover)" \
    "ESP32-S3 n16r8 with PSRAM (esp32s3n16r8_psram)" \
    "ESP32-S3 n16r8 NO PSRAM (esp32s3n16r8_nopsram)"; do
    case $REPLY in
      1) PIO_ENV=esp32dev; break;;
      2) PIO_ENV=esp32wroom; break;;
      3) PIO_ENV=esp32wrover; break;;
      4) PIO_ENV=esp32s3n16r8_psram; break;;
      5) PIO_ENV=esp32s3n16r8_nopsram; break;;
      *) echo "Invalid option";;
    esac
  done
}

# Ask user for upload method
select_upload_method() {
  echo "Select upload method:"
  select method in "USB (Serial)" "WiFi (OTA)"; do
    case $REPLY in
      1) UPLOAD_METHOD=usb; break;;
      2) UPLOAD_METHOD=wifi; break;;
      *) echo "Invalid option";;
    esac
  done
}

# Main script
select_board
select_upload_method

echo "[1/5] Gzipping UI assets..."
python3 scripts/gzip_fs.py

echo "[2/5] Building firmware..."

# Always build both main boards for GitHub releases
platformio run -e esp32dev
platformio run -e esp32s3n16r8_nopsram

# Copy firmware binaries to root for GitHub release assets
cp .pio/build/esp32dev/firmware.bin firmware-esp32dev.bin 2>/dev/null || true
cp .pio/build/esp32s3n16r8_nopsram/firmware.bin firmware-esp32s3n16r8_nopsram.bin 2>/dev/null || true

# Also build/upload the selected board as usual
platformio run -e "$PIO_ENV"



# Compute hash of data/ folder for FS change detection
mkdir -p .fs_hashes
FS_HASH_FILE=.fs_hashes/last_fs_hash_$PIO_ENV.txt
CUR_FS_HASH=$(find data -type f -exec md5sum {} + | sort | md5sum | awk '{print $1}')
PREV_FS_HASH=""
if [ -f "$FS_HASH_FILE" ]; then
  PREV_FS_HASH=$(cat "$FS_HASH_FILE")
fi



FS_CHANGED=0
if [ "$CUR_FS_HASH" != "$PREV_FS_HASH" ]; then
  FS_CHANGED=1
  echo "[3/5] Filesystem changed, building filesystem..."
  platformio run -e "$PIO_ENV" -t buildfs
  # Update FS hash immediately after buildfs
  echo "$CUR_FS_HASH" > "$FS_HASH_FILE"
else
  echo "[3/5] Filesystem not changed, skipping buildfs."
fi

# Check if littlefs.bin actually changes
FS_PATH=.pio/build/$PIO_ENV/littlefs.bin
FS_BIN_HASH_FILE=.fs_hashes/last_fs_bin_hash_$PIO_ENV.txt
if [ -f "$FS_PATH" ]; then
  CUR_FS_BIN_HASH=$(md5sum "$FS_PATH" | awk '{print $1}')
  PREV_FS_BIN_HASH=""
  if [ -f "$FS_BIN_HASH_FILE" ]; then
    PREV_FS_BIN_HASH=$(cat "$FS_BIN_HASH_FILE")
  fi
  # Always update FS bin hash after buildfs
  echo "$CUR_FS_BIN_HASH" > "$FS_BIN_HASH_FILE"
fi

if [[ $UPLOAD_METHOD == usb ]]; then
  detect_ports
  read -p "Enter serial port (e.g. /dev/tty.usbmodem101): " SERIAL_PORT
  echo "[4/5] Uploading firmware to $SERIAL_PORT..."
  platformio run -e "$PIO_ENV" --target upload --upload-port "$SERIAL_PORT"
  echo "[5/5] Uploading filesystem to $SERIAL_PORT..."
  platformio run -e "$PIO_ENV" --target uploadfs --upload-port "$SERIAL_PORT"
  # Log monitoring removed

else
  read -p "Enter device IP address: " OTA_IP
  FIRMWARE_PATH=.pio/build/$PIO_ENV/firmware.bin
  if [ ! -f "$FIRMWARE_PATH" ]; then
    echo "Firmware binary not found at $FIRMWARE_PATH. Build failed or wrong environment."
    exit 1
  fi
  echo "[4/5] Uploading OTA firmware to $OTA_IP via /api/ota/upload..."
  RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/ota_response.txt -F "firmware=@$FIRMWARE_PATH" http://$OTA_IP/api/ota/upload)
  SERVER_MSG=$(cat /tmp/ota_response.txt)
  if [ "$RESPONSE" = "200" ]; then
    echo "OTA firmware upload successful. Device will reboot."
  else
    echo "OTA firmware upload failed! Response code: $RESPONSE"
  fi
  echo "--- OTA server response (HTTP $RESPONSE) ---"
  echo "$SERVER_MSG"
  echo "------------------------------------------"
  if [ "$RESPONSE" != "200" ]; then
    exit 1
  fi
  # Upload FS image only if changed
  FS_PATH=.pio/build/$PIO_ENV/littlefs.bin
  if [ $FS_CHANGED -eq 1 ] && [ -f "$FS_PATH" ]; then
    echo "[5/5] Waiting for device to reboot and become available (/api/hc)..."
    HC_OK=0
    for i in {1..30}; do
      sleep 2
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 http://$OTA_IP/api/hc)
      echo -n "($STATUS)"
      if [ "$STATUS" = "204" ]; then
        echo " /api/hc is available (status $STATUS)."
        HC_OK=1
        break
      fi
      echo -n "."
    done
    echo
    if [ $HC_OK -eq 0 ]; then
      echo "[ERROR] Timeout waiting for /api/hc, skipping OTA FS upload!"
      exit 1
    fi
    echo "[5/5] Uploading OTA filesystem to $OTA_IP via /api/fs/upload..."
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/fs_response.txt -F "firmware=@$FS_PATH" http://$OTA_IP/api/fs/upload)
    SERVER_MSG=$(cat /tmp/fs_response.txt)
    if [ "$RESPONSE" = "200" ]; then
      echo "OTA filesystem upload successful."
      echo "Server response: $SERVER_MSG"
    else
      echo "OTA filesystem upload failed! Response code: $RESPONSE"
      echo "Server response: $SERVER_MSG"
      exit 1
    fi
    # Log monitoring removed
  else
    echo "[5/5] Filesystem not changed, skipping OTA FS upload."
  fi
fi

