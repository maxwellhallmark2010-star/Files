# The Backrooms — Level 0

A first-person survival horror game that runs in the browser. It's built with three.js and every texture and sound is generated in code, so there are no asset downloads.

## Play

Because it uses ES modules, the game has to be served over HTTP. Opening `index.html` straight from disk won't work.

```bash
npx http-server -p 8080 .      # or: python3 -m http.server 8080
# open http://localhost:8080
```

You can also host it for free with **GitHub Pages**: Settings → Pages → deploy from the `main` branch, root folder.

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
- 3 save slots, autosave, Continue / Load / Delete, and seed entry
- Settings: sensitivity, FOV, volume, quality, film grain, phone voice
- Post-processing: bloom, grain, chromatic aberration and vignette
- Jumpscares, positional HRTF audio and reverb
- Experimental **co-op multiplayer** (peer-to-peer over WebRTC via PeerJS). The host shares a 5-letter room code. Guests share the host's world, monsters, power and vehicles, and each player has their own objectives. It uses the free public PeerJS server by default. You can set a self-hosted one in Settings.

## Controls

`WASD` move · `Shift` sprint · `C` crouch · `E` interact (hold for generators) · `F` flashlight · `Click` shoot or place mine · `1/2/3` items · `Tab` crafting · `M` map · `Esc` pause

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
