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
npm run db:import-tbca -- data/tbca/TBCA_20223103.csv # catálogo (TBCA), depois da TACO; reinicie a API
npm run db:seed        # só a semente (plano base, nutrientes); exige a TACO importada
npm run start:dev      # servidor em watch mode (porta: env PORT; o .env.example usa 3001)
npm run build          # nest build → dist/
npm run lint           # oxlint --type-aware em src/ e test/
npm run format         # prettier (aspas simples, trailing comma)
npm test               # testes unitários (vitest, arquivos *.spec.ts)
npm run test:e2e       # testes e2e contra o banco nutriai_test (zera o schema a cada execução)
npm run db:migrate     # aplica migrations (db:revert desfaz a última); rodam do build em dist/
npx vitest run src/plan/engine/planner.spec.ts   # um arquivo
npx vitest run -t "não gosto"                     # por nome do teste
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

## Catálogo de alimentos (TACO e TBCA)

- Fonte: `data/taco/tabela-taco.ods` (pag1: energia, macro e micronutrientes; pag2: gorduras; mesmo `id`).
  Vai inteira para `taco_alimentos`, com as colunas da 1ª linha de cada página: `*`, `NA` e vazio → `null`,
  `Tr` → 0; guarda o valor exibido. Leitura em `src/database/sources/` (`ods.ts`, `taco/parse.ts`).
- O catálogo do app (`foods`, o que o engine usa) é derivado da fonte por `taco/to-catalog.ts`: grupo do app
  pela categoria da TACO (faixa de id), micronutrientes com os ids de `nutrient_defs`. Alimentos sem energia
  ficam de fora (591 de 597). Nova fonte = nova pasta em `sources/` com tabela própria e `foods.source` próprio;
  `upsertCatalog` (`sources/catalog-food.ts`) grava os alimentos dela em `foods`.
- TBCA: `data/tbca/TBCA_20223103.csv` (`;`, vírgula decimal; cabeçalho com acentos quebrados, lido pela posição)
  vai inteira para `tbca_alimentos` (`NA`, `-` e vazio → `null`, `tr` → 0; id texto, ex. `C0019D`, com a
  categoria na letra do fim). `tbca/to-catalog.ts` deriva o catálogo (carboidrato total, sem manganês). Nome
  é a chave de `foods`: repetido na TBCA ou já usado pela TACO fica de fora (a TACO tem os nomes do plano base).
  Receitas com a lista de ingredientes no nome (`isTbcaRecipe`: parêntese com 3+ itens) ficam só em
  `tbca_alimentos`, fora do catálogo. Fast food, fins especiais e industrializados ficam sem grupo (busca, mas
  não substitutos). 3.762 alimentos no catálogo.
- O plano base (`src/database/seed-data.ts`) lista só `{ name, grams }` com nomes exatos do
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
- Perfil e rotina (`src/users/`): o cadastro tem dois passos. `users.profile` tem o que a meta usa (sexo,
  idade, peso, altura, atividade, objetivo) e o peso meta (`targetWeightKg`, o único campo que muda depois do
  cadastro: `PUT /me/target-weight`; `projectWeight` em `src/targets/` faz a projeção pela regra de 7.700 kcal/kg, com datas a partir do dia em que o
  peso meta foi salvo, `users.target_weight_set_on`); `users.routine` (`PUT /me/routine`, exige o perfil) tem as janelas
  para comer (sempre fora do sono e do treino), sono, início e fim do treino, períodos de mais e menos fome, as refeições que a pessoa faz (`meals`: café da
  manhã, lanche da manhã, almoço, lanche da tarde, jantar, ceia; pelo menos uma), dia da pesagem e tipo de
  alimentação. As regras entre os campos e as linhas de prompt ficam em `routine.ts` (`routineError`,
  `routineLines`, `MEAL_SLOTS`). Sem rotina: café da manhã, almoço e jantar, sem restrição.
- Ajuste da dieta (`src/targets/diet.ts`; `GET`/`PUT /me/diet`, `POST /me/diet/estimate` e `POST /me/diet/preview`,
  que não salvam; a prévia é o `PlanService.previewDiet`, com o plano de hoje pelas metas novas e o que muda):
  `users.diet_settings` tem proteína e gordura em g/kg e o peso da unidade do ovo (`null` = 2, 1 e 55 g). Mínimos
  de 1,6 g/kg de proteína e 0,5 g/kg de gordura; a meta calórica não muda: proteína e gordura compensam no
  carboidrato, o carboidrato compensa na gordura (`adjustMacro`, que prende nos limites). `macroTargets(profile,
  settings)` vale para `/nutrition/today`, o histórico, o `macroWeights` do plano e o prompt do plano individual.
  Ovos de galinha inteiros (`isEggUnit` em `foods.ts`) vão no plano em unidades inteiras desse peso (`portionFood`,
  `PlanFood.units`), menos o extra com as gramas do usuário.
- Plano inicial: as refeições base cujo `slot` (`base_meals.slot`, uma por refeição do dia) está em
  `routine.meals`, e todas as
  porções multiplicadas pelo `goalFactor` do `Planner` (meta calórica ÷ kcal do plano inicial, ajustado para o
  total arredondado ficar o mais perto da meta) e pelos `macroWeights`: um peso por macro (proteína, gordura,
  carboidrato; mínimos quadrados do erro relativo às metas de `macroTargets`, entre 1/1,5 e 1,5) e cada alimento
  com a média dos pesos pelas frações das calorias dele, para os macros do dia irem para as metas. Os dois são
  recalculados a cada requisição pelo perfil e pela rotina (`PlanService.plannerOptions`). O alimento extra (`POST /plan/meals/{id}/foods` com `grams`) fica nas gramas
  do usuário, fora desse fator e dos fatores de porção (`ExtraFood.fixed`), e soma às calorias do dia; é a
  única ação que aumenta o total. Extras antigos, sem `fixed`, seguem escalados com a refeição.
- Não há rota para criar nem remover refeição: as refeições do dia são as de `routine.meals`. O que o usuário
  muda no plano é permanente (`plan_states`): horários, alimentos acrescentados, trocas e fatores de porção.
- Plano individual (`src/plan/personalizer.service.ts`): no primeiro `PUT /me/routine`, o Claude monta as refeições
  do plano base para o usuário em segundo plano (`composer/personal-plan.ts`, com o `CLAUDE_PLAN_MODEL`, Sonnet, e
  `fallbacks: 'default'` no endpoint beta), escolhendo o horário de cada uma dentro das janelas da rotina e
  distribuindo as calorias por ela. A refeição dura até 30 min e acaba 30 min antes do fim da janela: só começa
  até 1 h antes da hora cheia em que a janela acaba (`mealStartWindows`; `12:00–13:59` → 12:00 a 13:00), e é
  nesses inícios que valem as regras abaixo. Ficam em `plan_states.personal_meals` (id da refeição base → título,
  alimentos e horário) e o `Planner` usa no lugar das padrão. No máximo 6 h entre uma refeição e a seguinte, ou até o
  início da próxima janela se 6 h depois não pode comer (`nextMealDeadline`): `fitFastingLimit` adianta só as
  que passam do limite, mantendo os outros horários do Claude. Horário fora das janelas, repetido, ilegível ou
  fora da ordem do dia: `spreadMealTimes` espalha todas (uma por janela; as que sobram nas mais longas) e o
  limite vale do mesmo jeito. Os ajustes vão para o log. Estado em `plan_states.personalization` (`pending` antigo vira
  `failed`); `POST /plan/personalize` monta de novo (depois de uma falha ou quando o usuário muda a rotina e pede
  para refazer). Nos e2e, espere com `PlanPersonalizerService.whenIdle()` depois da primeira rotina (ele usa o
  mock do Claude).
- Tipo de alimentação (`routine.diet`): `src/plan/engine/diet.ts` marca a origem animal de cada alimento
  (`foods.animal`, pela categoria da TACO e por palavras do nome) e `allowedByDiet` filtra o plano individual
  e os substitutos.
- `src/health/`: importa a atividade da Google Health API para `activity_days`: ao conectar o Google, nas
  rotas de nutrição/histórico quando a última vez foi há mais de 1 h, e todo dia de madrugada
  (`HealthSyncScheduler`: `HEALTH_SYNC_CRON`, padrão `0 3 * * *`, fuso `HEALTH_SYNC_TIMEZONE`; `off`
  desliga). Nunca importa antes do dia 0 (`google_accounts.start_date`, o dia em que o Google foi
  conectado); depois dele, busca desde o dia da última sincronização (mínimo 7, máximo 90 dias). Nunca
  quebra a rota se falhar. Sem dados de atividade, o gasto do dia é o `tdee` do perfil.
- `src/chat/`: Claude (`claude-haiku-5-5`, o mais barato) com o contexto do usuário; sem `ANTHROPIC_API_KEY` o chat responde 503.
  `CHAT_ENABLED=false` não registra o `ChatModule` (rotas `/chat/*` dão 404; o código e a tabela ficam); no front, o
  mesmo papel é do `NEXT_PUBLIC_CHAT_ENABLED` (em produção, `docker-compose.prod.yml` passa o `CHAT_ENABLED` para os dois).
- `src/plan/composer/`: os pedidos ao Claude. Ele **não vê o catálogo** (TACO + TBCA não cabem no prompt):
  cita cada alimento no estilo das tabelas com kcal/macros aproximados por 100 g (`FOOD_NAMING`,
  `PER100G_SCHEMA` em `composition.ts`), e `FoodCatalog.match` (`src/plan/engine/foods.ts`) acha o do catálogo:
  palavras pesadas pela raridade, sinônimos (`SYNONYMS`, na forma de `stem`), a família do nome tem de estar no
  citado, calorias longe demais descartam; sem par → descartado. `parseFoods` e `parseSubstitutes` usam o
  `match` e depois descartam restritos e fora da dieta. O cliente e o modelo (`CLAUDE_MODEL`) ficam em
  `src/ai/`. Toda chamada ao Claude (chat, substitutos, plano individual) passa por `LlmLogService.track`
  (`src/ai/llm-log.service.ts`), que grava pedido, resposta ou erro, tokens e duração em `llm_calls`. Sugere substitutos ao trocar alimento (`substitution.ts`; até 8, sem crus se o original não for
  cru e nunca o próprio alimento em outro preparo, `isSameFood`); sem o Claude, os do mesmo grupo mais parecidos
  em macros e em kcal/100 g (`FoodCatalog.substituteOptions`), no máximo 2 por família do nome e sem duas
  versões do mesmo alimento. A troca aceita
  qualquer alimento do catálogo não restrito.
- Histórico de planos (`plan_versions`, `GET /history/plans`): o `PlanVersionService` grava, junto da foto do dia
  em `withPlanner`, a versão do plano quando os alimentos ou as gramas mudam (o horário não conta; nada enquanto a
  personalização está `pending`). A primeira é a montada (`edited: false`); depois, no máximo uma alterada por dia,
  que as outras mudanças do mesmo dia editam (`nextPlanVersion` em `src/plan/plan-versions.ts`). O que mudou entre
  duas versões é calculado na leitura (`planChanges`).

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
