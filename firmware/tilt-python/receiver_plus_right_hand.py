# =====================================================================
#  BATTLE OF THE BOARDS - RECEIVER + RIGHT HAND  (on the USB cable)
#  Shows "R". This board is BOTH the receiver and the right-hand controller:
#    - tilt THIS board to the LEFT  ->  RIGHT glove punches
#    - it receives the LEFT hand board by radio (group 73)
#  and sends one JSON line per event to the game over USB (115200 baud).
#  Uses MakeCode-compatible radio packets, so it also works with the
#  game's original MakeCode hand boards.
# =====================================================================
from microbit import *
import radio
import math

RADIO_GROUP = 73

U_IMAGE = "R"                 # this board is the right hand (display.show("R"))

# ---------- built-in right hand ----------
R_TILT_SIGN = -1              # punch when tilted LEFT. If backwards, change to 1.
r_threshold = 1300            # game units: tilt angle = threshold / 40 (1300 = 32 deg)
r_offset = 0
r_seq = 0
r_armed = True
r_last_punch = -10000
r_last_hb = 0
r_live = False
r_last_live = 0

pkt = {"L": 0, "R": 0}
last_seq = {"L": -1, "R": -1}
last_status = 0
flash_until = 0
cmd_buffer = ""


# ---------- MakeCode-compatible radio strings ----------
def mc_send(s):
    # [CODAL header: version 1, group, protocol 1] + [MakeCode string packet:
    #  type 2, time (4 bytes), serial (4 bytes), length, text]
    b = s.encode()[:19]
    t = running_time()
    radio.send_bytes(bytes([1, RADIO_GROUP, 1,
                            2, t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255,
                            1, 0, 0, 0, len(b)]) + b)


def mc_receive():
    # returns (text, rssi) or None
    full = radio.receive_full()
    if not full:
        return None
    data, rssi, _ = full
    try:
        # first 3 bytes = CODAL header (version, group, protocol)
        p = data[3:]
        if len(p) >= 10 and p[0] == 2:          # MakeCode string packet
            n = p[9]
            return (str(bytes(p[10:10 + n]), "utf8"), rssi)
        return (str(bytes(p), "utf8"), rssi)    # MicroPython radio.send() text
    except Exception:
        pass
    return ("", rssi)


def send_line(s):
    print(s)


def hand_name(h):
    return "LEFT" if h == "L" else "RIGHT"


def send_status():
    global last_status
    send_line('{"event":"RECEIVER","status":"READY","group":%d,"uptime":%d,"pktL":%d,"pktR":%d}'
              % (RADIO_GROUP, running_time(), pkt["L"], pkt["R"]))
    last_status = running_time()


def flash_column(h):
    global flash_until
    x = 0 if h == "L" else 4
    for y in range(5):
        display.set_pixel(x, y, 9)
    flash_until = running_time() + 100


def handle_radio(s, rssi):
    p = s.split(",")
    if len(p) < 3:
        return
    kind, h = p[0], p[1]
    if h != "L":                        # right hand is built into this board
        return
    pkt[h] += 1
    name = hand_name(h)
    if kind == "P" and len(p) >= 4:
        seq = int(p[3])
        if seq == last_seq[h]:
            return                      # second copy of the same punch
        last_seq[h] = seq
        send_line('{"hand":"%s","event":"PUNCH","strength":%d,"seq":%d,"rssi":%d}'
                  % (name, int(p[2]), seq, rssi))
        flash_column(h)
    elif kind == "H" and len(p) >= 4:
        send_line('{"hand":"%s","event":"HEARTBEAT","threshold":%d,"seq":%d,"rssi":%d}'
                  % (name, int(p[2]), int(p[3]), rssi))
    elif kind == "K" and len(p) >= 4:
        send_line('{"hand":"%s","event":"CALIBRATED","threshold":%d,"noise":%d}'
                  % (name, int(p[2]), int(p[3])))
    elif kind == "M":
        send_line('{"hand":"%s","event":"MOTION","mag":%d}' % (name, int(p[2])))


def r_roll():
    return math.degrees(math.atan2(accelerometer.get_x(), -accelerometer.get_z()))


def r_tilt():
    return (r_roll() - r_offset) * R_TILT_SIGN


def r_calibrate():
    global r_offset, r_armed
    display.show(Image.TARGET)
    sleep(400)
    total = 0
    lo = 999
    hi = -999
    for i in range(60):
        v = r_roll()
        total += v
        lo = min(lo, v)
        hi = max(hi, v)
        sleep(15)
    r_offset = total / 60
    r_armed = True
    send_line('{"hand":"RIGHT","event":"CALIBRATED","threshold":%d,"noise":%d}'
              % (r_threshold, max(10, min(150, int((hi - lo) * 10)))))
    display.show(Image.YES)
    sleep(300)
    display.show(U_IMAGE)


def r_set_threshold(v):
    global r_threshold
    r_threshold = max(600, min(3000, int(v)))


def r_update(now):
    global r_seq, r_armed, r_last_punch, r_last_hb, r_last_live
    t = r_tilt()
    angle = r_threshold / 40
    if r_armed and t > angle and now - r_last_punch > 200:
        peak = t
        end = running_time() + 90
        while running_time() < end:
            sleep(15)
            peak = max(peak, r_tilt())
        r_seq = (r_seq + 1) % 10000
        strength = int(max(1100, min(3200, 1200 + (peak - angle) * 45)))
        send_line('{"hand":"RIGHT","event":"PUNCH","strength":%d,"seq":%d,"rssi":-30}'
                  % (strength, r_seq))
        flash_column("R")
        r_armed = False
        r_last_punch = running_time()
    elif not r_armed and t < angle * 0.5:
        r_armed = True
    if now - r_last_hb > 400:
        r_last_hb = now
        send_line('{"hand":"RIGHT","event":"HEARTBEAT","threshold":%d,"seq":%d,"rssi":-30}'
                  % (r_threshold, r_seq))
    if r_live and now - r_last_live > 100:
        r_last_live = now
        send_line('{"hand":"RIGHT","event":"MOTION","mag":%d}' % int(max(0, t) * 40))


def handle_command(line):
    global r_live
    # from the game: SENS <mg> | SENS L|R <mg> | CAL | CAL L|R | LIVE 0|1 | ID | PING
    p = line.strip().upper().split()
    if not p:
        return
    cmd = p[0]
    if cmd == "PING":
        send_line('{"event":"PONG","group":%d}' % RADIO_GROUP)
    elif cmd == "SENS" and len(p) == 2:
        r_set_threshold(int(p[1]))
        mc_send("C,SENS," + p[1])
    elif cmd == "SENS" and len(p) == 3:
        if p[1] == "R":
            r_set_threshold(int(p[2]))
        else:
            mc_send("C,SENS," + p[1] + "," + p[2])
    elif cmd == "CAL":
        if len(p) < 2 or p[1] == "R":
            r_calibrate()
        if len(p) < 2 or p[1] == "L":
            mc_send("C,CAL,L")
    elif cmd == "LIVE" and len(p) >= 2:
        r_live = p[1] == "1"
        mc_send("C,LIVE," + p[1])
    elif cmd == "ID":
        mc_send("C,ID")
        for i in range(3):
            display.clear()
            sleep(120)
            display.show(U_IMAGE)
            sleep(180)


# ---------- startup ----------
radio.config(group=RADIO_GROUP, power=7, length=32, queue=10)
radio.on()
display.show(U_IMAGE)
send_status()
sleep(500)
r_calibrate()

# ---------- main loop ----------
while True:
    try:
        msg = mc_receive()
        while msg:
            if msg[0]:
                handle_radio(msg[0], msg[1])
            msg = mc_receive()

        if uart.any():
            data = uart.read()
            if data:
                cmd_buffer += str(data, "utf8")
                while "\n" in cmd_buffer:
                    line, cmd_buffer = cmd_buffer.split("\n", 1)
                    handle_command(line)
                if len(cmd_buffer) > 100:
                    cmd_buffer = ""

        now = running_time()
        r_update(now)
        if button_a.was_pressed():
            r_set_threshold(r_threshold - 200)
        if button_b.was_pressed():
            r_set_threshold(r_threshold + 200)
        if flash_until and now > flash_until:
            display.show(U_IMAGE)
            flash_until = 0
        if now - last_status > 1000:
            send_status()
    except Exception as e:
        cmd_buffer = ""
        display.show("E")
        sleep(200)
        display.show(U_IMAGE)
    sleep(5)
