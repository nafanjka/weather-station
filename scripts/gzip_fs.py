import gzip
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
TARGET_SUFFIXES = {".html", ".js", ".css"}

def compress_file(path: Path):
    import os
    gz_path = path.with_suffix(path.suffix + ".gz")
    with path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
        shutil.copyfileobj(src, dst)
    # Set .gz file mtime to match original file
    atime = path.stat().st_atime
    mtime = path.stat().st_mtime
    os.utime(gz_path, (atime, mtime))

def main():
    if not DATA_DIR.exists():
        return
    for file in DATA_DIR.rglob("*"):
        if file.is_file() and file.suffix in TARGET_SUFFIXES:
            compress_file(file)

if __name__ == "__main__":
    main()
