# Furnace Road

An endless third-person drive through Death Valley in a rusted 4x4, built for the iPhone browser. Open `../furnace-road.html` directly: it's one self-contained file (three.js inlined), works offline, and can be added to the home screen.

## What's out there
- A two-lane highway generated forever from noise: long straights, sweeping bends, dips and grades. Behind it are salt flats, desert pavement, badlands foothills and two ranges of distant mountains.
- Longhorn steer skulls on the sand and nailed to fence posts, creosote, rocks, barbed-wire fences, and telephone poles with sagging wires.
- Tumbleweeds blown across the road by a shifting wind. They roll and hop, and get launched when you hit them.
- A gas station roughly every 1.4 miles, each with a canopy, pumps, a store, a price sign, and a water table with 4 bottles. Blue GAS signs warn you ½ mile out.
- A day/night cycle: sunset, stars, headlights, and lit canopies at night.

## Survival
- **Fuel** lasts about 4 highway miles (less if you floor it). Stop beside a pump and tap **FILL UP**.
- **Water** drains with the heat, which peaks around 118°F in the afternoon. Grab bottles at the water table (4 max) and tap **DRINK**. Run dry and your vision dims and the wheel starts to drift.
- If you run out of gas, coast or brake to a stop, and a tow truck drops you at the next station.

## Controls
- **Steering wheel** (bottom left): put a finger on it and twist. It rotates exactly as far as you turn it, and the Jeep's front wheels follow. Let go and it centres. Tap the hub to honk.
- **Gas / Brake** pedals (bottom right). It's a 4-speed automatic; hold the brake at a standstill to drop into reverse.
- Settings: steering range (½–1¼ turns), speed-sensitive steering, near/far chase cam, time of day, graphics, mph/km/h, mirrored layout.
- Keyboard: W/S, A/D, H horn, C camera, P pause.

## Driving model (`src/05_car.js`)
Single-track vehicle model with a magic-formula tyre per axle and a friction circle, so locked fronts and spinning rears lose side grip. It also has longitudinal load transfer, rear-wheel drive through a torque converter and a 4-speed automatic (shift points vary with throttle, plus a cruise upshift), and engine braking. Surfaces differ in grip and drag (asphalt, lot, gravel, sand), and gravity acts on grades. The body rides on springs (squat, dive, roll) over the real terrain height under each wheel.

## Code layout
`src/` is concatenated in order by `build.js`: config & noise → audio → road/terrain functions → generated assets → world streaming & stations → car → tumbleweeds/dust → controls → HUD → game loop.

Build after editing: `node furnace-road/build.js`.
