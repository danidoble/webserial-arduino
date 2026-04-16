# @danidoble/webserial-arduino

A strongly-typed, event-driven Arduino driver built on top of [`webserial-core`](https://github.com/danidoble/webserial-core).

Handles the serial connection, handshake validation, auto-reconnect, and message routing — so you only deal with clean, typed events.

Not tied to a single transport: swap in the **WebUSB**, **Web Bluetooth**, or **WebSocket** provider from `webserial-core`, or implement your own `SerialProvider` for any platform.

[![npm version](https://img.shields.io/npm/v/@danidoble/webserial-arduino)](https://www.npmjs.com/package/@danidoble/webserial-arduino)
[![license](https://img.shields.io/npm/l/@danidoble/webserial-arduino)](./LICENSE.md)

---

## Requirements

- [`webserial-core`](https://www.npmjs.com/package/webserial-core) `^2.0.3` (peer dependency)
- A compatible transport (see [Providers](#providers)):
  - **Web Serial API** — Chrome / Edge 89+ (default, no extra setup)
  - **WebUSB** — Chrome / Edge (via `WebUsbProvider`)
  - **Web Bluetooth** — Chrome / Edge (via `createBluetoothProvider`, Nordic UART Service)
  - **WebSocket** — any environment (via `createWebSocketProvider` + a bridge server)
  - **Custom** — any platform via your own `SerialProvider` implementation

---

## Installation

```bash
# npm
npm install @danidoble/webserial-arduino webserial-core

# pnpm
pnpm add @danidoble/webserial-arduino webserial-core

# yarn
yarn add @danidoble/webserial-arduino webserial-core

# bun
bun add @danidoble/webserial-arduino webserial-core
```

> `webserial-core` is a **peer dependency** — it must be installed alongside this package.

---

## Quick start

```ts
import { Arduino } from '@danidoble/webserial-arduino';

// Filter by USB vendor ID (0x2341 = Arduino LLC)
const arduino = new Arduino({ filters: [{ usbVendorId: 0x2341 }] });

arduino.on('serial:connecting', () => console.log('Opening port…'));
arduino.on('serial:connected', () => console.log('Port open'));
arduino.on('serial:disconnected', () => console.log('Disconnected'));

arduino.on('arduino:connected', data => console.log('Handshake OK:', data));
arduino.on('arduino:hello', data => console.log('Arduino says:', data));
arduino.on('arduino:unknown', data => console.warn('Unknown message:', data));

// Opens a port picker dialog (requires a user gesture)
await arduino.connect();
```

---

## Serial settings

The constructor pre-configures the following defaults — no extra setup needed:

| Setting            | Value    |
| ------------------ | -------- |
| Baud rate          | 9600     |
| Data bits          | 8        |
| Stop bits          | 1        |
| Parity             | none     |
| Flow control       | none     |
| Buffer size        | 255 B    |
| Command timeout    | 3 000 ms |
| Auto-reconnect     | ✓        |
| Reconnect interval | 1 500 ms |
| Handshake timeout  | 2 000 ms |

---

## Providers

By default the library uses the browser's native **Web Serial API** (`navigator.serial`). You can replace this with any of the built-in providers from `webserial-core`, or write your own.

### Web Serial API (default)

No setup required — works out of the box in Chrome / Edge 89+.

```ts
import { Arduino } from '@danidoble/webserial-arduino';

const arduino = new Arduino({ filters: [{ usbVendorId: 0x2341 }] });
await arduino.connect();
```

### WebUSB (`WebUsbProvider`)

Use the **WebUSB API** as the transport. Useful for devices or platforms where the native Web Serial API is unavailable, or when targeting CP210x / vendor-specific USB chips.

```ts
import { Arduino, WebUsbProvider } from '@danidoble/webserial-arduino';

// CDC ACM device (auto-detected — same as most Arduinos)
const arduino = new Arduino({
  filters: [{ usbVendorId: 0x2341 }],
  provider: new WebUsbProvider()
});

// CP210x device (e.g. ESP32 with CP2102)
const esp = new Arduino({
  filters: [{ usbVendorId: 0x10c4 }],
  provider: new WebUsbProvider({
    usbControlInterfaceClass: 255,
    usbTransferInterfaceClass: 255
  })
});

await arduino.connect();
```

### Web Bluetooth (`createBluetoothProvider`)

Communicate over **Bluetooth Low Energy** using the Nordic UART Service (NUS). The device must expose NUS characteristics.

```ts
import { Arduino, createBluetoothProvider } from '@danidoble/webserial-arduino';

const arduino = new Arduino({
  provider: createBluetoothProvider()
});

await arduino.connect(); // shows the browser Bluetooth picker
```

### WebSocket (`createWebSocketProvider`)

Relay serial communication through a **WebSocket bridge server** — ideal for Node.js environments or remote devices. A reference bridge implementation is available in the [`webserial-core` demos](https://github.com/danidoble/webserial-core).

```ts
import { Arduino, createWebSocketProvider } from '@danidoble/webserial-arduino';

const arduino = new Arduino({
  filters: [{ usbVendorId: 0x2341 }],
  provider: createWebSocketProvider('ws://localhost:8080')
});

await arduino.connect();
```

### Global provider (`AbstractSerialDevice.setProvider`)

Set a provider once for **all** device instances instead of per-instance. Import `AbstractSerialDevice` directly from `webserial-core`:

```ts
import { AbstractSerialDevice, WebUsbProvider } from 'webserial-core';
import { Arduino } from '@danidoble/webserial-arduino';

// All Arduino instances will use WebUSB from this point on
AbstractSerialDevice.setProvider(new WebUsbProvider());

const arduino = new Arduino({ filters: [{ usbVendorId: 0x2341 }] });
await arduino.connect();
```

### Custom provider

Implement the `SerialProvider` interface to target any platform:

```ts
import type { SerialProvider, SerialPortFilter } from '@danidoble/webserial-arduino';
import { Arduino } from '@danidoble/webserial-arduino';

const myProvider: SerialProvider = {
  async requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort> {
    // return a SerialPort-compatible object
  },
  async getPorts(): Promise<SerialPort[]> {
    // return previously authorised ports
  }
};

const arduino = new Arduino({
  filters: [{ usbVendorId: 0x2341 }],
  provider: myProvider
});
```

---

## API

### `new Arduino(options?)`

| Option            | Type                  | Default | Description                                                        |
| ----------------- | --------------------- | ------- | ------------------------------------------------------------------ |
| `filters`         | `SerialPortFilter[]`  | `[]`    | USB vendor/product filters for port matching.                      |
| `provider`        | `SerialProvider`      | —       | Per-instance provider. Overrides the global static provider.       |
| `polyfillOptions` | `SerialDeviceOptions` | —       | Extra options forwarded to the provider (e.g. baud rate override). |

### `arduino.connect()`

Opens the serial port and runs the handshake. Shows a browser port-picker dialog on first connection; subsequent calls reuse the last authorised port.

```ts
await arduino.connect();
```

### `arduino.disconnect()`

Gracefully closes the port and stops auto-reconnect.

```ts
await arduino.disconnect();
```

### `arduino.sendHi()`

Sends `HI` to the device. Expected response triggers `arduino:hello`.

### `arduino.sendCredits()`

Sends `CREDITS` to the device. Expected response triggers `arduino:credits`.

### `arduino.sendAra()`

Sends `ARA` to the device. Expected response triggers `arduino:ara`.

### `arduino.doSomething()`

Sends `CREDITS`, `ARA`, and `HI` concurrently.

```ts
await arduino.doSomething();
```

### `arduino.isConnected()`

Returns `true` when the port is open and ready.

---

## Events

### Core events (from `webserial-core`)

| Event                    | Payload                           | Description                                       |
| ------------------------ | --------------------------------- | ------------------------------------------------- |
| `serial:connecting`      | `instance`                        | Port is being opened.                             |
| `serial:connected`       | `instance`                        | Port opened successfully.                         |
| `serial:disconnected`    | `instance`                        | Port closed or device unplugged.                  |
| `serial:reconnecting`    | `instance`                        | Auto-reconnect attempt in progress.               |
| `serial:data`            | `data: string`, `instance`        | Raw line received from the device.                |
| `serial:sent`            | `data: Uint8Array`, `instance`    | Raw bytes written to the port.                    |
| `serial:error`           | `error: Error`, `instance`        | An error occurred during communication.           |
| `serial:need-permission` | `instance`                        | No authorised port found; user must grant access. |
| `serial:timeout`         | `command: Uint8Array`, `instance` | A queued command timed out.                       |

### Arduino events

| Event               | Trigger                                           | Payload        |
| ------------------- | ------------------------------------------------- | -------------- |
| `arduino:connected` | Device response contains `"connected"`            | `data: string` |
| `arduino:credits`   | Device response contains `"created by danidoble"` | `data: string` |
| `arduino:hello`     | Device response contains `"hello there"`          | `data: string` |
| `arduino:ara`       | Device response contains `"ara ara"`              | `data: string` |
| `arduino:unknown`   | Line matches none of the above patterns           | `data: string` |

Multiple patterns can match a single line; `arduino:unknown` is only emitted when **no** pattern matches.

---

## TypeScript

All events and method signatures are fully typed. The package ships with `.d.mts` / `.d.cts` declaration files — no extra `@types` package required.

Commonly used types and all built-in providers are re-exported so you do not need to import directly from `webserial-core`:

```ts
import {
  Arduino,
  WebUsbProvider,
  createBluetoothProvider,
  createWebSocketProvider
} from '@danidoble/webserial-arduino';

import type {
  SerialPortFilter,
  SerialDeviceOptions,
  SerialEventMap,
  SerialProvider,
  SerialPolyfillOptions
} from '@danidoble/webserial-arduino';
```

---

## License

[GPL-3.0-only](./LICENSE.md) © [Danidoble](https://github.com/danidoble)
