import { chatEnabled } from './app-config.js';

describe('chatEnabled', () => {
  it('ligado por padrão', () => {
    expect(chatEnabled({})).toBe(true);
    expect(chatEnabled({ CHAT_ENABLED: 'true' })).toBe(true);
  });

  it('CHAT_ENABLED=false desliga', () => {
    expect(chatEnabled({ CHAT_ENABLED: 'false' })).toBe(false);
    expect(chatEnabled({ CHAT_ENABLED: ' FALSE ' })).toBe(false);
  });
});
