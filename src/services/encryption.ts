import { split, combine } from 'shamir-secret-sharing';
import { argon2id } from 'hash-wasm';

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; 
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const TAG_LENGTH = 128; // Web Crypto uses bits (128 bits = 16 bytes)

/**
 * Universal Encryption Service V3.1
 * Re-engineered for Cross-Platform compatibility (Node.js & Browser).
 * Uses Web Crypto API for AES-256-GCM and hash-wasm for Argon2id.
 */
export class EncryptionService {
  /**
   * Helper: Convert Uint8Array to Hex string
   */
  private static toHex(uint8: Uint8Array): string {
    return Array.from(uint8)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Helper: Convert Hex string to Uint8Array
   */
  private static fromHex(hex: string): Uint8Array {
    const match = hex.match(/.{1,2}/g);
    if (!match) return new Uint8Array(0);
    return new Uint8Array(match.map(byte => parseInt(byte, 16)));
  }

  /**
   * Helper: Convert String to Uint8Array
   */
  private static fromUtf8(str: string): Uint8Array {
    return new TextEncoder().encode(str);
  }

  /**
   * Helper: Convert Uint8Array to UTF-8 String
   */
  private static toUtf8(uint8: Uint8Array): string {
    return new TextDecoder().decode(uint8);
  }

  /**
   * Derives a cryptographic key from a password and salt using Argon2id.
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const hash = await argon2id({
      password: password,
      salt: salt,
      parallelism: 4,
      iterations: 3,
      memorySize: 65536,
      hashLength: KEY_LENGTH,
      outputType: 'binary',
    });

    const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    if (!cryptoApi || !cryptoApi.subtle) {
      throw new Error('Web Crypto API not supported in this environment.');
    }

    return await cryptoApi.subtle.importKey(
      'raw',
      hash,
      { name: ALGORITHM } as AesKeyGenParams,
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts text using AES-256-GCM.
   * Returns: salt:iv:encryptedTextWithAuthTag (all hex)
   */
  static async encryptText(text: string, password: string): Promise<string> {
    const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = cryptoApi.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await this.deriveKey(password, salt);

    const encryptedContent = await cryptoApi.subtle.encrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH } as AesGcmParams,
      key,
      this.fromUtf8(text)
    );

    const encryptedUint8 = new Uint8Array(encryptedContent);
    return `${this.toHex(salt)}:${this.toHex(iv)}:${this.toHex(encryptedUint8)}`;
  }

  /**
   * Decrypts text using AES-256-GCM.
   */
  static async decryptText(encryptedData: string, password: string): Promise<string> {
    const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    const parts = encryptedData.split(':');
    
    let salt: Uint8Array, iv: Uint8Array, encryptedWithTag: Uint8Array;

    if (parts.length === 4) {
      const [saltHex, ivHex, tagHex, dataHex] = parts;
      salt = this.fromHex(saltHex);
      iv = this.fromHex(ivHex);
      const tag = this.fromHex(tagHex);
      const data = this.fromHex(dataHex);
      encryptedWithTag = new Uint8Array(data.length + tag.length);
      encryptedWithTag.set(data);
      encryptedWithTag.set(tag, data.length);
    } else if (parts.length === 3) {
      const [saltHex, ivHex, dataHex] = parts;
      salt = this.fromHex(saltHex);
      iv = this.fromHex(ivHex);
      encryptedWithTag = this.fromHex(dataHex);
    } else {
      throw new Error('Invalid encryption format.');
    }

    const key = await this.deriveKey(password, salt);

    try {
      const decrypted = await cryptoApi.subtle.decrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH } as AesGcmParams,
        key,
        encryptedWithTag
      );
      return this.toUtf8(new Uint8Array(decrypted));
    } catch (e) {
      throw new Error('Decryption failed. Invalid password or corrupted data.');
    }
  }

  /**
   * Shamir Secret Sharing: Splits a key into M-of-N shares.
   */
  static async splitSecret(secret: string, threshold: number = 2, shares: number = 3): Promise<string[]> {
    if (secret.length < 8) {
      throw new Error('Password too short for encryption. Minimum 8 characters required.');
    }
    const secretBuffer = this.fromUtf8(secret);
    // Fix: positional arguments (secret, shares, threshold)
    const parts = await split(secretBuffer, shares, threshold);
    return parts.map(p => this.toHex(p));
  }

  /**
   * Shamir Secret Sharing: Reconstructs a secret from shares.
   */
  static async combineShares(shares: string[], threshold: number = 2): Promise<string> {
    const uniqueShares = Array.from(new Set(shares));
    if (uniqueShares.length < threshold) {
      throw new Error(`Insufficient unique shares for reconstruction. Need at least ${threshold}.`);
    }
    const parts = uniqueShares.map(s => this.fromHex(s));
    const combined = await combine(parts);
    return this.toUtf8(combined);
  }

  /**
   * Encrypts a File/Blob using AES-256-GCM.
   */
  static async encryptBlob(blob: Blob, password: string): Promise<{ salt: string; iv: string; encryptedBlob: Blob }> {
    const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    const arrayBuffer = await blob.arrayBuffer();
    const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = cryptoApi.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await this.deriveKey(password, salt);

    const encrypted = await cryptoApi.subtle.encrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH } as AesGcmParams,
      key,
      arrayBuffer
    );

    return {
      salt: this.toHex(salt),
      iv: this.toHex(iv),
      encryptedBlob: new Blob([encrypted], { type: 'application/octet-stream' })
    };
  }

  /**
   * Decrypts a File/Blob using AES-256-GCM.
   */
  static async decryptBlob(blob: Blob, password: string, saltHex: string, ivHex: string): Promise<Blob> {
    const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    const arrayBuffer = await blob.arrayBuffer();
    const salt = this.fromHex(saltHex);
    const iv = this.fromHex(ivHex);
    const key = await this.deriveKey(password, salt);

    try {
      const decrypted = await cryptoApi.subtle.decrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH } as AesGcmParams,
        key,
        arrayBuffer
      );
      return new Blob([decrypted], { type: 'video/webm' });
    } catch (e) {
      throw new Error('Blob decryption failed.');
    }
  }
}

