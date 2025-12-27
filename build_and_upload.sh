#!/bin/bash
set -e

# Detect available serial ports
detect_ports() {
  echo "Available serial ports:" >&2
  ls /dev/tty.usb* /dev/tty.SLAB_USB* /dev/tty.wchusb* /dev/cu.usb* 2>/dev/null || echo "  (none found)"
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
platformio run -e "$PIO_ENV"

echo "[3/5] Building filesystem..."
platformio run -e "$PIO_ENV" -t buildfs

if [[ $UPLOAD_METHOD == usb ]]; then
  detect_ports
  read -p "Enter serial port (e.g. /dev/tty.usbmodem101): " SERIAL_PORT
  echo "[4/5] Uploading firmware to $SERIAL_PORT..."
  platformio run -e "$PIO_ENV" --target upload --upload-port "$SERIAL_PORT"
  echo "[5/5] Uploading filesystem to $SERIAL_PORT..."
  platformio run -e "$PIO_ENV" --target uploadfs --upload-port "$SERIAL_PORT"

else
  read -p "Enter device IP address: " OTA_IP
  FIRMWARE_PATH=.pio/build/$PIO_ENV/firmware.bin
  if [ ! -f "$FIRMWARE_PATH" ]; then
    echo "Firmware binary not found at $FIRMWARE_PATH. Build failed or wrong environment."
    exit 1
  fi
  echo "[4/5] Uploading OTA firmware to $OTA_IP via /api/ota/upload..."
  RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/ota_response.txt -F "firmware=@$FIRMWARE_PATH" http://$OTA_IP/api/ota/upload)
  if [ "$RESPONSE" = "200" ]; then
    echo "OTA firmware upload successful. Device will reboot."
  else
    echo "OTA firmware upload failed! Response code: $RESPONSE"
    cat /tmp/ota_response.txt
    exit 1
  fi
  # Optionally upload FS image if needed (uncomment if supported)
  # FS_PATH=.pio/build/$PIO_ENV/littlefs.bin
  # if [ -f "$FS_PATH" ]; then
  #   echo "[5/5] Uploading OTA filesystem to $OTA_IP via /api/fs/upload..."
  #   RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/fs_response.txt -F "firmware=@$FS_PATH" http://$OTA_IP/api/fs/upload)
  #   if [ "$RESPONSE" = "200" ]; then
  #     echo "OTA filesystem upload successful."
  #   else
  #     echo "OTA filesystem upload failed! Response code: $RESPONSE"
  #     cat /tmp/fs_response.txt
  #     exit 1
  #   fi
  # fi
fi

echo "Cleaning up .gz files..."
find data/service data/setup -name '*.gz' -delete

echo "Done. All .gz files removed from workspace."
