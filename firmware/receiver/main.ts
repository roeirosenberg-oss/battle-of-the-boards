/**
 * BATTLE OF THE BOARDS — USB RECEIVER FIRMWARE
 * ==================================================
 * Board role : USB receiver (micro:bit V2 plugged into the computer by USB)
 *
 * - Listens on radio group 73 for the LEFT and RIGHT hand controllers.
 * - Drops duplicate punch packets (each punch is transmitted twice).
 * - Writes one JSON object per line to USB serial (115200 baud), e.g.
 *     {"hand":"RIGHT","event":"PUNCH","strength":1600,"seq":12,"rssi":-58}
 *     {"hand":"LEFT","event":"HEARTBEAT","threshold":1300,"seq":19,"rssi":-61}
 *     {"hand":"LEFT","event":"CALIBRATED","threshold":1300,"noise":140}
 *     {"hand":"RIGHT","event":"MOTION","mag":420}
 *     {"event":"RECEIVER","status":"READY","group":73,"uptime":12345}
 * - Accepts newline-terminated text commands from the browser and forwards
 *   them to the hand controllers over radio:
 *     SENS <mg>          set threshold for both hands
 *     SENS <L|R> <mg>    set threshold for one hand
 *     CAL                recalibrate both hands
 *     CAL <L|R>          recalibrate one hand
 *     LIVE <0|1>         live motion stream on/off
 *     ID                 make both hand boards flash their letter
 *     PING               receiver answers {"event":"PONG"}
 *
 * LED display: "U" = ready. Left column flashes on LEFT punches,
 * right column flashes on RIGHT punches.
 */

const RADIO_GROUP = 73

radio.setGroup(RADIO_GROUP)
radio.setTransmitPower(7)
radio.setFrequencyBand(7)
serial.redirectToUSB()
serial.setBaudRate(BaudRate.BaudRate115200)
serial.setRxBufferSize(64)

let lastSeqL = -1
let lastSeqR = -1
let packetsL = 0
let packetsR = 0

function handName(h: string): string {
    return h == "L" ? "LEFT" : "RIGHT"
}

function flash(h: string) {
    const x = h == "L" ? 0 : 4
    for (let y = 0; y < 5; y++) led.plot(x, y)
    control.inBackground(function () {
        basic.pause(90)
        for (let y = 0; y < 5; y++) led.unplot(x, y)
    })
}

radio.onReceivedString(function (s: string) {
    const rssi = radio.receivedPacket(RadioPacketProperty.SignalStrength)
    const p = s.split(",")
    if (p.length < 3) return
    const type = p[0]
    const h = p[1]
    if (h != "L" && h != "R") return
    if (h == "L") packetsL++
    else packetsR++

    if (type == "P" && p.length >= 4) {
        const strength = parseInt(p[2])
        const seq = parseInt(p[3])
        // de-duplicate the redundant second copy
        if (h == "L") {
            if (seq == lastSeqL) return
            lastSeqL = seq
        } else {
            if (seq == lastSeqR) return
            lastSeqR = seq
        }
        serial.writeLine("{\"hand\":\"" + handName(h) + "\",\"event\":\"PUNCH\",\"strength\":" + strength +
            ",\"seq\":" + seq + ",\"rssi\":" + rssi + "}")
        flash(h)
    } else if (type == "H" && p.length >= 4) {
        serial.writeLine("{\"hand\":\"" + handName(h) + "\",\"event\":\"HEARTBEAT\",\"threshold\":" + parseInt(p[2]) +
            ",\"seq\":" + parseInt(p[3]) + ",\"rssi\":" + rssi + "}")
    } else if (type == "K" && p.length >= 4) {
        serial.writeLine("{\"hand\":\"" + handName(h) + "\",\"event\":\"CALIBRATED\",\"threshold\":" + parseInt(p[2]) +
            ",\"noise\":" + parseInt(p[3]) + "}")
    } else if (type == "M") {
        serial.writeLine("{\"hand\":\"" + handName(h) + "\",\"event\":\"MOTION\",\"mag\":" + parseInt(p[2]) + "}")
    }
})

// ---------------- commands from the browser ----------------
serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let line = serial.readUntil(serial.delimiters(Delimiters.NewLine))
    line = line.trim()
    if (line.length == 0) return
    const p = line.split(" ")
    const cmd = p[0].toUpperCase()
    if (cmd == "PING") {
        serial.writeLine("{\"event\":\"PONG\",\"group\":" + RADIO_GROUP + "}")
    } else if (cmd == "SENS" && p.length == 2) {
        radio.sendString("C,SENS," + parseInt(p[1]))
        serial.writeLine("{\"event\":\"ACK\",\"cmd\":\"SENS\"}")
    } else if (cmd == "SENS" && p.length == 3) {
        radio.sendString("C,SENS," + p[1].toUpperCase() + "," + parseInt(p[2]))
        serial.writeLine("{\"event\":\"ACK\",\"cmd\":\"SENS\"}")
    } else if (cmd == "CAL") {
        if (p.length >= 2) radio.sendString("C,CAL," + p[1].toUpperCase())
        else radio.sendString("C,CAL")
        serial.writeLine("{\"event\":\"ACK\",\"cmd\":\"CAL\"}")
    } else if (cmd == "LIVE" && p.length >= 2) {
        radio.sendString("C,LIVE," + p[1])
        serial.writeLine("{\"event\":\"ACK\",\"cmd\":\"LIVE\"}")
    } else if (cmd == "ID") {
        radio.sendString("C,ID")
        serial.writeLine("{\"event\":\"ACK\",\"cmd\":\"ID\"}")
    }
})

// ---------------- receiver heartbeat ----------------
control.inBackground(function () {
    while (true) {
        serial.writeLine("{\"event\":\"RECEIVER\",\"status\":\"READY\",\"group\":" + RADIO_GROUP +
            ",\"uptime\":" + input.runningTime() + ",\"pktL\":" + packetsL + ",\"pktR\":" + packetsR + "}")
        basic.pause(1000)
    }
})

input.onButtonPressed(Button.A, function () {
    radio.sendString("C,ID")
})

basic.showString("U", 0)
