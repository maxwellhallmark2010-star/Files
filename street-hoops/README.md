# Street Hoops 3D

A mobile-first 3D streetball game for the iPhone browser. Open `../street-hoops.html` directly: it is one self-contained file with three.js inlined, so it also works offline or from the home screen (Share → Add to Home Screen).

## Modes
- **1 on 1**: play Blaze (AI) to 11, 15 or 21 under half-court street rules: check ball at the top, 14-second shot clock, take it back past the arc after a defensive rebound or steal, out of bounds, reach-in fouls and goaltending.
- **Shot challenge**: 60 seconds. Your rebounder feeds you; shots from the glowing money spot score double, a swish adds 1, and three makes in a row puts you on fire (wider green window).
- **Free practice**: open court with a rebounder who passes back to you. Tracks FG%, threes and streaks.

## Controls (touch)
| Control | With the ball | On defense / loose ball |
| --- | --- | --- |
| Left-half stick | Move (camera-relative) | Move |
| Shoot (hold, release) | Jumper / layup / dunk / fadeaway depending on position and stick | Block / jump for rebound |
| Pass | Pass to teammate (practice/challenge) | Steal (Call for the ball when your teammate has it) |
| Cross | Crossover, spin (while sprinting) or step-back (stick away from the hoop) | – |
| Sprint (hold) | Sprint, uses stamina | Sprint |

Keyboard fallback for desktop: WASD, J shoot, K pass/steal, L cross, Shift sprint, P pause.

## Code layout
`src/` is concatenated in file order by `build.js` into one IIFE:

| File | Responsibility |
| --- | --- |
| `00_config.js` | Court dimensions (FIBA half court), constants, helpers, settings persistence |
| `01_audio.js` | WebAudio-synthesised sound effects (no audio files) |
| `02_input.js` | Floating joystick and multi-touch buttons (Pointer Events) plus keyboard |
| `03_world.js` | Canvas-painted court, hoop, backboard, verlet net, dusk environment, crowd |
| `04_ball.js` | Ball physics: exact gravity integration, sub-stepped rim/board/floor collisions, scoring |
| `05_player.js` | Jointed low-poly player, procedural animation, locomotion and action state machine |
| `06_ai.js` | Offense, defense, rebounding and feeder AI |
| `07_game.js` | Modes, rules, shot resolution, steals/blocks/passes, camera |
| `08_ui.js` | Menus, settings, HUD, shot meter, context buttons |
| `09_main.js` | Renderer, quality presets, adaptive resolution, main loop |

Build after editing: `node street-hoops/build.js` (writes `street-hoops.html` at the repo root).
