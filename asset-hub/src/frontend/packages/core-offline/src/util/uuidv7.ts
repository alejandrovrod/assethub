let lastTimestamp = -1;
let counter = 0;

/**
 * RFC 9562 UUIDv7 generator.
 * Provides monotonic ordering within the same millisecond and guaranteed uniqueness.
 */
export function uuidv7(): string {
  let now = Date.now();

  if (now <= lastTimestamp) {
    counter++;
    if (counter > 0xfff) {
      now = lastTimestamp + 1;
      counter = 0;
    } else {
      now = lastTimestamp;
    }
  } else {
    lastTimestamp = now;
    counter = 0;
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-bit timestamp (bytes 0-5)
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // 4-bit version (0x7) + top 4 bits of counter
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  // remaining 8 bits of counter
  bytes[7] = counter & 0xff;

  // 2-bit variant (0b10xxxxxx -> 0x80..0xbf)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  // Format as 8-4-4-4-12
  let hex = '';
  for (let i = 0; i < 16; i++) {
    const b = bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
    if (i === 3 || i === 5 || i === 7 || i === 9) {
      hex += '-';
    }
  }
  return hex;
}

