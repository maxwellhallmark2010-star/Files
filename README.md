# The Backrooms — Level 0

A first-person survival horror game that runs in the browser. It's built with three.js and every texture and sound is generated in code, so there are no asset downloads.

## Play

Because it uses ES modules, the game has to be served over HTTP. Opening `index.html` straight from disk won't work.

```bash
npx http-server -p 8080 .      # or: python3 -m http.server 8080
# open http://localhost:8080
```

### Host it on GitHub Pages (needed for multiplayer)

Multiplayer uses peer-to-peer connections, which Claude's preview page blocks, so co-op only works on a normal website.

1. On a free GitHub account, Pages needs a **public** repo: Settings → General → Danger Zone → Change visibility → Public.
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch** → branch `backrooms-game` (or `main` once merged), folder `/ (root)` → Save.
3. After a minute the game is live at **https://maxwellhallmark2010-star.github.io/Files/**.

## Features (from the design sheets)

| Design note | In game |
|---|---|
| Bed / respawn point | The bed in the safe base. Death sends you back to it. |
| Crafting: gun = metal ×3 + gunpowder | Pistol with 8 rounds. Crafting it again adds 8 more. |
| Crafting: go-kart = metal ×10 + electronics ×2 | Drivable kart. It never despawns and is always pinged on the map. |
| Crafting: landmine = metal ×1 + electronics ×1 | Place it with left click. It kills any creature that steps on it. |
| Find crafting materials on map | Scrap metal, electronics and gunpowder are scattered through every chunk. |
| Phone: man calls each day with objectives | Answer the ringing phone in your base. Each day brings new objectives, voiced with speech synthesis. |
| Can't sleep until finished | The bed refuses until every objective is checked off. |
| Dying doesn't reset objectives or inventory | ✔ |
| Giant spider crawls on walls; taking turns loses it | It climbs walls and ceilings and hunts by line of sight. Break sight for about 2 seconds and it gives up. |
| Light bulb creature: don't stare, it will kill you | Looking at it fills a hidden meter, shown by distortion, static and a heartbeat. When the meter fills, you die. |
| Shadow creature: scares you, 0 damage | It appears in your peripheral vision and either rushes at you or vanishes. |
| Lights can cut out; F flashlight; nearest generator highlighted on map | Random blackouts. Hold E at any generator to restore power. |
| Area variants per chunk (seeded): normal 95% / pool rooms 3% / jackpot 2% | ✔ |

Also included:
- **Mobile controls**: joystick, drag-to-look, and buttons for use, interact, flashlight, item, drink, run and crouch. Turn them on/off in Settings (Auto detects touch screens).
- On-screen **pause** button (Resume, Save, Settings, Controls, Main Menu), plus a stats page: days survived, distance, items, kills, deaths, crafts
- Toggleable **minimap** (N or the ◩ button), full **map** with zoom buttons, and a **compass**
- **Almond water**: a healing pickup (H to drink, +45 health and full stamina)
- Every menu panel and overlay has a ✕ close button
- 3 save slots, autosave, Continue / Load / Delete, and seed entry
- Settings: sensitivity, FOV, volume, quality, film grain, phone voice
- Post-processing: bloom, grain, chromatic aberration and vignette
- Jumpscares, positional HRTF audio and reverb
- Experimental **co-op multiplayer** (peer-to-peer over WebRTC via PeerJS). The host shares a 5-letter room code. Guests share the host's world, monsters, power and vehicles, and each player has their own objectives. It uses the free public PeerJS server by default. You can set a self-hosted one in Settings.

## Controls

`WASD` move · `Shift` sprint · `C` crouch · `E` interact (hold for generators) · `F` flashlight · `Click` shoot or place mine · `1/2/3` items · `H` drink almond water · `Tab` crafting · `M` map · `N` minimap · `Esc` pause

## Files

- `js/world.js`: infinite chunk generation, lighting, collision, path-finding
- `js/monsters.js`: spider, light-bulb creature, shadow creature
- `js/entities.js`: items, generators, karts, mines, base furniture
- `js/textures.js`: procedural PBR textures
- `js/audio.js`: procedural sound
- `js/effects.js`: post-processing and jumpscares
- `js/objectives.js`: daily phone calls and objectives
- `js/net.js`: co-op multiplayer
- `models/explorer.glb`: the hazmat explorer model used for other players in co-op
- `lib/`: vendored three.js r160 and PeerJS 1.5.4
