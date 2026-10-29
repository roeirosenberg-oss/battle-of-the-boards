/**
 * BATTLE OF THE BOARDS — HAND CONTROLLER FIRMWARE
 * =====================================================
 * Board role : RIGHT HAND controller (micro:bit V2, battery powered)
 *
 * The ONLY difference between the left-hand and right-hand firmware is the
 * HAND constant below. Everything else is identical.
 *
 * How punch detection works (accelerometer only — no position tracking):
 *   1. Read X/Y/Z acceleration (milli-g) at ~50 Hz with the ±8 g range.
 *   2. Track gravity with a slow low-pass filter; subtract it to get
 *      "linear" acceleration (the part caused by moving your hand).
 *   3. A punch = linear acceleration magnitude crosses THRESHOLD *sharply*
 *      (it must have been calm in the previous ~100 ms), while ARMED.
 *   4. We keep sampling for a short window to find the PEAK (= strength).
 *   5. Then a cooldown, and the signal must drop back to a calm level before
 *      the detector re-arms. This stops one punch counting twice and stops
 *      slow, ordinary hand movement from triggering anything.
 *
 * Radio messages (max 19 chars, comma-separated):
 *   P,<hand>,<strength>,<seq>     punch event (sent twice for redundancy)
 *   H,<hand>,<threshold>,<seq>    heartbeat every 400 ms
 *   K,<hand>,<threshold>,<noise>  calibration finished
 *   M,<hand>,<magnitude>          live motion level (only in debug-stream mode)
 * Commands received from the receiver (forwarded from the browser):
 *   C,SENS,<threshold>            set threshold in milli-g (both hands)
 *   C,SENS,<L|R>,<threshold>      set threshold for one hand
 *   C,CAL                         recalibrate (hold still for 1.5 s)
 *   C,LIVE,<0|1>                  stream live motion level on/off
 *   C,ID                          flash the hand letter (identify the board)
 *
 * Buttons on this board:
 *   A        = more sensitive (lower threshold by 100 mg)
 *   B        = less sensitive (raise threshold by 100 mg)
 *   A + B    = calibrate (hold the board still in boxing stance)
 *   Logo     = show current threshold (hundreds of mg)
 */

// ======== BOARD IDENTITY — the ONLY line that differs between L and R ========
const HAND: string = "R"
// ============================================================================

const RADIO_GROUP = 73          // must match receiver + other hand
const MIN_THRESHOLD = 600       // mg
const MAX_THRESHOLD = 3000      // mg
const DEFAULT_THRESHOLD = 1300  // mg of linear acceleration
const PEAK_WINDOW_MS = 90       // look for the peak this long after trigger
const COOLDOWN_MS = 220         // minimum time between two punches
const ONSET_MS = 120            // signal must have been calm this recently
const SAMPLE_MS = 15

let threshold = DEFAULT_THRESHOLD
let noiseLevel = 0
let seq = 0
let armed = true
let liveStream = false
let busyCalibrating = false

// gravity estimate (low-pass filtered), milli-g
let gx = 0
let gy = 0
let gz = -1000
let lastCalmTime = 0
let lastPunchTime = -10000

radio.setGroup(RADIO_GROUP)
radio.setTransmitPower(7)
radio.setFrequencyBand(7)
input.setAccelerometerRange(AcceleratorRange.EightG)

function showIdentity() {
    basic.showString(HAND, 0)
}

function clampInt(v: number, lo: number, hi: number): number {
    if (v < lo) return lo
    if (v > hi) return hi
    return Math.round(v)
}

function setThreshold(v: number) {
    threshold = clampInt(v, MIN_THRESHOLD, MAX_THRESHOLD)
    sendHeartbeat()
}

function sendHeartbeat() {
    radio.sendString("H," + HAND + "," + threshold + "," + seq)
}

function calibrate() {
    busyCalibrating = true
    basic.showIcon(IconNames.Target, 0)
    // let the user settle
    basic.pause(400)
    // 1) gravity: average over ~0.75 s
    let sx = 0
    let sy = 0
    let sz = 0
    let n = 0
    for (let i = 0; i < 50; i++) {
        sx += input.acceleration(Dimension.X)
        sy += input.acceleration(Dimension.Y)
        sz += input.acceleration(Dimension.Z)
        n++
        basic.pause(SAMPLE_MS)
    }
    gx = sx / n
    gy = sy / n
    gz = sz / n
    // 2) noise: largest deviation from gravity while holding "still"
    let maxDev = 0
    for (let j = 0; j < 50; j++) {
        const dx = input.acceleration(Dimension.X) - gx
        const dy = input.acceleration(Dimension.Y) - gy
        const dz = input.acceleration(Dimension.Z) - gz
        const m = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (m > maxDev) maxDev = m
        basic.pause(SAMPLE_MS)
    }
    noiseLevel = Math.round(maxDev)
    // threshold must sit well above hand tremor, but stay reachable
    const suggested = Math.max(DEFAULT_THRESHOLD, noiseLevel * 6)
    threshold = clampInt(suggested, MIN_THRESHOLD, MAX_THRESHOLD)
    armed = true
    lastCalmTime = input.runningTime()
    radio.sendString("K," + HAND + "," + threshold + "," + noiseLevel)
    basic.showIcon(IconNames.Yes, 0)
    basic.pause(300)
    showIdentity()
    busyCalibrating = false
}

function punchDetected(peak: number) {
    seq = (seq + 1) % 10000
    const strength = clampInt(peak, 0, 8000)
    const msg = "P," + HAND + "," + strength + "," + seq
    // send twice — the receiver and browser drop the duplicate by seq number;
    // this survives a single lost radio packet
    radio.sendString(msg)
    basic.pause(4)
    radio.sendString(msg)
    // quick visual feedback on the board
    led.plotBrightness(2, 2, 255)
    if (HAND == "R") {
        led.plot(4, 0); led.plot(4, 4)
    } else {
        led.plot(0, 0); led.plot(0, 4)
    }
}

// ---------------- detection loop ----------------
control.inBackground(function () {
    let lastLive = 0
    while (true) {
        if (busyCalibrating) {
            basic.pause(50)
            continue
        }
        const now = input.runningTime()
        const ax = input.acceleration(Dimension.X)
        const ay = input.acceleration(Dimension.Y)
        const az = input.acceleration(Dimension.Z)

        // linear acceleration = raw - gravity
        const lx = ax - gx
        const ly = ay - gy
        const lz = az - gz
        const mag = Math.sqrt(lx * lx + ly * ly + lz * lz)

        // update gravity only slowly, and almost not at all during fast motion
        const alpha = mag < threshold * 0.35 ? 0.06 : 0.005
        gx += (ax - gx) * alpha
        gy += (ay - gy) * alpha
        gz += (az - gz) * alpha

        const calmLevel = Math.max(threshold * 0.45, noiseLevel * 2)
        if (mag < calmLevel) {
            lastCalmTime = now
            // re-arm once the hand has settled after the cooldown
            if (!armed && now - lastPunchTime > COOLDOWN_MS) {
                armed = true
                showIdentity()
            }
        }

        const sharpOnset = now - lastCalmTime <= ONSET_MS
        if (armed && mag > threshold && sharpOnset && now - lastPunchTime > COOLDOWN_MS) {
            // find the peak during a short window
            let peak = mag
            const start = input.runningTime()
            while (input.runningTime() - start < PEAK_WINDOW_MS) {
                basic.pause(SAMPLE_MS)
                const bx = input.acceleration(Dimension.X) - gx
                const by = input.acceleration(Dimension.Y) - gy
                const bz = input.acceleration(Dimension.Z) - gz
                const m2 = Math.sqrt(bx * bx + by * by + bz * bz)
                if (m2 > peak) peak = m2
            }
            armed = false
            lastPunchTime = input.runningTime()
            punchDetected(peak)
        }

        if (liveStream && now - lastLive > 100) {
            lastLive = now
            radio.sendString("M," + HAND + "," + Math.round(mag))
        }
        basic.pause(SAMPLE_MS)
    }
})

// ---------------- heartbeat ----------------
control.inBackground(function () {
    while (true) {
        if (!busyCalibrating) sendHeartbeat()
        basic.pause(400)
    }
})

// ---------------- commands from the browser (via receiver) ----------------
radio.onReceivedString(function (s: string) {
    const parts = s.split(",")
    if (parts.length < 2 || parts[0] != "C") return
    const cmd = parts[1]
    if (cmd == "SENS") {
        if (parts.length == 3) {
            setThreshold(parseInt(parts[2]))
        } else if (parts.length == 4 && parts[2] == HAND) {
            setThreshold(parseInt(parts[3]))
        }
    } else if (cmd == "CAL") {
        if (parts.length == 2 || parts[2] == HAND) {
            control.inBackground(function () { calibrate() })
        }
    } else if (cmd == "LIVE") {
        liveStream = parts.length >= 3 && parts[2] == "1"
    } else if (cmd == "ID") {
        control.inBackground(function () {
            for (let i = 0; i < 3; i++) {
                basic.clearScreen(); basic.pause(120); showIdentity(); basic.pause(180)
            }
        })
    }
})

// ---------------- buttons ----------------
input.onButtonPressed(Button.A, function () {
    setThreshold(threshold - 100)
    basic.showNumber(Math.round(threshold / 100), 60)
    showIdentity()
})
input.onButtonPressed(Button.B, function () {
    setThreshold(threshold + 100)
    basic.showNumber(Math.round(threshold / 100), 60)
    showIdentity()
})
input.onButtonPressed(Button.AB, function () {
    control.inBackground(function () { calibrate() })
})
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    basic.showNumber(Math.round(threshold / 100), 60)
    showIdentity()
})

// ---------------- startup ----------------
showIdentity()
basic.pause(600)
calibrate()
