import { concat, decimalToUint8Array } from "./deps.ts";

interface AesGcmEncryptionStreamOptions {
  key: CryptoKey;
  ivPrefix?: boolean;
  iv?: Uint8Array;
  ivByteLength?: number;
  additionalData?: Uint8Array;
  tagLength?: number;
  blockSizePrefix?: boolean;
  concatData?: (
    iv: Uint8Array,
    encryptedChunk: Uint8Array,
    additionalData: Uint8Array,
  ) => Uint8Array;
}

export class AesGcmEncryptionStream
  extends TransformStream<Uint8Array, Uint8Array> {
  private readonly key: CryptoKey;
  private readonly ivPrefix: boolean;
  private iv: Uint8Array;
  private readonly ivByteLength: number;
  private readonly additionalData: Uint8Array;
  private readonly tagLength: number;
  private readonly blockSizePrefix: boolean;
  private readonly concatData: (
    iv: Uint8Array,
    encryptedChunk: Uint8Array,
    additionalData: Uint8Array,
  ) => Uint8Array;

  constructor(
    {
      key,
      ivPrefix,
      iv,
      ivByteLength,
      additionalData,
      tagLength,
      blockSizePrefix,
      concatData,
    }: AesGcmEncryptionStreamOptions,
  ) {
    super({
      transform: async (chunk, controller) => {
        const encryptedChunk = await this.encrypt(chunk);
        const concatedChunk = this.concatData(
          this.iv,
          encryptedChunk,
          this.additionalData,
        );
        let finalChunk;
        if (this.blockSizePrefix) {
          const blockSize = concatedChunk.byteLength + 4;
          const blockSizePrefix = decimalToUint8Array(blockSize);

          finalChunk = concat(blockSizePrefix, concatedChunk);
        } else finalChunk = concatedChunk;

        controller.enqueue(finalChunk);
        this.iv = iv ??
          crypto.getRandomValues(new Uint8Array(this.ivByteLength));
      },
      flush: (controller) => {
        controller.terminate();
      },
    });
    this.key = key;
    this.ivPrefix = ivPrefix ?? true;
    this.ivByteLength = ivByteLength ?? 12;
    this.iv = iv ??
      crypto.getRandomValues(new Uint8Array(this.ivByteLength));
    this.additionalData = additionalData ?? new Uint8Array();
    this.tagLength = tagLength ?? 128;
    this.blockSizePrefix = blockSizePrefix ?? true;
    this.concatData = concatData ?? this.ivPrefix
      ? ((iv, encryptedChunk, additionalData) =>
        concat(iv, encryptedChunk, additionalData))
      : ((_iv, encryptedChunk, additionalData) =>
        concat(encryptedChunk, additionalData));
  }

  private async encrypt(data: Uint8Array): Promise<Uint8Array> {
    const encryptedChunk = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: this.iv,
        tagLength: this.tagLength,
        additionalData: this.additionalData,
      },
      this.key,
      data,
    );
    return new Uint8Array(encryptedChunk);
  }
}
