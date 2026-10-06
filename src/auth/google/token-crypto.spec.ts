import { randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from './token-crypto.js';

describe('token-crypto', () => {
  it('criptografa e volta', () => {
    const key = randomBytes(32);
    const encrypted = encryptToken('1//refresh-token', key);
    expect(encrypted).not.toContain('refresh');
    expect(decryptToken(encrypted, key)).toBe('1//refresh-token');
  });

  it('falha com outra chave', () => {
    const encrypted = encryptToken('segredo', randomBytes(32));
    expect(() => decryptToken(encrypted, randomBytes(32))).toThrow();
  });
});
