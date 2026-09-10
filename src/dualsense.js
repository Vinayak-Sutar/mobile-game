// DualSense-only extras over WebHID: lightbar colour and adaptive triggers.
//
// The standard Gamepad API cannot reach these, so we talk to the pad with raw
// HID output reports. Everything here is optional and additive — if WebHID is
// unavailable, permission is denied, or the byte layout is wrong on some
// firmware, the game plays exactly the same via gamepad.js.
//
// Report layout reference: the DualSense output report carries a common
// 47-byte payload. Over USB it is report 0x02 with the payload at offset 0;
// over Bluetooth it is report 0x31 with a leading flag byte, the same payload
// at offset 1, and a trailing CRC32.
//
// NOTE: verified against the documented layout, not against hardware — no
// DualSense was available when this was written. See probe() below.

const VENDOR_SONY = 0x054c;
const PRODUCT_DUALSENSE = 0x0ce6;
const PRODUCT_DUALSENSE_EDGE = 0x0df2;

const PAYLOAD_LEN = 47;
const BT_REPORT_LEN = 78;

export const dualsense = {
  device: null,
  connected: false,
  transport: null,      // 'usb' | 'bt'
  error: null,
};

// Current desired state; flushed to the pad when it changes.
const state = {
  lightbar: [255, 154, 77],
  playerLeds: 0b00100,      // centre LED
  rumbleWeak: 0,
  rumbleStrong: 0,
  triggerLeft: { mode: 0x00, params: [] },
  triggerRight: { mode: 0x00, params: [] },
};

let lastSend = 0;
let pending = false;

export function dualSenseSupported() {
  return typeof navigator !== 'undefined' && !!navigator.hid;
}

/** Must be called from a user gesture (WebHID requires one). */
export async function connectDualSense() {
  dualsense.error = null;
  if (!dualSenseSupported()) {
    dualsense.error = 'This browser has no WebHID. Use desktop Chrome or Edge.';
    return false;
  }
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [
        { vendorId: VENDOR_SONY, productId: PRODUCT_DUALSENSE },
        { vendorId: VENDOR_SONY, productId: PRODUCT_DUALSENSE_EDGE },
      ],
    });
    if (!devices || devices.length === 0) {
      dualsense.error = 'No controller selected.';
      return false;
    }
    const device = devices[0];
    if (!device.opened) await device.open();

    dualsense.device = device;
    dualsense.transport = detectTransport(device);
    dualsense.connected = true;

    device.addEventListener('disconnect', () => {
      dualsense.connected = false;
      dualsense.device = null;
    });

    flush(true);
    return true;
  } catch (err) {
    dualsense.error = String(err && err.message ? err.message : err);
    dualsense.connected = false;
    return false;
  }
}

function detectTransport(device) {
  const ids = new Set();
  for (const c of device.collections || []) {
    for (const r of c.outputReports || []) ids.add(r.reportId);
  }
  if (ids.has(0x02)) return 'usb';
  if (ids.has(0x31)) return 'bt';
  // Fall back on the input report size: USB uses 0x01/64, Bluetooth 0x31/78.
  return 'usb';
}

export async function disconnectDualSense() {
  const d = dualsense.device;
  if (!d) return;
  try {
    setLightbar(0, 0, 0);
    setTriggers(TRIGGER.off(), TRIGGER.off());
    await flush(true);
    await d.close();
  } catch {
    // Closing a pad that is already gone is not interesting.
  }
  dualsense.device = null;
  dualsense.connected = false;
}

// --- public setters --------------------------------------------------------

export function setLightbar(r, g, b) {
  state.lightbar = [r & 255, g & 255, b & 255];
  flush();
}

export function setPlayerLeds(mask) {
  state.playerLeds = mask & 0x1f;
  flush();
}

/** Adaptive trigger effects. Build these with the TRIGGER helpers. */
export function setTriggers(left, right) {
  if (left) state.triggerLeft = left;
  if (right) state.triggerRight = right;
  flush();
}

/**
 * Haptic rumble through HID. gamepad.js already rumbles via the Gamepad API,
 * so this is only useful if you want rumble while also driving the lightbar
 * in the same report.
 */
export function setRumble(strong, weak) {
  state.rumbleStrong = Math.round(Math.max(0, Math.min(1, strong)) * 255);
  state.rumbleWeak = Math.round(Math.max(0, Math.min(1, weak)) * 255);
  flush();
}

export const TRIGGER = {
  off: () => ({ mode: 0x00, params: [] }),
  /** Constant resistance from `position` (0-9) at `strength` (0-8). */
  feedback: (position, strength) => ({
    mode: 0x01,
    params: [clampByte(position, 0, 9), clampByte(strength, 0, 8)],
  }),
  /** Resistance between `start` and `end`, snapping past it — like a trigger pull. */
  weapon: (start, end, strength) => ({
    mode: 0x02,
    params: [clampByte(start, 2, 7), clampByte(end, 3, 8), clampByte(strength, 0, 8)],
  }),
  /** Buzzes at `frequency` Hz past `position`. */
  vibration: (position, amplitude, frequency) => ({
    mode: 0x06,
    params: [clampByte(position, 0, 9), clampByte(amplitude, 0, 8), clampByte(frequency, 0, 255)],
  }),
};

function clampByte(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v || 0))) & 255;
}

// --- report assembly -------------------------------------------------------

function buildPayload() {
  const p = new Uint8Array(PAYLOAD_LEN);

  // validFlag0: rumble + both trigger effects.
  p[0] = 0xff;
  // validFlag1: lightbar control, player indicator, mute LED.
  p[1] = 0xf7;

  p[2] = state.rumbleWeak;      // right / high-frequency motor
  p[3] = state.rumbleStrong;    // left / low-frequency motor

  p[9] = 0x10;                  // leave the internal mic alone

  p[10] = state.triggerRight.mode;
  for (let i = 0; i < state.triggerRight.params.length && i < 10; i++) {
    p[11 + i] = state.triggerRight.params[i];
  }
  p[21] = state.triggerLeft.mode;
  for (let i = 0; i < state.triggerLeft.params.length && i < 10; i++) {
    p[22 + i] = state.triggerLeft.params[i];
  }

  p[39] = 0x00;                 // validFlag2 — lightbar is gated by validFlag1
  p[41] = 0x00;                 // lightbar setup (0x02 fades out the boot blue)
  p[42] = 0x00;                 // LED brightness
  p[43] = state.playerLeds;
  p[44] = state.lightbar[0];
  p[45] = state.lightbar[1];
  p[46] = state.lightbar[2];

  return p;
}

async function flush(force = false) {
  const d = dualsense.device;
  if (!d || !dualsense.connected) return;

  const now = performance.now();
  if (!force && now - lastSend < 20) {
    // Coalesce bursts of setters into one report on the next tick.
    if (!pending) {
      pending = true;
      setTimeout(() => { pending = false; flush(true); }, 20);
    }
    return;
  }
  lastSend = now;

  const payload = buildPayload();
  try {
    if (dualsense.transport === 'bt') {
      const data = new Uint8Array(BT_REPORT_LEN);
      data[0] = 0x02;                     // enable HID output
      data.set(payload, 1);
      const crc = crc32([0xa2, 0x31, ...data.subarray(0, BT_REPORT_LEN - 4)]);
      data[BT_REPORT_LEN - 4] = crc & 0xff;
      data[BT_REPORT_LEN - 3] = (crc >>> 8) & 0xff;
      data[BT_REPORT_LEN - 2] = (crc >>> 16) & 0xff;
      data[BT_REPORT_LEN - 1] = (crc >>> 24) & 0xff;
      await d.sendReport(0x31, data);
    } else {
      await d.sendReport(0x02, payload);
    }
  } catch (err) {
    dualsense.error = String(err && err.message ? err.message : err);
  }
}

// CRC-32/ISO-HDLC, which is what the DualSense expects on Bluetooth reports.
let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Hardware check. Cycles the lightbar red -> green -> blue and puts a stiff
 * resistance on R2 for a second. Run it from the console once a pad is
 * connected: `ashfall.probeDualSense()`.
 */
export async function probe() {
  if (!dualsense.connected) return 'not connected';
  const steps = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 154, 77]];
  setTriggers(TRIGGER.off(), TRIGGER.feedback(2, 8));
  for (const [r, g, b] of steps) {
    setLightbar(r, g, b);
    await flush(true);
    await new Promise((res) => setTimeout(res, 400));
  }
  setTriggers(TRIGGER.off(), TRIGGER.off());
  await flush(true);
  return `ok (${dualsense.transport}) — did the lightbar cycle red/green/blue?`;
}
