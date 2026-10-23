# Screen Cast (iPhone)

Mirrors your iPhone screen to a smart TV on the same Wi-Fi. The app finds DLNA/UPnP TVs
(Samsung, LG, Sony, Philips, Hisense, many others), picks the one that answers fastest
("nearest"), and streams your screen to it as H.264 video. No third-party dependencies.

How it works: a ReplayKit **broadcast extension** receives your screen frames, encodes them
with the hardware H.264 encoder, wraps them in MPEG-TS, serves them over HTTP from the phone,
and tells the TV (DLNA `SetAVTransportURI` + `Play`) to play that URL.

## Build it (needs a Mac with Xcode 14+ and a real iPhone, iOS 15+)

1. `brew install xcodegen`
2. Edit `project.yml`: set `BUNDLE_ID`, `APP_GROUP_ID` (e.g. `group.com.yourname.screencast`)
   and `DEVELOPMENT_TEAM`. A free Apple ID works for personal installs.
3. `cd ios/ScreenCast && xcodegen && open ScreenCast.xcodeproj`
4. In Xcode, select your iPhone and press Run. (Broadcasts don't work in the Simulator.)
   If signing complains, open each target's *Signing & Capabilities* tab and pick your team.

## Use it

1. Open **Screen Cast**, allow *Local Network* access, and tap **Scan for TVs**.
2. Tap your TV (the nearest is pre-selected).
3. Tap the broadcast icon, choose **Screen Cast**, tap **Start Broadcast**.
4. The TV should start showing your screen after a couple of seconds. Stop from the red
   status bar / Dynamic Island.

## Troubleshooting

- **No TVs found:** same Wi-Fi (not guest network)? Turn on the TV's DLNA / media renderer /
  "screen sharing" setting. Try entering the TV's IP address manually.
- **Broadcast ends right away:** a message explains why (no TV chosen, no Wi-Fi, TV refused).
- **TV refuses to play:** some TVs only accept certain formats; open an issue with the model.
- 1–3 s delay is normal. No audio yet. Portrait video shows with black bars on the TV.

Status: written without access to Xcode or a TV, so it has not been compiled or run.
Expect to fix small compile errors on first build.
