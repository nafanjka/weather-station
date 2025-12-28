import subprocess
from SCons.Script import Import

Import("env")

def get_version():
    try:
        # Get latest tag (if any)
        tag = subprocess.check_output(["git", "describe", "--tags", "--abbrev=0"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        tag = "0.0"
    # Remove leading 'v' or 'V' and any trailing .0 for cosmetic versioning
    tag = tag.lstrip('vV')
    if tag.endswith('.0'):
        tag = tag[:-2]
    try:
        # Get commit count
        build = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        build = "0"
    if not tag:
        tag = "0.0"
    if not build:
        build = "0"
    version = f'ver_{tag}_build{build}'
    return version

fw_version = get_version()
with open("src/assets/firmware_version.h", "w") as f:
    f.write(f'#pragma once\n#define FW_VERSION "{fw_version}"\n')
print(f"[version.py] FW_VERSION set to: {fw_version}")
print(f"[version.py] FW_VERSION set to: {fw_version}")
