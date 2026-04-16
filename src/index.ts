/**
 * @license GPL-3.0-only
 * @packageDocumentation
 *
 * `@danidoble/webserial-arduino` — Arduino serial driver for the Web Serial API.
 *
 * Created by (c) Danidoble.
 *
 * This source code is licensed under the GPL-3.0-only license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @example
 * ```ts
 * import { Arduino } from '@danidoble/webserial-arduino';
 * import type { SerialPortFilter } from '@danidoble/webserial-arduino';
 *
 * const filters: SerialPortFilter[] = [{ usbVendorId: 0x2341 }];
 * const arduino = new Arduino(filters);
 *
 * arduino.on('arduino:connected', (data) => console.log('Connected:', data));
 * await arduino.connect();
 * ```
 */

// Main class
export { Arduino } from './arduino';

// Re-export commonly used types from webserial-core so consumers do not need
// to install webserial-core solely for the type definitions.
export type { SerialPortFilter, SerialDeviceOptions, SerialEventMap, SerialParser, SerialProvider } from 'webserial-core';
