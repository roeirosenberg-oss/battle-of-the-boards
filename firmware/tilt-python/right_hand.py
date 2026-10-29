# =====================================================================
#  BATTLE OF THE BOARDS - RIGHT HAND controller (battery micro:bit)
#  Shows "R". Tilt the board to the LEFT  ->  RIGHT glove punches.
#  Uses MakeCode-compatible radio packets, so it works with the game's
#  receiver (Python or the original MakeCode one).
#  Buttons: A = smaller tilt needed, B = bigger tilt needed, A+B = recalibrate
# =====================================================================
from microbit import *
import radio
import math

HAND = "R"
TILT_SIGN = -1        # RIGHT hand punches when tilted LEFT. If backwards, change to 1.
RADIO_GROUP = 73

threshold = 1300      # game sensitivity units: angle = threshold / 40  (1300 = 32 degrees)
offset = 0            # sideways angle when held level (set by calibration)
seq = 0
armed = True
live = False
last_punch = -10000
last_heartbeat = 0
last_live = 0
flash_until = 0


# ---------- MakeCode-compatible radio strings ----------
def mc_send(s):
    b = s.encode()[:19]
    t = running_time()
    radio.send_bytes(bytes([1, RADIO_GROUP, 1,
                            2, t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255,
                            1, 0, 0, 0, len(b)]) + b)


def mc_receive():
    data = radio.receive_bytes()
    if not data:
        return None
    try:
        p = data[3:]
        if len(p) >= 10 and p[0] == 2:
            return str(bytes(p[10:10 + p[9]]), "utf8")
        return str(bytes(p), "utf8")
    except Exception:
        return ""


# ---------- helpers ----------
def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def tilt_angle():
    return threshold / 40


def roll():
    # sideways tilt in degrees: 0 = flat, + = tilted right, - = tilted left
    return math.degrees(math.atan2(accelerometer.get_x(), -accelerometer.get_z()))


def tilt():
    return (roll() - offset) * TILT_SIGN


def show_letter():
    display.show(HAND)


def send_heartbeat():
    global last_heartbeat
    mc_send("H,%s,%d,%d" % (HAND, threshold, seq))
    last_heartbeat = running_time()


def set_threshold(v):
    global threshold
    threshold = int(clamp(v, 600, 3000))
    send_heartbeat()


def calibrate():
    global offset, armed
    display.show(Image.TARGET)
    sleep(400)
    total = 0
    lo = 999
    hi = -999
    for i in range(60):
        r = roll()
        total += r
        lo = min(lo, r)
        hi = max(hi, r)
        sleep(15)
    offset = total / 60
    noise = int(clamp((hi - lo) * 10, 10, 150))
    armed = True
    mc_send("K,%s,%d,%d" % (HAND, threshold, noise))
    display.show(Image.YES)
    sleep(300)
    show_letter()


def identify():
    for i in range(3):
        display.clear()
        sleep(120)
        show_letter()
        sleep(180)


def handle_command(s):
    global live
    p = s.split(",")
    if len(p) < 2 or p[0] != "C":
        return
    cmd = p[1]
    if cmd == "SENS":
        if len(p) == 3:
            set_threshold(int(p[2]))
        elif len(p) == 4 and p[2] == HAND:
            set_threshold(int(p[3]))
    elif cmd == "CAL":
        if len(p) == 2 or p[2] == HAND:
            calibrate()
    elif cmd == "LIVE":
        live = len(p) >= 3 and p[2] == "1"
    elif cmd == "ID":
        identify()


def punch(peak):
    global seq, armed, last_punch, flash_until
    seq = (seq + 1) % 10000
    strength = int(clamp(1200 + (peak - tilt_angle()) * 45, 1100, 3200))
    msg = "P,%s,%d,%d" % (HAND, strength, seq)
    mc_send(msg)          # sent twice so one lost packet doesn't lose the punch
    sleep(4)
    mc_send(msg)
    armed = False
    last_punch = running_time()
    x = 4 if HAND == "R" else 0
    display.set_pixel(x, 0, 9)
    display.set_pixel(x, 4, 9)
    flash_until = last_punch + 150


# ---------- startup ----------
radio.config(group=RADIO_GROUP, power=7, length=32, queue=10)
radio.on()
show_letter()
sleep(600)
calibrate()

# ---------- main loop ----------
while True:
    now = running_time()

    msg = mc_receive()
    while msg is not None:
        if msg:
            handle_command(msg)
        msg = mc_receive()

    if button_a.is_pressed() and button_b.is_pressed():
        button_a.was_pressed()
        button_b.was_pressed()
        calibrate()
    elif button_a.was_pressed():
        set_threshold(threshold - 200)
    elif button_b.was_pressed():
        set_threshold(threshold + 200)

    t = tilt()
    if armed and t > tilt_angle() and now - last_punch > 200:
        peak = t
        end = running_time() + 90
        while running_time() < end:
            sleep(15)
            peak = max(peak, tilt())
        punch(peak)
    elif not armed and t < tilt_angle() * 0.5:
        armed = True          # tilt back toward level before the next punch

    if flash_until and now > flash_until:
        flash_until = 0
        show_letter()

    if live and now - last_live > 100:
        last_live = now
        mc_send("M,%s,%d" % (HAND, int(clamp(max(0, t) * 40, 0, 8000))))

    if now - last_heartbeat > 400:
        send_heartbeat()

    sleep(15)
