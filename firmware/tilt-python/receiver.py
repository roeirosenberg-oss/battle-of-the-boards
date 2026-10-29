# =====================================================================
#  BATTLE OF THE BOARDS - RECEIVER  (stays plugged into the computer)
#  Shows "U". Receives the two hand boards by radio (group 73) and sends
#  one JSON line per event to the game over USB (115200 baud).
#  Uses MakeCode-compatible radio packets, so it also works with the
#  game's original MakeCode hand boards.
# =====================================================================
from microbit import *
import radio

RADIO_GROUP = 73

U_IMAGE = Image("90009:90009:90009:90009:09990")

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
    if h not in ("L", "R"):
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


def handle_command(line):
    # from the game: SENS <mg> | SENS L|R <mg> | CAL | CAL L|R | LIVE 0|1 | ID | PING
    p = line.strip().upper().split()
    if not p:
        return
    cmd = p[0]
    if cmd == "PING":
        send_line('{"event":"PONG","group":%d}' % RADIO_GROUP)
    elif cmd == "SENS" and len(p) == 2:
        mc_send("C,SENS," + p[1])
    elif cmd == "SENS" and len(p) == 3:
        mc_send("C,SENS," + p[1] + "," + p[2])
    elif cmd == "CAL":
        mc_send("C,CAL," + p[1] if len(p) >= 2 else "C,CAL")
    elif cmd == "LIVE" and len(p) >= 2:
        mc_send("C,LIVE," + p[1])
    elif cmd == "ID":
        mc_send("C,ID")


# ---------- startup ----------
radio.config(group=RADIO_GROUP, power=7, length=32, queue=10)
radio.on()
display.show(U_IMAGE)
send_status()

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
