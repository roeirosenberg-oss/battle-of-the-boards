# BATTLE OF THE BOARDS

A first-person 3D boxing adventure for the browser, controlled by **real punches** thrown with **two BBC micro:bit V2 boards** — one in each hand — plus a third micro:bit plugged into the PC as a wireless receiver.

Shir walks automatically through a neon electronic kingdom, fights five living electronic components — **The Angry Resistor, Arduino Uno, micro:bit V2, Raspberry Pi** and the **ESP32 Overlord** — and finally takes the golden throne while all five bow before **SHIR, KING OF INTERACTION**.

Built with HTML5, CSS3, JavaScript (ES modules), **Three.js r169**, the **Web Serial API**, the **Web Audio API** (all sounds and music are synthesised live), and **MakeCode** firmware.

---

## Quick start

1. **Flash the boards** (once): drag each file from `firmware/hex/` onto its micro:bit's MICROBIT drive.
   * `shir-receiver.hex` → board that stays plugged into the PC (shows **U**)
   * `shir-right-hand.hex` → right-hand board (shows **R**)
   * `shir-left-hand.hex` → left-hand board (shows **L**)
2. **Open the game:** double-click **`index.html`** (opens in Chrome or Edge). That's it — no server needed.

   Optional: if you prefer a local server, run `node server.js` or `python -m http.server 8080` in this folder and open http://localhost:8080.
3. **Connect micro:bit** → **Connect micro:bit Receiver** → pick *BBC micro:bit CMSIS-DAP* → power on both hand boards.
4. **Calibrate Controllers** (guided, ~1 minute) → **Start Game** → punch!

The full beginner-friendly walkthrough (programming, identifying boards, power, calibration, independent testing, troubleshooting) is in **[HARDWARE_GUIDE.md](HARDWARE_GUIDE.md)**.

No hardware at hand? The game still runs: <kbd>J</kbd> = left punch, <kbd>K</kbd> = right punch (<kbd>Shift</kbd> for a strong punch), left/right mouse button, or the small on-screen L/R buttons. These are clearly-marked **test controls**; the hardware status always shows the real connection state and is never faked.

---

## Controls

| Input | Action |
|---|---|
| Punch with the LEFT micro:bit | Shir's left (blue) glove punches |
| Punch with the RIGHT micro:bit | Shir's right (red) glove punches |
| <kbd>J</kbd> / <kbd>K</kbd>, mouse left / right, on-screen L / R | Test punches (left / right) |
| <kbd>Esc</kbd> | Pause |
| <kbd>F2</kbd> | Debug panel |
| micro:bit **A** / **B** | More / less sensitive (on the hand board) |
| micro:bit **A+B** | Recalibrate that board |

## Gameplay

* Movement is automatic. When an opponent blocks the road, Shir stops, the enemy is introduced, steps forward, and **FIGHT!** begins.
* Enemies telegraph attacks with a **wind-up** (arm pulled back, trembling). Landing a punch during the wind-up deals counter damage and can interrupt the attack.
* Alternating hands and fast rhythms build **combos**. Stronger detected punches do slightly more damage (clamped — you never need to punch dangerously hard).
* The micro:bit V2 dodges and counter-attacks; Arduino and the ESP32 use **spark attacks**; the ESP32 has **three phases** that get faster and add combos.
* Losing a fight offers **Retry this fight**. Winning restores part of your health.
* After the fifth victory: the throne cinematic and the golden title "SHIR, KING OF INTERACTION".

---

## How the motion control works

The micro:bit V2 has an accelerometer, not a position tracker, so the game detects **punch gestures**, not hand positions.

On each hand board (`firmware/*-hand/main.ts`):

1. Accelerometer set to ±8 g, sampled every ~15 ms on X, Y, Z (milli-g).
2. **Gravity compensation:** a slow low-pass filter tracks gravity; subtracting it leaves the *linear* acceleration caused by your movement. The filter freezes almost completely during fast motion.
3. **Trigger:** linear-acceleration magnitude crosses the **threshold**, *and* the signal was calm within the last 120 ms (**sharp onset** — slow arm movements build up gradually and never satisfy this).
4. **Peak window:** samples for 90 ms more to measure the peak → **strength**.
5. **Cooldown + re-arm:** 220 ms minimum gap, and the signal must settle back below ~45 % of the threshold before the next punch can fire.
6. **Calibration** (on power-up, on A+B, or from the browser): averages gravity while you hold still and measures your hand tremor, so the threshold sits well above your natural shake (the game warns you if your chosen sensitivity would be too close to it).
7. The punch is sent over radio as `P,R,1600,12` (hand, strength, sequence number) — **twice**, so a single lost packet doesn't lose the punch. Heartbeats (`H,…`) every 400 ms let the game show link status.

The receiver (`firmware/receiver/main.ts`) drops the duplicate copy and writes one JSON object per line to USB serial at 115200 baud:

```json
{"hand":"RIGHT","event":"PUNCH","strength":1600,"seq":12,"rssi":-58}
{"hand":"LEFT","event":"PUNCH","strength":1350,"seq":19,"rssi":-61}
{"hand":"LEFT","event":"HEARTBEAT","threshold":1300,"seq":19,"rssi":-60}
{"event":"RECEIVER","status":"READY","group":73,"uptime":12345,"pktL":210,"pktR":198}
```

The browser also sends commands back through the receiver: `SENS L 1200`, `CAL`, `LIVE 1`, `ID`, `PING`.

In the browser (`src/input/`), the controller manager filters duplicates again by sequence number (5 s window, handles controller reboots and wrap-around), counts sequence gaps as lost punches, applies a 150 ms per-hand cooldown, tracks heartbeats per hand (signal-lost after 1.6 s), and estimates link quality.

---

## Project structure

```
index.html                  screens, HUD, overlays
css/style.css               UI styling
server.js                   zero-dependency static server (node server.js [port])
start-game.bat              Windows launcher (Node or Python)
vendor/                     three.js r169 + post-processing addons (bundled locally — works offline)
src/
  main.js                   bootstrap + game state machine (menu → walk → intro → fight → victory → … → ending)
  config.js                 balance, enemy definitions, route, zones
  core/engine.js            renderer, scene, camera, bloom, render loop
  core/settings.js          persistent settings, sensitivity ↔ threshold mapping, difficulty
  core/events.js            event emitter
  input/serialConnection.js Web Serial: port picker, open/read/write, auto-reconnect, errors
  input/messageParser.js    newline JSON parsing (tolerant of noise)
  input/controllerManager.js duplicate filtering, cooldowns, per-hand status, link quality, commands
  input/testInput.js        J/K keys, on-screen buttons, simulation mode
  input/calibration.js      guided calibration wizard
  player/cameraRig.js       first-person camera, head-bob, footsteps, shake, kicks, cinematic override
  player/hands.js           first-person arms + gloves, IK, independent punch animations
  world/world.js            route, 5 themed zones, arenas, lights, sky, fog, animated machinery
  world/throneHall.js       the royal hall and golden throne
  world/textures.js         procedural PCB / chip / sign textures
  world/materials.js        shared materials, board geometry
  world/staticMerge.js      merges static meshes for performance
  enemies/rig.js            procedural humanoid rig (arms, fists, legs) + pose animation
  enemies/face.js           cartoon faces (eyes, lids, brows, mouths) and LED-matrix face
  enemies/models.js         the five enemy models
  enemies/enemy.js          enemy actions: walk, wind-up, strike, hit, dodge, KO, kneel, bow…
  enemies/enemyAI.js        attack timing, combos, dodges, counters, staggers, boss phases
  combat/combat.js          damage, health, combos, knockouts, defeat, effects
  combat/hitDetection.js    punch-path vs hurt-sphere collision
  fx/particles.js           sparks + confetti
  fx/lightning.js           electric arcs
  audio/audio.js            synthesised sound effects, volume buses
  audio/music.js            procedural music sequencer (menu, explore, fight, boss, throne)
  ui/ui.js                  HUD, banners, popups, connection screen, settings, debug panel
  ending/victorySequence.js throne cinematic
  characters/shirModel.js   full-body Shir for the ending
firmware/
  right-hand/main.ts  left-hand/main.ts  receiver/main.ts   MakeCode TypeScript source
  */pxt.json                                                 MakeCode project files
  hex/shir-*.hex                                             compiled, ready to flash
```

## Developer / test URL options

| URL | Effect |
|---|---|
| `?sim` | Simulation mode on (automatic fake punches during fights) |
| `?autostart` | Skip the menu |
| `?skipto=3` | Start at fight 4 (0-based) |
| `?ending` | Jump to the walk into the throne hall |
| `?fast=4` | Walk 4× faster |
| `?quality=low` | Force low graphics |

Console: `window.__shir` exposes the game, combat, controllers and serial objects.

## Editing the code

The page loads `game.bundle.js`, which is all of `src/` bundled into one file. After changing anything in `src/`, rebuild it:

```
npx esbuild src/main.js --bundle --format=iife --minify --alias:three=./vendor/three.module.js --alias:three/addons=./vendor/addons --outfile=game.bundle.js
```

## Rebuilding the firmware

The HEX files were produced with the MakeCode command-line compiler:

```
npm install pxt pxt-microbit
echo {"targetdir":"pxt-microbit"} > node_modules/pxtcli.json
cd firmware/right-hand && npx pxt install && npx pxt build     # → built/binary.hex
```

or paste `main.ts` into <https://makecode.microbit.org> (JavaScript view) and click Download.

## Requirements

* Desktop **Chrome 89+** or **Edge 89+** (Web Serial). Firefox/Safari can play with test controls only.
* A GPU-equipped laptop for 60 FPS on *High*; use *Low* quality on integrated graphics.
* Three micro:bit **V2** boards, two battery packs, one USB data cable.
