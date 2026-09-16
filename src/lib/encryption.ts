import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32; // for aes-256

/**
 * Derives a key from a password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypts a text using AES-256-CBC
 */
export function encrypt(text: string, password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return salt, iv and encrypted text joined by ":"
  return `${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a text using AES-256-CBC
 */
export function decrypt(encryptedData: string, password: string): string {
  const [saltHex, ivHex, encryptedText] = encryptedData.split(':');
  
  if (!saltHex || !ivHex || !encryptedText) {
    throw new Error('Invalid encrypted data format');
  }

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
