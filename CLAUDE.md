# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Backend (API) do NutriAI em NestJS 12. O front ([nutriai-front](https://github.com/fabioviniciusfs1/nutriai-front))
só exibe dados: **todas as contas** (metas calóricas, plano do dia, porções, trocas de alimentos, estatísticas)
são responsabilidade deste backend. Todas as rotas do contrato estão implementadas, com Postgres (TypeORM),
login com Google (OAuth + Google Health API) e chat com Claude (API da Anthropic).

## Comandos

```bash
cp .env.example .env   # e preencha JWT_SECRET, TOKEN_ENCRYPTION_KEY, Google e Anthropic
docker compose up -d   # Postgres na porta 5433 (bancos nutriai e nutriai_test)
npm run db:import-taco -- data/taco/tabela-taco.ods   # catálogo (TACO) + semente; reinicie a API depois
npm run db:seed        # só a semente (plano base, sugestões, nutrientes); exige a TACO importada
npm run start:dev      # servidor em watch mode (porta: env PORT; o .env.example usa 3001)
npm run build          # nest build → dist/
npm run lint           # oxlint --type-aware em src/ e test/
npm run format         # prettier (aspas simples, trailing comma)
npm test               # testes unitários (vitest, arquivos *.spec.ts)
npm run test:e2e       # testes e2e contra o banco nutriai_test (zera o schema a cada execução)
npm run db:migrate     # aplica migrations (db:revert desfaz a última); rodam do build em dist/
npx vitest run src/plan/engine/planner.spec.ts   # um arquivo
npx vitest run -t "redistribuir"                  # por nome do teste
```

## Particularidades do setup

- **ESM puro** (`"type": "module"`, `module: nodenext`): imports relativos precisam da extensão `.js`
  (ex.: `import { PlanService } from './plan.service.js'`). `main.ts` usa top-level `await`.
- Testes com **Vitest** (não Jest), com `globals: true` — `describe`/`it`/`expect` não precisam ser importados.
  Unitários ficam ao lado do código em `src/`; e2e em `test/` usando `supertest`.
- Lint com **oxlint** (não ESLint); `no-floating-promises` é erro.
- `src/app.module.ts` registra o `ObserveModule` (@nestjs/observe) com chaves do env (`OBSERVE_APP_KEY`/`SECRET`),
  e `main.ts` passa `ObserveInstrument` para o `NestFactory`.
- Config só via `loadConfig()` (`src/config/app-config.ts`, injetado como `APP_CONFIG`); não use `ConfigService`.
- Migrations são escritas à mão em `src/database/migrations/` e registradas em `MIGRATIONS` (`data-source.ts`);
  `synchronize` fica desligado. As migrations rodam sozinhas ao subir a API.

## Catálogo de alimentos (TACO)

- Fonte: `data/taco/tabela-taco.ods` (pag1: energia, macro e micronutrientes; pag2: gorduras; mesmo `id`).
  Vai inteira para `taco_alimentos`, com as colunas da 1ª linha de cada página: `*`, `NA` e vazio → `null`,
  `Tr` → 0; guarda o valor exibido. Leitura em `src/database/sources/` (`ods.ts`, `taco/parse.ts`).
- O catálogo do app (`foods`, o que o engine usa) é derivado da fonte por `taco/to-catalog.ts`: grupo do app
  pela categoria da TACO (faixa de id), micronutrientes com os ids de `nutrient_defs`. Alimentos sem energia
  ficam de fora (591 de 597). Nova fonte = nova pasta em `sources/` com tabela própria e `foods.source` próprio.
- Plano base e sugestões (`src/database/seed-data.ts`) listam só `{ name, grams }` com nomes exatos do
  catálogo; o seed calcula os nutrientes (`seed-plan.ts`). O `CatalogService` guarda o catálogo em memória:
  depois de importar, reinicie a API.
- Os testes do engine usam um catálogo fixo (`src/plan/engine/test-catalog.ts`, os dados do mock antigo).

## Arquitetura

- `src/contract.ts`: cópia dos tipos de `backend-contract/contract.ts`; respostas e corpos usam esses tipos.
- `src/common/`: `HttpErrorFilter` (todo erro vira `{ error }`), `createValidationPipe` (primeira mensagem do DTO),
  `@Clock()` (o "hoje" pelo `X-Timezone`), `@Public()` e `@CurrentUser()`. O `AuthGuard` é global (`APP_GUARD`).
- `src/plan/engine/`: regras do plano como funções puras (porte de `reference/MealPlan.tsx` e
  `food-substitution.ts`). `Planner` recebe o catálogo e o `PlanState` e devolve o novo estado ou uma prévia;
  `PlanService` carrega/salva o estado (lock da linha em `plan_states`) e grava a foto do dia (`day_logs`),
  que é a base de `/nutrition/today` e `/history/*`. Mude regras do plano no engine, com teste em `planner.spec.ts`.
- Plano inicial: refeições base com `minMealsPerDay <= profile.mealsPerDay` (lanches 4, 5 e 6), e todas as
  porções multiplicadas pelo `goalFactor` do `Planner` (meta calórica ÷ kcal do plano inicial, ajustado para o
  total arredondado ficar o mais perto da meta). Alimentos acrescentados e refeições criadas são guardados sem
  esse fator; ele é recalculado a cada requisição pelo perfil (`PlanService.plannerOptions`).
  Com meta, criar refeição leva o dia de volta para a meta (a nova fica com `meta ÷ (n + 1)`, as outras se
  ajustam e podem aumentar); as demais ações nunca aumentam o total.
- Plano individual (`src/plan/personalizer.service.ts`): no primeiro `PUT /me/profile`, o Claude monta as refeições
  do plano base para o usuário em segundo plano (`composer/personal-plan.ts`, com o `CLAUDE_PLAN_MODEL`, Sonnet, e
  `fallbacks: 'default'` no endpoint beta); ficam em `plan_states.personal_meals`
  (id da refeição base → título e alimentos) e o `Planner` usa no lugar das padrão. Estado em
  `plan_states.personalization` (`pending` com mais de 2 min vira `failed`); `POST /plan/personalize` tenta de novo.
  Nos e2e, espere com `PlanPersonalizerService.whenIdle()` depois do primeiro perfil (ele usa o mock do Claude).
- Tipo de alimentação (`profile.diet`): `src/plan/engine/diet.ts` marca a origem animal de cada alimento
  (`foods.animal`, pela categoria da TACO e por palavras do nome) e `allowedByDiet` filtra o plano individual,
  as sugestões fixas, as refeições compostas e os substitutos.
- `src/health/`: importa a atividade da Google Health API para `activity_days`: ao conectar o Google, nas
  rotas de nutrição/histórico quando a última vez foi há mais de 1 h, e todo dia de madrugada
  (`HealthSyncScheduler`: `HEALTH_SYNC_CRON`, padrão `0 3 * * *`, fuso `HEALTH_SYNC_TIMEZONE`; `off`
  desliga). Nunca importa antes do dia 0 (`google_accounts.start_date`, o dia em que o Google foi
  conectado); depois dele, busca desde o dia da última sincronização (mínimo 7, máximo 90 dias). Nunca
  quebra a rota se falhar. Sem dados de atividade, o gasto do dia é o `tdee` do perfil.
- `src/chat/`: Claude (`claude-haiku-4-5`, o mais barato) com o contexto do usuário; sem `ANTHROPIC_API_KEY` o chat responde 503.
  `CHAT_ENABLED=false` não registra o `ChatModule` (rotas `/chat/*` dão 404; o código e a tabela ficam); no front, o
  mesmo papel é do `NEXT_PUBLIC_CHAT_ENABLED` (em produção, `docker-compose.prod.yml` passa o `CHAT_ENABLED` para os dois).
- `src/plan/composer/`: o Claude compõe as refeições novas (nome + alimentos do catálogo em JSON por schema);
  `parseComposition` descarta nomes fora do catálogo e restritos, e o engine escala a porção. A prévia guarda a
  sugestão (15 min, em memória) para o `POST /plan/meals` usar a mesma. Sem cliente ou com erro, volta para a
  lista fixa (`meal_suggestions`). O cliente e o modelo (`CLAUDE_MODEL`) ficam em `src/ai/`.
  Também sugere substitutos ao trocar alimento (`substitution.ts`): o Claude devolve nomes, `parseSubstitutes`
  fica só com os do catálogo (até 8, sem crus se o original não for cru); sem ele, os do mesmo grupo mais
  parecidos (`FoodCatalog.substituteOptions`). A troca aceita qualquer alimento do catálogo não restrito.
- Lacuna conhecida: não há rota para marcar refeição feita (`/history/plans` conta todas como seguidas).

## Contrato com o front

As rotas que o front chama estão em `backend-contract/`:
- `api.md` — rotas, exemplos e regras de negócio. Leia a seção da rota antes de criá-la ou alterá-la.
- `contract.ts` — tipos exatos de corpo e resposta (valem sobre o `api.md` se divergirem).
- `reference/` — código antigo do front com o comportamento esperado das regras (só leitura; os imports não
  resolvem aqui). `MealPlan.tsx` concentra as regras do plano do dia; `mock-data.ts` serve de semente para o banco.

Convenções transversais do contrato (detalhes em `api.md` → "Convenções"):
- Erros: status 4xx/5xx com corpo `{ "error": "mensagem em pt-BR" }`, exibida ao usuário como está.
- Rotas 🔒 exigem `Authorization: Bearer <token>`; token inválido/expirado → `401`.
- Toda requisição traz `X-Timezone` (IANA); use-o para determinar o "hoje" do usuário.
- JSON em camelCase; dias como `"AAAA-MM-DD"`, horários de refeição `"HH:MM"`; quantidades sempre em gramas;
  gramas e kcal já arredondados para inteiros (o front não arredonda nem soma).
- CORS: liberar a origem do front, métodos `GET, POST, PUT, DELETE` e cabeçalhos
  `Authorization, Content-Type, X-Timezone`.

A pasta é uma cópia: a fonte fica no front (`docs/api.md` e `src/lib/api/types.ts`); quando o contrato mudar
lá, copie de novo.
