# Battle of the Boards — Hardware Setup Guide

You need **three BBC micro:bit V2 boards**, **two battery packs** (2×AAA packs with the JST plug are ideal), **one USB data cable**, and a Windows PC with **Google Chrome or Microsoft Edge**.

| Board | Role | Firmware file | Shows on its LEDs |
|---|---|---|---|
| #1 | USB receiver (stays plugged into the PC) | `firmware/hex/shir-receiver.hex` | **U** |
| #2 | Right-hand controller (battery) | `firmware/hex/shir-right-hand.hex` | **R** |
| #3 | Left-hand controller (battery) | `firmware/hex/shir-left-hand.hex` | **L** |

```
RIGHT micro:bit ──radio──┐
                         ├──> RECEIVER micro:bit ──USB serial──> Chrome/Edge (Web Serial) ──> game
LEFT  micro:bit ──radio──┘
```

All three boards use the built-in micro:bit radio on **group 73** (no Bluetooth pairing).

---

## 1. Program each micro:bit

The three `.hex` files in `firmware/hex/` were compiled from the source in `firmware/*/main.ts` with the official MakeCode compiler (pxt-microbit 9.1.1). They are "universal" hex files and run on micro:bit V2.

For **each** board, one at a time:

1. Plug the board into the PC with the USB cable. It appears as a drive called **MICROBIT**.
2. Drag the correct `.hex` file onto the **MICROBIT** drive (or right-click → *Send to* → MICROBIT).
3. The yellow LED on the back flashes while copying. When it stops, the board restarts and shows its letter: **U**, **R** or **L**.
4. Unplug it and do the next board.

> **Tip:** put a sticker on each board ("U", "R", "L") right after flashing.

**Alternative — compile it yourself in MakeCode:** open <https://makecode.microbit.org>, *New Project* → switch to **JavaScript** → paste the contents of `firmware/right-hand/main.ts` (or left-hand / receiver) → make sure the **radio** extension is present (it is by default) → click **Download**. The only difference between the left and right programs is the line `const HAND: string = "R"` vs `"L"`.

## 2. Identify the RIGHT-hand board

* It shows **R** on its LED matrix after power-up.
* When it detects a punch, the two **right-hand corner** LEDs light up.
* Press the **logo** (gold touch area on the front) to show its current threshold.

## 3. Identify the LEFT-hand board

* It shows **L** on its LED matrix after power-up.
* When it detects a punch, the two **left-hand corner** LEDs light up.
* In the game's hardware screen, **Identify boards** makes both hand boards flash their letter three times.

## 4. Connect the receiver to the computer

* Plug the **U** board into the PC with a USB **data** cable (some phone-charging cables have no data wires — if the board never appears as a MICROBIT drive, swap the cable).
* Leave it plugged in for the whole game. It is powered by USB.
* On its LEDs: the **left column** flashes when a LEFT punch arrives, the **right column** when a RIGHT punch arrives — a handy check that the radio link works even before the browser is involved.

## 5. Power the two handheld boards

* Plug a battery pack into the white **JST battery socket** at the top of each hand board, and switch the pack on.
* The board starts, shows its letter, then shows a **target** icon for ~1.5 s while it calibrates (hold it still), then a **tick**.
* Hold each board firmly in your fist — e.g. with the LED side facing up — or strap it to the back of your hand/wrist with a velcro strap or a sweatband. **Keep a firm grip** so it can't fly out of your hand.

## 6. Open the browser game

Double-click **`index.html`** in the game folder and open it with **Chrome** or **Edge**. Keep `game.bundle.js` and the `vendor`, `css` folders next to it.

Optional: you can also serve it locally with `node server.js` (or `python -m http.server 8080`, or `start-game.bat`) and open <http://localhost:8080>.

## 7. Connect through Web Serial

1. In the main menu click **Connect micro:bit**.
2. Click **Connect micro:bit Receiver**. The browser shows a list of serial devices.
3. Choose the entry that says **"BBC micro:bit CMSIS-DAP"** / **"mbed Serial Port"** and click **Connect**.
4. Status should become **USB connected**, then **Receiver firmware: responding (radio group 73)**, then **LEFT / RIGHT: Connected** once the hand boards are powered.

The browser remembers your choice: next time the game reconnects automatically, and if you unplug the receiver and plug it back in, it reconnects by itself.

## 8. Calibrate the punches

**Quick calibration:** in the hardware screen press **Calibrate both (hold still)** and hold both boards still in your boxing stance for 1.5 s. Each board measures gravity and the natural tremor of your hand.

**Guided calibration (recommended for the first time):** main menu → **Calibrate Controllers**:

1. *Hold still* — boards calibrate.
2. *Left punches* — throw 3 punches with your left hand. If the RIGHT board reacts, the game tells you the boards are swapped.
3. *Right punches* — 3 punches with your right hand.
4. *Normal movement* — move your arms slowly for 6 s; no punch should be detected. If one is, the wizard offers to lower the sensitivity.
5. *Done* — shows your average punch strength and tuning tips.

**Sensitivity** (1–10, separately for each hand) maps to an acceleration threshold from 2600 mg (1) to 700 mg (10). Higher = lighter punches count. You can also change it on the boards: **A** = more sensitive, **B** = less sensitive, **A+B** = recalibrate.

## 9. Test the controllers independently

* Hardware screen → section 2 shows each hand separately: connection status, radio link quality, signal strength (RSSI), threshold and punch count. The glove icon of the matching hand flashes on every punch.
* Tick **Live motion meter** to see each board's acceleration level in real time against its threshold (red line).
* Punch with **only the left hand** → only the LEFT card should flash. Then only the right hand.
* Press **F2** in-game (or enable it in Settings) for the debug panel: raw serial lines, last left/right punch, intensity, counts, duplicates filtered, lost packets, radio packet counters.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| **"Web Serial not available"** | Use desktop Chrome or Edge (not Firefox/Safari). |
| **Device list is empty** | Use a USB *data* cable; try another USB port; click *Show all serial devices*. On very old Windows 7 machines install the Arm Mbed serial driver. |
| **"The port is busy"** | Close MakeCode, other tabs of this game, Arduino IDE, PuTTY or any serial monitor — only one program can open the port. |
| **"Port open but the receiver is silent"** | The USB board isn't running `shir-receiver.hex`. Re-flash it, unplug and replug. |
| **LEFT/RIGHT "Not heard yet"** | Battery pack switched on? Board shows L/R? Fresh batteries? Was it flashed with the hand firmware? |
| **"Signal lost"** | Batteries low, or you're too far away / body blocking the antenna. Stay within ~5 m of the receiver. |
| **Punches don't register** | Raise the sensitivity, punch with a short sharp snap rather than a slow push, recalibrate while holding still. |
| **Random punches while standing** | Lower the sensitivity, recalibrate while holding the boards really still, hold the boards firmly so they don't wobble. |
| **Left and right are swapped** | The boards are in the wrong hands — the board showing **L** goes in the left hand. |
| **Two people with micro:bits nearby interfere** | Change `RADIO_GROUP = 73` to another number (0–255) in **all three** `main.ts` files and re-flash. |

### Safety
Punch the air only — never a wall, screen or person. Clear a space of at least 1.5 m around you, keep a firm grip (or use a strap), and take breaks. The game never requires very fast movement; strength is clamped so a relaxed, snappy jab is enough.
