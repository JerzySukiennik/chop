# Chop

Cut vegetables on the TV with your iPhone held like a kitchen knife.

- **Mac** runs `server.js`: serves the game (three.js + Rapier, no build) and relays the phone over the local network.
- **iPhone** runs the native `ios/` app: ARKit world tracking streams the phone pose 60×/s, Core Haptics taps back on every cut.
- No phone? The mouse works as a knife (hold to cut, wheel to turn).

## Run

```bash
npm install
npm start
```

Open http://localhost:8790 on the Mac (TV). Launch the **Nóż** app on the iPhone on the same Wi-Fi; it finds the Mac via Bonjour (`_chop._tcp`, TCP port 8791).

## Play

1. Tap **Kalibruj** on the phone, grip it like a knife (bottom in your fist, top pointing away, screen sideways).
2. During the 3-2-1 countdown rest your fist on the table: that pose becomes "blade on the board".
3. Chop. Lay the phone screen-up to get the menu back.

Keys on the Mac: `1` carrot, `2` cucumber, `3` apple, `R` reset, `C` calibrate.

## iOS build

```bash
cd ios && xcodegen generate
xcodebuild -project ChopKnife.xcodeproj -scheme ChopKnife -destination 'generic/platform=iOS' -allowProvisioningUpdates DEVELOPMENT_TEAM=<team> build
```

Free Apple ID signing works; the app expires after 7 days and needs a rebuild.

Sounds: CC0 recordings from Freesound, see `sounds/CREDITS.md`.
