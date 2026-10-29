// Web Serial connection to the USB receiver micro:bit.
// Status is only ever reported as "connected" after a real port has been opened.
import { Emitter } from '../core/events.js';

const MICROBIT_USB_VENDOR = 0x0d28; // Arm DAPLink (BBC micro:bit)
const BAUD = 115200;

export class SerialConnection extends Emitter {
  constructor() {
    super();
    this.supported = 'serial' in navigator;
    this.port = null;
    this.reader = null;
    this.status = this.supported ? 'disconnected' : 'unsupported';
    this.message = this.supported
      ? 'Not connected. Plug in the receiver micro:bit and press "Connect micro:bit Receiver".'
      : (window.isSecureContext
        ? 'This browser has no Web Serial support. Use desktop Google Chrome or Microsoft Edge.'
        : 'Web Serial needs a secure page. Open the game from http://localhost (see README), not from a file:// path.');
    this._userClosed = false;
    this._buffer = '';
    this._lastByteAt = 0;
    this.bytesIn = 0;
    this.linesIn = 0;

    if (this.supported) {
      navigator.serial.addEventListener('disconnect', (e) => {
        if (this.port && e.target === this.port) this._handleLost('The receiver was unplugged.');
      });
      navigator.serial.addEventListener('connect', (e) => {
        // A previously-authorised micro:bit was plugged back in → reconnect automatically.
        if (this.status !== 'connected' && !this._userClosed) {
          const info = e.target.getInfo?.() || {};
          if (info.usbVendorId === MICROBIT_USB_VENDOR) {
            this._setStatus('connecting', 'Receiver plugged in again — reconnecting…');
            setTimeout(() => this._open(e.target).catch(() => {}), 600);
          }
        }
      });
    }
  }

  _setStatus(status, message) {
    this.status = status;
    if (message) this.message = message;
    this.emit('status', { status, message: this.message });
  }

  /** Try to reopen a port the user already authorised in an earlier session (no dialog). */
  async tryAutoConnect() {
    if (!this.supported) return false;
    try {
      const ports = await navigator.serial.getPorts();
      const mb = ports.find(p => (p.getInfo?.().usbVendorId) === MICROBIT_USB_VENDOR);
      if (mb) {
        this._setStatus('connecting', 'Found a previously-paired receiver — connecting…');
        await this._open(mb);
        return true;
      }
    } catch (e) {
      this._setStatus('disconnected', 'Auto-connect failed: ' + e.message + ' Press "Connect micro:bit Receiver".');
    }
    return false;
  }

  /** Must be called from a user gesture (button click). Opens the browser's port picker. */
  async requestAndConnect({ showAll = false } = {}) {
    if (!this.supported) { this._setStatus('unsupported'); return false; }
    this._userClosed = false;
    let port;
    try {
      port = await navigator.serial.requestPort(showAll ? {} : { filters: [{ usbVendorId: MICROBIT_USB_VENDOR }] });
    } catch (e) {
      if (e.name === 'NotFoundError') {
        this._setStatus('disconnected', 'No device selected. If the list was empty: check the USB cable (it must be a data cable), then try "Show all serial devices".');
      } else {
        this._setStatus('error', 'Could not open the device picker: ' + e.message);
      }
      return false;
    }
    try {
      await this._open(port);
      return true;
    } catch {
      return false;
    }
  }

  async _open(port) {
    if (this.port && this.status === 'connected') await this.disconnect(true);
    this._setStatus('connecting', 'Opening serial port…');
    try {
      await port.open({ baudRate: BAUD, bufferSize: 4096 });
    } catch (e) {
      // Already open (e.g. after hot reload) is fine; anything else is a real failure.
      if (!String(e.message).includes('already open')) {
        const busy = e.name === 'NetworkError' || e.name === 'InvalidStateError';
        this._setStatus('error', busy
          ? 'The port is busy. Close MakeCode, other browser tabs of this game, Arduino IDE or any serial monitor, then try again.'
          : 'Failed to open the port: ' + e.message);
        throw e;
      }
    }
    this.port = port;
    this._buffer = '';
    this._connectedAt = performance.now();
    this._setStatus('connected', 'USB connected. Waiting for data from the receiver…');
    this.emit('open');
    this._readLoop();
    // ask the receiver to identify itself
    setTimeout(() => this.send('PING'), 300);
  }

  async _readLoop() {
    const decoder = new TextDecoder();
    while (this.port && this.port.readable) {
      try {
        this.reader = this.port.readable.getReader();
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this.bytesIn += value.length;
            this._lastByteAt = performance.now();
            this._buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = this._buffer.indexOf('\n')) >= 0) {
              const line = this._buffer.slice(0, idx).replace(/\r$/, '');
              this._buffer = this._buffer.slice(idx + 1);
              if (line.length) { this.linesIn++; this.emit('line', line); }
            }
            if (this._buffer.length > 4096) this._buffer = ''; // garbage protection
          }
        }
      } catch (e) {
        // Framing / buffer overrun errors are recoverable; device loss is not.
        if (e.name === 'NetworkError' || e.name === 'NotFoundError' || !this.port?.readable) {
          this._handleLost('Lost the receiver: ' + e.message);
          return;
        }
        console.warn('[serial] recoverable read error', e);
      } finally {
        try { this.reader?.releaseLock(); } catch { /* ignore */ }
        this.reader = null;
      }
      if (this._userClosed) return;
    }
    if (!this._userClosed && this.status === 'connected') this._handleLost('The serial stream ended.');
  }

  _handleLost(reason) {
    const old = this.port;
    this.port = null;
    try { old?.close(); } catch { /* ignore */ }
    this._setStatus('disconnected', reason + ' Plug it back in — the game reconnects automatically, or press Connect.');
    this.emit('lost');
  }

  async send(text) {
    if (!this.port || !this.port.writable) return false;
    let writer;
    try {
      writer = this.port.writable.getWriter();
      await writer.write(new TextEncoder().encode(text + '\n'));
      return true;
    } catch (e) {
      console.warn('[serial] write failed', e);
      return false;
    } finally {
      try { writer?.releaseLock(); } catch { /* ignore */ }
    }
  }

  async disconnect(silent = false) {
    this._userClosed = !silent;
    const port = this.port;
    this.port = null;
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { await port?.close(); } catch { /* ignore */ }
    if (!silent) this._setStatus('disconnected', 'Disconnected by user.');
  }

  get secondsSinceData() {
    return this._lastByteAt ? (performance.now() - this._lastByteAt) / 1000 : Infinity;
  }
}
