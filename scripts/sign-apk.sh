#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APKSIGNER="${ANDROID_HOME:-/workspace/android-sdk}/build-tools/35.0.0/apksigner"
ZIPALIGN="${ANDROID_HOME:-/workspace/android-sdk}/build-tools/35.0.0/zipalign"
KS="$ROOT/android-app/keystore/gift-wallet-release.jks"
SRC="${1:-$ROOT/android-app/app/build/outputs/apk/release/app-release-unsigned.apk}"
# 公開済みの dist APK は上書きしない。1.4.19 の署名結果だけを書き出す。
OUT="${2:-$ROOT/dist/gift-wallet-1.4.19.apk}"
if [[ "$(basename "$OUT")" != "gift-wallet-1.4.19.apk" ]]; then
  echo "出力は dist/gift-wallet-1.4.19.apk だけにします。既存APKは変更しません。" >&2
  exit 1
fi
tmp="$(mktemp -d)"
"$ZIPALIGN" -f -p 4 "$SRC" "$tmp/aligned.apk"
"$APKSIGNER" sign --ks "$KS" --ks-key-alias giftwallet \
  --ks-pass pass:giftwallet-release --key-pass pass:giftwallet-release \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT" "$tmp/aligned.apk"
"$APKSIGNER" verify --verbose "$OUT"
echo "Signed -> $OUT"
