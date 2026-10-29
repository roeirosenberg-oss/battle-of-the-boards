/**
 * BATTLE OF THE BOARDS — TILT HAND CONTROLLER (RIGHT)
 * ====================================================
 * Shows "R" on the LEDs.  Tilt the board to the LEFT  ->  RIGHT glove punches.
 *
 * The ONLY differences between the left and right programs are HAND and
 * TILT_SIGN below. Works with the game's original receiver (shir-receiver.hex).
 *
 * Radio messages (same protocol the game already understands):
 *   P,<hand>,<strength>,<seq>     punch (sent twice)
 *   H,<hand>,<threshold>,<seq>    heartbeat every 400 ms
 *   K,<hand>,<threshold>,<noise>  calibration finished
 *   M,<hand>,<level>              live motion level (debug stream)
 * The game's "sensitivity" (700..2600 mg) is turned into a tilt angle:
 *   angle = threshold / 40   ->  700 = 17 deg (most sensitive) ... 2600 = 65 deg
 *
 * Buttons: A = smaller tilt needed, B = bigger tilt needed, A+B = recalibrate
 */

// ======== BOARD IDENTITY ========
const HAND: string = "R"
const TILT_SIGN = -1   // RIGHT hand punches when tilted LEFT. If it is backwards, change to 1.
// ================================

const RADIO_GROUP = 73
const MIN_THRESHOLD = 600
const MAX_THRESHOLD = 3000
const DEFAULT_THRESHOLD = 1300   // = 32 degrees of tilt
const COOLDOWN_MS = 200
const SAMPLE_MS = 15

let threshold = DEFAULT_THRESHOLD
let seq = 0
let armed = true
let liveStream = false
let busy = false
let offset = 0            // roll angle when held "level" (set by calibration)
let lastPunchTime = -10000
let flashOff = 0

radio.setGroup(RADIO_GROUP)
radio.setTransmitPower(7)
radio.setFrequencyBand(7)

function showIdentity() {
    basic.showString(HAND, 0)
}

function clampInt(v: number, lo: number, hi: number): number {
    if (v < lo) return lo
    if (v > hi) return hi
    return Math.round(v)
}

function tiltAngle(): number {
    return threshold / 40
}

// how far the board is tilted in this hand's punch direction (degrees)
function tilt(): number {
    return (input.rotation(Rotation.Roll) - offset) * TILT_SIGN
}

function sendHeartbeat() {
    radio.sendString("H," + HAND + "," + threshold + "," + seq)
}

function setThreshold(v: number) {
    threshold = clampInt(v, MIN_THRESHOLD, MAX_THRESHOLD)
    sendHeartbeat()
}

function calibrate() {
    busy = true
    basic.showIcon(IconNames.Target, 0)
    basic.pause(400)
    let sum = 0
    let lo = 999
    let hi = -999
    for (let i = 0; i < 60; i++) {
        const r = input.rotation(Rotation.Roll)
        sum += r
        if (r < lo) lo = r
        if (r > hi) hi = r
        basic.pause(SAMPLE_MS)
    }
    offset = sum / 60
    const noise = clampInt((hi - lo) * 10, 10, 150)
    armed = true
    radio.sendString("K," + HAND + "," + threshold + "," + noise)
    basic.showIcon(IconNames.Yes, 0)
    basic.pause(300)
    showIdentity()
    busy = false
}

function punch(peakDeg: number) {
    seq = (seq + 1) % 10000
    // bigger tilt past the trigger angle = stronger punch
    const strength = clampInt(1200 + (peakDeg - tiltAngle()) * 45, 1100, 3200)
    const msg = "P," + HAND + "," + strength + "," + seq
    radio.sendString(msg)
    basic.pause(4)
    radio.sendString(msg)
    // feedback: light the two corners on this hand's side
    const x = HAND == "R" ? 4 : 0
    led.plot(x, 0)
    led.plot(x, 4)
    flashOff = input.runningTime() + 150
}

// ---------------- tilt detection ----------------
control.inBackground(function () {
    let lastLive = 0
    while (true) {
        if (busy) {
            basic.pause(50)
            continue
        }
        const now = input.runningTime()
        const t = tilt()

        if (armed && t > tiltAngle() && now - lastPunchTime > COOLDOWN_MS) {
            // follow the tilt for a moment to see how far it goes
            let peak = t
            const start = input.runningTime()
            while (input.runningTime() - start < 90) {
                basic.pause(SAMPLE_MS)
                const t2 = tilt()
                if (t2 > peak) peak = t2
            }
            armed = false
            lastPunchTime = input.runningTime()
            punch(peak)
        } else if (!armed && t < tiltAngle() * 0.5) {
            armed = true   // tilt back toward level before the next punch
        }

        if (flashOff > 0 && now > flashOff) {
            flashOff = 0
            showIdentity()
        }

        if (liveStream && now - lastLive > 100) {
            lastLive = now
            radio.sendString("M," + HAND + "," + clampInt(Math.max(0, t) * 40, 0, 8000))
        }
        basic.pause(SAMPLE_MS)
    }
})

// ---------------- heartbeat ----------------
control.inBackground(function () {
    while (true) {
        if (!busy) sendHeartbeat()
        basic.pause(400)
    }
})

// ---------------- commands from the game (via receiver) ----------------
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
input.onButtonPressed(Button.A, function () {   // smaller tilt needed
    setThreshold(threshold - 200)
    showIdentity()
})
input.onButtonPressed(Button.B, function () {   // bigger tilt needed
    setThreshold(threshold + 200)
    showIdentity()
})
input.onButtonPressed(Button.AB, function () {
    control.inBackground(function () { calibrate() })
})

// ---------------- startup ----------------
showIdentity()
basic.pause(600)
calibrate()
