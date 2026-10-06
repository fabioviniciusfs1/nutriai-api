// Tarefas de banco: `npm run db:migrate`, `npm run db:revert` e `npm run db:seed` (rodam o build em dist/).
import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.js';
import { seedCatalog } from './seed.js';
import { importTaco } from './sources/taco/import.js';

try {
  loadEnvFile();
} catch {
  // Sem .env: usa só as variáveis do ambiente.
}

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error(
    'Variável de ambiente DATABASE_URL não definida (veja .env.example).',
  );

const command = process.argv[2];
const dataSource = await new DataSource(dataSourceOptions(url)).initialize();
try {
  if (command === 'migrate') {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(
      applied.length
        ? `Migrations aplicadas: ${applied.map((m) => m.name).join(', ')}`
        : 'Banco em dia.',
    );
  } else if (command === 'revert') {
    await dataSource.undoLastMigration();
    console.log('Última migration desfeita.');
  } else if (command === 'seed') {
    await seedCatalog(dataSource);
    console.log('Catálogo gravado.');
  } else if (command === 'import-taco') {
    const file = process.argv[3];
    if (!file)
      throw new Error(
        'Informe o arquivo: npm run db:import-taco -- data/taco/tabela-taco.ods',
      );
    const result = await importTaco(dataSource, file);
    for (const warning of result.warnings) console.warn(`Aviso: ${warning}`);
    console.log(
      `TACO importada: ${result.tacoFoods} alimentos em taco_alimentos, ${result.catalogFoods} no catálogo do app.`,
    );
  } else {
    throw new Error(
      `Comando desconhecido: ${command ?? '(nenhum)'}. Use migrate, revert, seed ou import-taco.`,
    );
  }
} finally {
  await dataSource.destroy();
}
