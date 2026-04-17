/**
 * @packageDocumentation
 *
 * Arduino serial device built on top of `webserial-core`.
 *
 * Provides a typed, event-driven interface for communicating with Arduino
 * boards over the Web Serial API. The connection is established through a
 * text-based handshake and all incoming messages are automatically routed to
 * strongly-typed `arduino:*` events.
 *
 * @example
 * ```ts
 * import { Arduino } from '@danidoble/webserial-arduino';
 *
 * const arduino = new Arduino([{ usbVendorId: 0x2341 }]);
 *
 * arduino.on('arduino:connected', (data) => console.log('Handshake OK:', data));
 * arduino.on('arduino:hello',     (data) => console.log('Hello:', data));
 * arduino.on('arduino:unknown',   (data) => console.warn('Unknown message:', data));
 *
 * await arduino.connect();
 * ```
 */

import { AbstractSerialDevice, delimiter } from 'webserial-core';
import type { SerialDeviceOptions, SerialPortFilter, SerialProvider } from 'webserial-core';

// ---------------------------------------------------------------------------
// Module augmentation – extends the core event map with Arduino-specific events
// ---------------------------------------------------------------------------

declare module 'webserial-core' {
  /**
   * Extends the core `SerialEventMap` with events emitted by {@link Arduino}.
   *
   * @typeParam T - Forwarded from `SerialEventMap`; ignored for Arduino events.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface SerialEventMap<T> {
    /**
     * Fired when the Arduino responds to the `CONNECT` command with
     * the string `"connected"`, confirming a successful handshake.
     *
     * @param data - The raw line received from the device.
     */
    'arduino:connected': (data: string) => void;
    /**
     * Fired when the Arduino responds to the `CREDITS` command with
     * a line containing `"created by danidoble"`.
     *
     * @param data - The raw line received from the device.
     */
    'arduino:credits': (data: string) => void;
    /**
     * Fired when the Arduino responds to the `HI` command with a line
     * containing `"hello there"`.
     *
     * @param data - The raw line received from the device.
     */
    'arduino:hello': (data: string) => void;
    /**
     * Fired when the Arduino responds to the `ARA` command with a line
     * containing `"ara ara"`.
     *
     * @param data - The raw line received from the device.
     */
    'arduino:ara': (data: string) => void;
    /**
     * Fired for any incoming line that does not match any known response
     * pattern. Useful for debugging unexpected output.
     *
     * @param data - The raw unrecognised line received from the device.
     */
    'arduino:unknown': (data: string) => void;
  }
}

// ---------------------------------------------------------------------------
// Arduino class
// ---------------------------------------------------------------------------

/**
 * Serial device driver for Arduino boards.
 *
 * Extends {@link AbstractSerialDevice} with a line-based (`\n`) text protocol,
 * a `CONNECT` handshake, and convenience commands (`CREDITS`, `HI`, `ARA`).
 * Incoming data is automatically classified and re-emitted as `arduino:*` events.
 *
 * Default serial settings: `9600 8N1`, 255-byte buffer, auto-reconnect enabled.
 *
 * @example
 * ```ts
 * const arduino = new Arduino([{ usbVendorId: 0x2341, usbProductId: 0x0043 }]);
 *
 * arduino.on('serial:connected', () => console.log('port open'));
 * arduino.on('arduino:hello',    (msg) => console.log(msg));
 *
 * await arduino.connect();
 * await arduino.sendHi(); // sends "HI\n" to the device
 * ```
 */
export class Arduino extends AbstractSerialDevice<string> {
  /**
   * Creates a new `Arduino` instance and begins listening for incoming data.
   *
   * The port is **not** opened here; call {@link connect} to initiate the
   * connection and handshake.
   *
   * @param options - Optional configuration object. All properties are optional; see
   *  the individual property descriptions for details and defaults.
   *
   * @param options.filters - One or more USB vendor/product filters used to identify
   *   the target Arduino. Passed to `navigator.serial.requestPort()` and
   *   `navigator.serial.getPorts()`.
   *
   * @param options.provider - Optional custom `SerialProvider` implementation. By default,
   *   the class uses the built-in provider that wraps the Web Serial API.
   *
   * @param options.polyfillOptions - Optional custom settings to be passed to the
   *  built-in provider when used in a polyfill environment (e.g. Node.js).
   *
   * @example
   * ```ts
   * // Match any Arduino (vendor 0x2341)
   * const arduino = new Arduino([{ usbVendorId: 0x2341 }]);
   *
   * // Match a specific Uno (vendor 0x2341, product 0x0043)
   * const uno = new Arduino([{ usbVendorId: 0x2341, usbProductId: 0x0043 }]);
   * ```
   */
  constructor({
    filters = [],
    provider,
    polyfillOptions
  }: {
    filters?: SerialPortFilter[];
    provider?: SerialProvider;
    polyfillOptions?: SerialDeviceOptions<string>;
  } = {}) {
    const opts: SerialDeviceOptions<string> = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      bufferSize: 255,
      commandTimeout: 3000,
      parser: delimiter('\n'),
      autoReconnect: true,
      autoReconnectInterval: 1500,
      handshakeTimeout: 2000,
      filters
    };
    if (provider) {
      opts.provider = provider;
    }
    if (polyfillOptions) {
      Object.assign(opts, polyfillOptions);
    }
    super(opts);
    this.startListening();
  }

  // ---------------------------------------------------------------------------
  // Handshake
  // ---------------------------------------------------------------------------

  /**
   * Performs the connection handshake with the Arduino.
   *
   * Sends `"CONNECT"` to the device and waits for the next `serial:data` event.
   * Returns `true` only when the trimmed response equals `"connected"`.
   *
   * This method is called automatically by {@link connect} immediately after
   * the serial port is opened; do **not** call it manually.
   *
   * @returns A promise that resolves to `true` on a successful handshake,
   *   or `false` if the device responds with an unexpected message.
   */
  protected async handshake(): Promise<boolean> {
    await this.send('CONNECT');
    return new Promise(resolve => {
      const _h = (data: string) => {
        this.off('serial:data', _h);
        resolve(String(data).trim() === 'connected');
      };
      this.on('serial:data', _h);
    });
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /**
   * Sends the `"CREDITS"` command to the Arduino.
   *
   * The device is expected to respond with a line containing
   * `"created by danidoble"`, which triggers the `arduino:credits` event.
   *
   * @returns A promise that resolves once the command has been written to the
   *   serial port (does **not** wait for the device response).
   */
  public sendCredits(): Promise<void> {
    return this.send('CREDITS');
  }

  /**
   * Sends the `"HI"` command to the Arduino.
   *
   * The device is expected to respond with a line containing `"hello there"`,
   * which triggers the `arduino:hello` event.
   *
   * @returns A promise that resolves once the command has been written to the
   *   serial port (does **not** wait for the device response).
   */
  public sendHi(): Promise<void> {
    return this.send('HI');
  }

  /**
   * Sends the `"ARA"` command to the Arduino.
   *
   * The device is expected to respond with a line containing `"ara ara"`,
   * which triggers the `arduino:ara` event.
   *
   * @returns A promise that resolves once the command has been written to the
   *   serial port (does **not** wait for the device response).
   */
  public sendAra(): Promise<void> {
    return this.send('ARA');
  }

  /**
   * Sends `CREDITS`, `ARA`, and `HI` commands concurrently.
   *
   * All three commands are dispatched in parallel via `Promise.all`.
   *
   * @returns A promise that resolves once all three commands have been written
   *   to the serial port.
   */
  public async doSomething(): Promise<void> {
    await Promise.all([this.sendCredits(), this.sendAra(), this.sendHi()]);
  }

  // ---------------------------------------------------------------------------
  // Internal – data routing
  // ---------------------------------------------------------------------------

  /**
   * Subscribes to `serial:data` and routes each incoming line to the
   * appropriate `arduino:*` event based on its content.
   *
   * Called once during construction. Multiple patterns can match a single
   * line (e.g. a line containing both `"connected"` and `"created by danidoble"`
   * would emit both `arduino:connected` and `arduino:credits`).
   * Lines that match no pattern emit `arduino:unknown`.
   */
  private startListening(): void {
    this.on('serial:data', (data: string) => {
      if(String(data).trim() === '') {
        return; // ignore empty lines
      }

      let emitted = false;

      if (String(data).includes('connected')) {
        emitted = true;
        this.emit('arduino:connected', data);
      }
      if (String(data).includes('created by danidoble')) {
        emitted = true;
        this.emit('arduino:credits', data);
      }
      if (String(data).includes('hello there')) {
        emitted = true;
        this.emit('arduino:hello', data);
      }
      if (String(data).includes('ara ara')) {
        emitted = true;
        this.emit('arduino:ara', data);
      }

      if (!emitted) {
        this.emit('arduino:unknown', data);
      }
    });
  }
}
