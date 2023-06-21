import { Buffer, concat, uint8ArrayToDecimal } from "./deps.ts";

interface AesGcmDecryptionStreamOptions {
  key: CryptoKey;
  useIvPrefix?: boolean;
  iv?: Uint8Array;
  ivByteLength?: number;
  tagLength?: number;
  additionalDataByteLength?: number;
  useBlockSizePrefix?: boolean;
  separateData?: (
    receivedData: Uint8Array,
    ivByteLength: number,
    additionalDataByteLength: number,
  ) => {
    blockSize?: number;
    iv: Uint8Array;
    encryptedChunk: Uint8Array;
    additionalData: Uint8Array;
  };
}

export class AesGcmDecryptionStream
  extends TransformStream<Uint8Array, Uint8Array> {
  private readonly key: CryptoKey;
  private readonly useIvPrefix: boolean;
  private iv?: Uint8Array;
  private readonly ivByteLength: number;
  private readonly tagLength: number;
  private readonly additionalDataByteLength: number;
  private readonly useBlockSizePrefix: boolean;
  private buffer: Buffer;
  private readonly separateData: (
    receivedData: Uint8Array,
    ivByteLength: number,
    additionalDataByteLength: number,
  ) => {
    blockSize?: number;
    iv: Uint8Array;
    encryptedChunk: Uint8Array;
    additionalData: Uint8Array;
  };

  constructor(
    {
      key,
      useIvPrefix,
      iv,
      ivByteLength,
      tagLength,
      additionalDataByteLength,
      useBlockSizePrefix,
      separateData,
    }: AesGcmDecryptionStreamOptions,
  ) {
    super({
      transform: async (chunk, controller) => {
        let blockToBeProcessed = concat(
          this.buffer.toUint8Array() as Uint8Array,
          chunk,
        );

        while (true) {
          this.buffer.reset();

          const { blockSize, iv, encryptedChunk, additionalData } = this
            .separateData(
              blockToBeProcessed,
              this.ivByteLength,
              this.additionalDataByteLength,
            );

          if (!blockSize) {
            const decryptedChunk = await this.decrypt(
              encryptedChunk,
              iv,
              additionalData,
            );
            controller.enqueue(concat(decryptedChunk, additionalData));
            return;
          }

          switch (true) {
            case blockToBeProcessed.byteLength < blockSize:
              this.buffer.push(blockToBeProcessed);
              return;

            case blockToBeProcessed.byteLength > blockSize:
              {
                const completedBlock = blockToBeProcessed.subarray(
                  4 + this.ivByteLength,
                  blockSize,
                );
                const decryptedChunk = await this.decrypt(
                  completedBlock,
                  iv,
                  additionalData,
                );
                controller.enqueue(concat(decryptedChunk, additionalData));
                const remainedBlock = blockToBeProcessed.subarray(blockSize);
                blockToBeProcessed = remainedBlock;
              }
              break;

            case blockToBeProcessed.byteLength === blockSize:
              {
                const decryptedChunk = await this.decrypt(
                  encryptedChunk,
                  iv,
                  additionalData,
                );
                controller.enqueue(concat(decryptedChunk, additionalData));
              }
              return;
          }
        }
      },
      flush: (controller) => {
        controller.terminate();
      },
    });
    this.key = key;
    this.useIvPrefix = useIvPrefix ?? true;
    this.iv = iv;
    this.ivByteLength = this.iv
      ? this.useIvPrefix ? this.iv.byteLength : 0
      : ivByteLength ?? 12;

    this.tagLength = tagLength ?? 128;
    this.additionalDataByteLength = additionalDataByteLength ?? 0;
    this.useBlockSizePrefix = useBlockSizePrefix ?? true;
    this.buffer = new Buffer();
    this.separateData = separateData
      ? separateData.bind(this)
      : this.useBlockSizePrefix
      ? ((
        receivedData,
        ivByteLength,
        additionalDataByteLength,
      ) => {
        const blockSize = uint8ArrayToDecimal(receivedData.subarray(0, 4));
        const iv = this.iv ?? receivedData.subarray(4, 4 + ivByteLength);
        const encryptedChunk = receivedData.subarray(
          4 + ivByteLength,
          receivedData.byteLength - additionalDataByteLength,
        );
        const additionalData = receivedData.subarray(
          blockSize - additionalDataByteLength,
          blockSize,
        );
        return { blockSize, iv, encryptedChunk, additionalData };
      })
      : ((
        receivedData,
        ivByteLength,
        additionalDataByteLength,
      ) => {
        const iv = this.iv ?? receivedData.subarray(0, ivByteLength);
        const encryptedChunk = receivedData.subarray(
          ivByteLength,
          receivedData.byteLength - additionalDataByteLength,
        );
        const additionalData = receivedData.subarray(
          -additionalDataByteLength,
        );
        return { iv, encryptedChunk, additionalData };
      });
  }

  private async decrypt(
    encryptedChunk: Uint8Array,
    iv: Uint8Array,
    additionalData: Uint8Array,
  ): Promise<Uint8Array> {
    const decryptedChunk = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: this.tagLength,
        additionalData: additionalData,
      },
      this.key,
      encryptedChunk,
    );
    return new Uint8Array(decryptedChunk);
  }
}
