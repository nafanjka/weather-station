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
    tag_clean = tag.lstrip('vV')
    if tag_clean.endswith('.0'):
        tag_clean = tag_clean[:-2]
    # Check if HEAD is exactly at the tag
    try:
        exact_tag = subprocess.check_output(["git", "describe", "--tags", "--exact-match"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        exact_tag = None
    if exact_tag == tag:
        version = tag
    else:
        # Get commit count since tag
        try:
            build = subprocess.check_output(["git", "rev-list", "--count", f"{tag}..HEAD"], stderr=subprocess.DEVNULL).decode().strip()
        except Exception:
            build = "0"
        version = f"{tag}_build{build}"
    return version

fw_version = get_version()
with open("src/assets/firmware_version.h", "w") as f:
    f.write(f'#pragma once\n#define FW_VERSION "{fw_version}"\n')
print(f"[version.py] FW_VERSION set to: {fw_version}")
print(f"[version.py] FW_VERSION set to: {fw_version}")
