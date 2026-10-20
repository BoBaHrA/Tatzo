"""Verify that the self-contained preview APK can update the last delivered build."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from zipfile import ZipFile

PREVIOUS_SHA256 = "d9a39f2693e8710253097da946467ea11b2274f62c57ac7647a15515d3660d55"
PACKAGE = "eu.tatzo.app.preview"

apk = Path(sys.argv[1])
previous_zip = Path(sys.argv[2])
sdk = Path(os.environ.get("ANDROID_HOME") or os.environ["ANDROID_SDK_ROOT"])
build_tools = sorted(
    sdk.glob("build-tools/*"),
    key=lambda path: tuple(int(n) for n in re.findall(r"\d+", path.name)),
    reverse=True,
)
tool_dir = next(path for path in build_tools if (path / "apksigner").is_file() and (path / "aapt").is_file())

def inspect(path):
    signed = subprocess.run(
        [str(tool_dir / "apksigner"), "verify", "--print-certs", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    digest = re.search(r"Signer #1 certificate SHA-256 digest: (\w+)", signed)
    assert digest, "No verified signing certificate"
    badging = subprocess.run(
        [str(tool_dir / "aapt"), "dump", "badging", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    manifest = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    assert manifest, "Missing Android package metadata"
    return manifest.group(1), int(manifest.group(2)), manifest.group(3), digest.group(1), badging

package, version_code, version_name, certificate, badging = inspect(apk)
assert package == PACKAGE, "Preview application ID changed"
assert "application-debuggable" not in badging, "Expected a standalone release build"
with tempfile.TemporaryDirectory() as folder:
    old = Path(folder) / "previous.apk"
    with ZipFile(previous_zip) as archive:
        names = [name for name in archive.namelist() if name.endswith(".apk")]
        assert len(names) == 1, "Ambiguous previous APK artifact"
        old.write_bytes(archive.read(names[0]))
    assert hashlib.sha256(old.read_bytes()).hexdigest() == PREVIOUS_SHA256, "Previous APK checksum mismatch"
    old_package, old_code, _, old_certificate, _ = inspect(old)
    assert package == old_package and certificate == old_certificate, "APK cannot update the previous preview"
    assert version_code > old_code, "Android versionCode was not incremented"

with ZipFile(apk) as archive:
    assert archive.testzip() is None, "APK ZIP integrity failure"
    native = archive.read("assets/index.android.bundle")
    assert len(native) > 1000000, "Missing embedded application bundle"
    key = os.environ["EXPO_PUBLIC_CARTO_BASEMAP_API_KEY"].strip().encode()
    assert key and key in native, "CARTO key was not included"
    assert b"basemapApiKey" in native, "Missing native map key bridge"
    dom_files = [name for name in archive.namelist() if name.endswith(".js") and "www.bundle" in name]
    assert any(b"basemaps.cartocdn.com/dark_all" in (data := archive.read(name)) and b"?key=" in data for name in dom_files), "Missing authenticated map tile URL"
    architectures = sorted({name.split("/")[1] for name in archive.namelist() if name.startswith("lib/")})
    assert "arm64-v8a" in architectures and "x86_64" in architectures, "Missing native architecture"

destination = Path("dist/apk")
destination.mkdir(parents=True, exist_ok=True)
output = destination / "Tatzo-Preview-2026-10-20.apk"
shutil.copyfile(apk, output)
sha256 = hashlib.sha256(output.read_bytes()).hexdigest()
metadata = {
    "file": output.name,
    "bytes": output.stat().st_size,
    "sha256": sha256,
    "package": package,
    "version_name": version_name,
    "version_code": version_code,
    "signer_certificate_sha256": certificate,
    "same_signer_as_previous_preview": True,
    "standalone_bundle": True,
    "carto_key_included": True,
    "architectures": architectures,
    "source_head": os.environ.get("TATZO_SOURCE_HEAD"),
    "build_commit": os.environ.get("GITHUB_SHA"),
}
(destination / "build-info.json").write_text(json.dumps(metadata, indent=2) + "\n")
(destination / "SHA256SUMS.txt").write_text(sha256 + "  " + output.name + "\n")
print(json.dumps(metadata, indent=2))
