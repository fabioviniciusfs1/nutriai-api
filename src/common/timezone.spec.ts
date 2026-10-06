import {
  addDays,
  localDate,
  resolveTimezone,
  userClock,
  weekday,
} from './timezone.js';

describe('timezone', () => {
  it('aceita fusos IANA válidos e cai no padrão nos inválidos', () => {
    expect(resolveTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(resolveTimezone('Nao/Existe')).toBe('America/Sao_Paulo');
    expect(resolveTimezone(undefined)).toBe('America/Sao_Paulo');
  });

  it('calcula o hoje no fuso do usuário', () => {
    const instant = new Date('2026-09-28T02:00:00Z');
    expect(localDate(instant, 'America/Sao_Paulo')).toBe('2026-09-27');
    expect(localDate(instant, 'Asia/Tokyo')).toBe('2026-09-28');
    expect(userClock('America/Sao_Paulo', instant)).toEqual({
      timeZone: 'America/Sao_Paulo',
      today: '2026-09-27',
    });
  });

  it('dia da semana e soma de dias', () => {
    expect(weekday('2026-09-28')).toBe(1);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
