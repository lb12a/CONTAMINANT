# Android app

The Android app is the same web client inside a Capacitor shell (`apps/android`). It plays offline against
bots, goes online with **Play online** like every other version and shows system notifications for
challenges, friend requests and an evening reminder for the daily reward.

## Build a test APK

Needs JDK 21 and the Android SDK (platform 36, build-tools 36). The build script looks for them in
`JAVA_HOME` / `ANDROID_HOME`, or in `%USERPROFILE%/AndroidTools/jdk` and `%USERPROFILE%/AndroidTools/sdk`.

```bash
npm run android:build
```

The script builds the web client, copies it into the Android project (`npx cap sync android`) and runs
Gradle. The result is `apps/android/release/Contaminant-debug.apk`. Install it by copying it to the phone
(allow "install unknown apps" for the file manager) or with `adb install -r apps/android/release/Contaminant-debug.apk`.

Gradle runs with two workers and a 1.5 GB heap so laptops stay responsive.

## Playing online on the phone

- On the same Wi-Fi as a PC running the desktop app: **Play online** → **Search my Wi-Fi** finds the PC.
  Or enter the address the desktop app shows (for example `192.168.1.20`).
- With a public server: put its address into `packages/client/public/server.json` before building, then
  **Play online** connects straight away. See [DEPLOY.md](DEPLOY.md).

The app allows plain `http://` connections inside the home network (`usesCleartextTraffic`), so a LAN
server needs no certificate.

## Release build for a store

1. Create a keystore once and keep it safe (losing it means no more updates under the same app):

   ```bash
   keytool -genkey -v -keystore contaminant.jks -alias contaminant -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add a signing config to `apps/android/android/app/build.gradle` (`signingConfigs.release` with the
   keystore path, alias and passwords from environment variables) and reference it in `buildTypes.release`.
3. `npm run android:release` writes `apps/android/release/Contaminant-release.apk`. For Google Play build an
   app bundle instead: `cd apps/android/android && ./gradlew bundleRelease`.

App id: `game.contaminant.app`. Icons and splash screens are composed from the generated art by
`tools/assetgen/src/appicon.py` (run it again after changing the art).
