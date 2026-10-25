#!/usr/bin/env bash
# MacTemp 를 빌드해서 dist/MacTemp.app 번들을 만든다.
#   ./build.sh            빌드만
#   ./build.sh --install  빌드 후 /Applications 에 설치하고 실행
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="MacTemp"
BUNDLE_ID="com.gimeast.mactemp"
VERSION="1.0.0"
APP_DIR="dist/${APP_NAME}.app"

echo "==> 릴리스 빌드"
swift build -c release

BIN="$(swift build -c release --show-bin-path)/${APP_NAME}"
[ -x "$BIN" ] || { echo "빌드 산출물을 찾을 수 없습니다: $BIN" >&2; exit 1; }

echo "==> 앱 번들 조립"
rm -rf "$APP_DIR"
mkdir -p "${APP_DIR}/Contents/MacOS" "${APP_DIR}/Contents/Resources"
cp "$BIN" "${APP_DIR}/Contents/MacOS/${APP_NAME}"

cat > "${APP_DIR}/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <!-- Dock 에 뜨지 않는 메뉴바 전용 앱 -->
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "==> 애드혹 서명"
codesign --force --sign - "$APP_DIR"

echo "완료: ${APP_DIR}"

if [ "${1:-}" = "--install" ]; then
    echo "==> /Applications 에 설치"
    pkill -x "$APP_NAME" 2>/dev/null || true
    rm -rf "/Applications/${APP_NAME}.app"
    cp -R "$APP_DIR" "/Applications/${APP_NAME}.app"
    open "/Applications/${APP_NAME}.app"
    echo "설치 완료. 메뉴바를 확인하세요."
fi
