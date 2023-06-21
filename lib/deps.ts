export function concat(...buf: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const b of buf) {
    length += b.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const b of buf) {
    output.set(b, index);
    index += b.length;
  }
  return output;
}

export function createKey(
  keyBytes: Uint8Array,
  keyUsages: KeyUsage[] = ["encrypt", "decrypt"],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    keyUsages,
  );
}

export function decimalToUint8Array(decimalNumber: number) {
  const uint8Array = new Uint8Array(4);
  uint8Array[0] = (decimalNumber >> 24) & 0xFF;
  uint8Array[1] = (decimalNumber >> 16) & 0xFF;
  uint8Array[2] = (decimalNumber >> 8) & 0xFF;
  uint8Array[3] = decimalNumber & 0xFF;
  return uint8Array;
}
export function uint8ArrayToDecimal(uint8Array: Uint8Array) {
  return (uint8Array[0] << 24) |
    (uint8Array[1] << 16) |
    (uint8Array[2] << 8) |
    uint8Array[3];
}

export class Buffer {
  private data: number[];
  constructor() {
    this.data = [];
  }
  reset() {
    this.data = [];
  }
  push(value: Uint8Array) {
    for (let i = 0; i < value.length; i++) {
      this.data.push(value[i]);
    }
  }
  get length() {
    return this.data.length;
  }
  toUint8Array() {
    return new Uint8Array(this.data);
  }
}
