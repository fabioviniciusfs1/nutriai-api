import { allowedByDiet, animalTags } from './diet.js';

describe('animalTags', () => {
  it('pela categoria da TACO', () => {
    expect(animalTags('Carnes e derivados', 'Frango, peito, grelhado')).toEqual(
      ['carne'],
    );
    expect(animalTags('Pescados e frutos do mar', 'Merluza, assada')).toEqual([
      'pescado',
    ]);
    expect(animalTags('Leite e derivados', 'Queijo, minas, frescal')).toEqual([
      'leite',
    ]);
    expect(animalTags('Cereais e derivados', 'Arroz, tipo 1, cozido')).toEqual(
      [],
    );
  });

  it('pelo nome, nos pratos e industrializados', () => {
    expect(animalTags('Alimentos preparados', 'Feijoada')).toEqual(['carne']);
    expect(animalTags('Alimentos preparados', 'Camarão à baiana')).toEqual([
      'pescado',
    ]);
    expect(animalTags('Alimentos preparados', 'Tapioca, com manteiga')).toEqual(
      ['leite'],
    );
    expect(
      animalTags('Alimentos preparados', 'Bife à cavalo, com contra filé'),
    ).toEqual(['carne', 'ovo']);
    expect(
      animalTags(
        'Outros alimentos industrializados',
        'Maionese, tradicional com ovos',
      ),
    ).toEqual(['ovo']);
    expect(animalTags('Produtos açucarados', 'Mel, de abelha')).toEqual([
      'mel',
    ]);
    expect(animalTags('Produtos açucarados', 'Melado')).toEqual([]);
  });

  it('sem falso positivo em leite de coco e tofu', () => {
    expect(
      animalTags('Outros alimentos industrializados', 'Leite, de coco'),
    ).toEqual([]);
    expect(
      animalTags('Leguminosas e derivados', 'Soja, queijo (tofu)'),
    ).toEqual([]);
  });
});

describe('allowedByDiet', () => {
  const food = (
    ...animal: ('carne' | 'pescado' | 'ovo' | 'leite' | 'mel')[]
  ) => ({
    animal,
  });

  it('cada dieta exclui as origens dela', () => {
    expect(allowedByDiet(food('carne'), 'onivora')).toBe(true);
    expect(allowedByDiet(food('carne'), 'pescetariana')).toBe(false);
    expect(allowedByDiet(food('pescado'), 'pescetariana')).toBe(true);
    expect(allowedByDiet(food('pescado'), 'vegetariana')).toBe(false);
    expect(allowedByDiet(food('ovo', 'leite'), 'vegetariana')).toBe(true);
    expect(allowedByDiet(food('leite'), 'vegana')).toBe(false);
    expect(allowedByDiet(food('mel'), 'vegana')).toBe(false);
    expect(allowedByDiet(food(), 'vegana')).toBe(true);
    expect(allowedByDiet({}, 'vegana')).toBe(true);
  });
});
