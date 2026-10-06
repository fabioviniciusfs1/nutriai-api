import { chunks } from './health-api.js';

describe('chunks', () => {
  it('divide o período em blocos de até 14 dias, fim exclusivo', () => {
    const blocks = chunks('2026-07-04', '2026-10-01');
    expect(blocks).toHaveLength(7);
    expect(blocks[0]).toEqual({
      range: {
        start: { date: { year: 2026, month: 7, day: 4 } },
        end: { date: { year: 2026, month: 7, day: 18 } },
      },
      days: 14,
    });
    expect(blocks[6].range.end).toEqual({
      date: { year: 2026, month: 10, day: 2 },
    });
    expect(blocks.reduce((total, block) => total + block.days, 0)).toBe(90);
  });

  it('um dia só', () => {
    expect(chunks('2026-10-01', '2026-10-01')).toEqual([
      {
        range: {
          start: { date: { year: 2026, month: 10, day: 1 } },
          end: { date: { year: 2026, month: 10, day: 2 } },
        },
        days: 1,
      },
    ]);
  });
});
