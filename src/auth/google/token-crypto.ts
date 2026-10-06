import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Criptografa com AES-256-GCM: `iv.tag.dados`, em base64url. */
export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptToken(encrypted: string, key: Buffer): string {
  const [iv, tag, data] = encrypted
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}
