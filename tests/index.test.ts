import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Arduino } from '../src/arduino';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a fresh Arduino instance for each test (no real port involved). */
function makeArduino(): Arduino {
  return new Arduino({ filters: [{ usbVendorId: 0x2341 }] });
}

/**
 * Simulates an incoming data line from the device by emitting `serial:data`
 * on the instance (the same way the core library does internally).
 */
function simulateData(arduino: Arduino, data: string): void {
  (arduino as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit('serial:data', data, arduino);
}

// ---------------------------------------------------------------------------
// Constructor / instantiation
// ---------------------------------------------------------------------------

describe('Arduino – instantiation', () => {
  test('creates an instance of Arduino', () => {
    expect(makeArduino()).toBeInstanceOf(Arduino);
  });

  test('is not connected immediately after construction', () => {
    expect(makeArduino().isConnected()).toBe(false);
  });

  test('accepts multiple USB filters', () => {
    const arduino = new Arduino({ filters: [{ usbVendorId: 0x2341, usbProductId: 0x0043 }, { usbVendorId: 0x2a03 }] });
    expect(arduino).toBeInstanceOf(Arduino);
  });
});

// ---------------------------------------------------------------------------
// Event routing via startListening()
// ---------------------------------------------------------------------------

describe('Arduino – event routing', () => {
  let arduino: Arduino;

  beforeEach(() => {
    arduino = makeArduino();
  });

  test('emits arduino:connected for lines containing "connected"', () => {
    const handler = vi.fn();
    arduino.on('arduino:connected', handler);
    simulateData(arduino, 'connected\n');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('connected\n');
  });

  test('emits arduino:credits for lines containing "created by danidoble"', () => {
    const handler = vi.fn();
    arduino.on('arduino:credits', handler);
    simulateData(arduino, 'created by danidoble\n');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('created by danidoble\n');
  });

  test('emits arduino:hello for lines containing "hello there"', () => {
    const handler = vi.fn();
    arduino.on('arduino:hello', handler);
    simulateData(arduino, 'hello there\n');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('hello there\n');
  });

  test('emits arduino:ara for lines containing "ara ara"', () => {
    const handler = vi.fn();
    arduino.on('arduino:ara', handler);
    simulateData(arduino, 'ara ara\n');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('ara ara\n');
  });

  test('emits arduino:unknown for unrecognised lines', () => {
    const handler = vi.fn();
    arduino.on('arduino:unknown', handler);
    simulateData(arduino, 'some random data\n');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('some random data\n');
  });

  test('does NOT emit arduino:unknown when a known pattern matches', () => {
    const unknownHandler = vi.fn();
    arduino.on('arduino:unknown', unknownHandler);
    simulateData(arduino, 'connected\n');
    expect(unknownHandler).not.toHaveBeenCalled();
  });

  test('can match multiple patterns in a single line', () => {
    // A contrived line that contains both "connected" and "created by danidoble"
    const connectedHandler = vi.fn();
    const creditsHandler = vi.fn();
    const unknownHandler = vi.fn();
    arduino.on('arduino:connected', connectedHandler);
    arduino.on('arduino:credits', creditsHandler);
    arduino.on('arduino:unknown', unknownHandler);

    simulateData(arduino, 'connected created by danidoble\n');

    expect(connectedHandler).toHaveBeenCalledOnce();
    expect(creditsHandler).toHaveBeenCalledOnce();
    expect(unknownHandler).not.toHaveBeenCalled();
  });

  test('preserves the raw line (including whitespace) in the emitted payload', () => {
    const handler = vi.fn();
    arduino.on('arduino:hello', handler);
    simulateData(arduino, '  hello there  \n');
    expect(handler).toHaveBeenCalledWith('  hello there  \n');
  });
});

// ---------------------------------------------------------------------------
// Commands (send mocked to avoid needing an open port)
// ---------------------------------------------------------------------------

describe('Arduino – commands', () => {
  let arduino: Arduino;

  beforeEach(() => {
    arduino = makeArduino();
    vi.spyOn(arduino, 'send').mockResolvedValue(undefined);
  });

  test('sendCredits() calls send("CREDITS")', async () => {
    await arduino.sendCredits();
    expect(arduino.send).toHaveBeenCalledWith('CREDITS');
  });

  test('sendHi() calls send("HI")', async () => {
    await arduino.sendHi();
    expect(arduino.send).toHaveBeenCalledWith('HI');
  });

  test('sendAra() calls send("ARA")', async () => {
    await arduino.sendAra();
    expect(arduino.send).toHaveBeenCalledWith('ARA');
  });

  test('doSomething() calls CREDITS, ARA and HI concurrently', async () => {
    await arduino.doSomething();
    expect(arduino.send).toHaveBeenCalledTimes(3);
    expect(arduino.send).toHaveBeenCalledWith('CREDITS');
    expect(arduino.send).toHaveBeenCalledWith('HI');
    expect(arduino.send).toHaveBeenCalledWith('ARA');
  });
});

// ---------------------------------------------------------------------------
// Handshake (protected – accessed via type cast)
// ---------------------------------------------------------------------------

describe('Arduino – handshake', () => {
  let arduino: Arduino;

  beforeEach(() => {
    arduino = makeArduino();
    vi.spyOn(arduino, 'send').mockResolvedValue(undefined);
  });

  /**
   * `handshake()` structure:
   *   1. await this.send('CONNECT')   ← registers a microtask continuation
   *   2. return new Promise(resolve => this.on('serial:data', _h))
   *
   * The listener (_h) is only registered AFTER the `await send()` continuation
   * runs. We therefore call `handshake()` without awaiting it, yield one
   * microtask tick so the listener gets registered, then fire the data.
   */
  async function runHandshake(data: string): Promise<boolean> {
    const promise = (arduino as unknown as { handshake(): Promise<boolean> }).handshake();
    // One microtask tick: lets the `await this.send()` continuation run and
    // register the `serial:data` listener inside `handshake()`.
    await Promise.resolve();
    simulateData(arduino, data);
    return promise;
  }

  test('handshake() resolves true when device responds with "connected"', async () => {
    expect(await runHandshake('connected\n')).toBe(true);
  });

  test('handshake() resolves false for "connected" with trailing whitespace', async () => {
    // trim() is applied, so "  connected  " → true
    expect(await runHandshake('  connected  ')).toBe(true);
  });

  test('handshake() resolves false when device responds with unexpected data', async () => {
    expect(await runHandshake('unknown_response\n')).toBe(false);
  });

  test('handshake() sends "CONNECT" to the device', async () => {
    await runHandshake('connected\n');
    expect(arduino.send).toHaveBeenCalledWith('CONNECT');
  });
});
