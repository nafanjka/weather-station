#!/bin/zsh
# Full build, upload, and .gz management for local serial upload

set -e

echo "[1/5] Locating USB serial device..."
SERIAL_PORT=$(ls /dev/cu.usbserial* 2>/dev/null | head -n 1)
if [[ -z "$SERIAL_PORT" ]]; then
	echo "ERROR: No USB serial device found (expected /dev/cu.usbserial*)"
	exit 1
fi
echo "Using serial port: $SERIAL_PORT"

echo "[2/5] Gzipping UI assets..."
python3 scripts/gzip_fs.py

echo "[3/5] Building firmware..."
if ! pio run; then
	echo "Build failed. Aborting upload to protect device."
	find data/service data/setup -name '*.gz' -delete
	exit 1
fi

echo "[3.5/5] Building filesystem..."
if ! pio run -t buildfs; then
	echo "Filesystem build failed. Aborting upload."
	find data/service data/setup -name '*.gz' -delete
	exit 1
fi

echo "[4/5] Uploading firmware..."
pio run -t upload --upload-port "$SERIAL_PORT"

echo "[5/5] Uploading filesystem..."
pio run -t uploadfs --upload-port "$SERIAL_PORT"

echo "Cleaning up .gz files..."
find data/service data/setup -name '*.gz' -delete

echo "Done. All .gz files removed from workspace."
