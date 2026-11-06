import { barcodeVariants, isBarcode } from './products.js';

describe('código de barras', () => {
  it('aceita só dígitos, de 8 a 14', () => {
    expect(isBarcode('7891000100103')).toBe(true);
    expect(isBarcode(' 78912345 ')).toBe(true);
    expect(isBarcode('1234567')).toBe(false);
    expect(isBarcode('leite')).toBe(false);
  });

  it('acha o UPC-A como EAN-13 com zero na frente, e o contrário', () => {
    expect(barcodeVariants('016000487956')).toEqual(
      expect.arrayContaining(['016000487956', '0016000487956']),
    );
    expect(barcodeVariants('0016000487956')).toContain('016000487956');
    expect(barcodeVariants('7891000100103')).toContain('7891000100103');
  });
});
