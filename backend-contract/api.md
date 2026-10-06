# API do NutriAI

Endpoints que o front chama e as regras de negócio que o backend implementa. O front **só exibe**:
metas, plano do dia, porções, trocas, sugestões e estatísticas vêm prontos do backend.

Os tipos TypeScript de cada corpo e resposta estão em [`contract.ts`](contract.ts) —
se algo aqui divergir, os tipos valem.

## Código de referência

Antes, essas regras rodavam no navegador. O código antigo, em [`reference/`](reference/), é a referência exata
do comportamento (é código do front: os imports não resolvem aqui, serve só para ler):

| O quê | Onde |
| --- | --- |
| Dados de exemplo (plano, catálogo, sugestões, nutrientes, histórico, chat) | [`reference/mock-data.ts`](reference/mock-data.ts) |
| Meta calórica e água | [`reference/calorie-target.ts`](reference/calorie-target.ts) |
| Plano do dia, criar/remover refeição, acrescentar alimento, porções | [`reference/MealPlan.tsx`](reference/MealPlan.tsx) |
| Trocas de alimentos e substitutos | [`reference/food-substitution.ts`](reference/food-substitution.ts) |
| Busca de alimentos | [`reference/AddFoodDialog.tsx`](reference/AddFoodDialog.tsx) |
| O que era guardado por usuário | [`reference/auth.ts`](reference/auth.ts) |
| Estatísticas do histórico | [`reference/HistoryDashboard.tsx`](reference/HistoryDashboard.tsx), [`NutrientChart.tsx`](reference/NutrientChart.tsx), [`ActivityPanel.tsx`](reference/ActivityPanel.tsx) |

## Convenções

- **URL base:** a do backend; o front a recebe em `NEXT_PUBLIC_API_URL`. Todas as rotas abaixo são relativas a ela.
- **Formato:** JSON, nomes de campo em camelCase.
- **Autenticação:** as rotas marcadas com 🔒 exigem `Authorization: Bearer <token>`. Token inválido ou
  expirado → `401`; o front descarta o token e volta para `/login`.
- **Fuso do usuário:** toda requisição leva `X-Timezone` (IANA, ex.: `America/Sao_Paulo`). Use-o para
  saber qual é o "hoje" do usuário (plano do dia, mudanças que valem só hoje, lembrete de pesagem).
- **Erros:** status 4xx/5xx com corpo `{ "error": "mensagem em pt-BR" }`, mostrada ao usuário como está.
- **Datas:** dia como `"AAAA-MM-DD"`; data e hora em ISO 8601. Horário de refeição como `"HH:MM"`.
- **Quantidades de alimentos sempre em gramas** (`grams`), nunca medidas caseiras.
- **Números prontos para exibir:** gramas e kcal inteiros; o front não arredonda nem soma.
- **CORS:** libere a origem do front, os métodos `GET, POST, PUT, DELETE` e os cabeçalhos
  `Authorization, Content-Type, X-Timezone`.

## Autenticação

### `POST /auth/signup`

```json
{ "name": "Ana Souza", "username": "ana.souza", "password": "segredo123" }
```

`username` chega normalizado (minúsculas), 3–20 caracteres `[a-z0-9._]`; `password` com 6+ caracteres
(valide também no back). Usuário já existe → `409` `{ "error": "Esse usuário já está em uso." }`.
Resposta `201`: `{ "token": "..." }`. O usuário nasce sem perfil.

### `POST /auth/login`

```json
{ "username": "ana.souza", "password": "segredo123" }
```

Resposta `200`: `{ "token": "..." }`. Credenciais erradas → `401` `{ "error": "Usuário ou senha incorretos." }`.
Logout é só no front (descarta o token).

### Login com Google (e acesso à Google Health API)

O backend conduz todo o OAuth com o Google e guarda os tokens do usuário para chamar a Google Health API
depois. O front só redireciona o navegador e, na volta, troca um código de uso único pelo token da sessão.

```
Front /login ──► GET {API}/auth/google/start?redirect_uri&state ──► Google (consentimento)
      ▲                                                                   │
      │                      GET {API}/auth/google/callback  ◄────────────┘
      │                        (troca o code com o Google, cria/acha o usuário, guarda os tokens)
      └── {redirect_uri}?code=<uso único>&state=...   (ou ?error=...&state=...)
Front /login/google ──► POST {API}/auth/google/exchange ──► { token }
```

#### `GET /auth/google/start?redirect_uri=...&state=...`

Navegação do navegador (não é `fetch`), responde `302` para o Google.

- `redirect_uri`: a página de volta do front (`https://<front>/login/google`). **Aceite só origens de uma
  lista permitida** (ex.: variável `FRONTEND_URLS`); senão, responda `400`.
- `state`: valor aleatório do front. Guarde junto com o `redirect_uri` (ex.: no `state` que o backend manda ao
  Google, assinado, ou num cookie `HttpOnly` de curta duração) e devolva igual na volta.
- Na URL do Google use o callback **do backend** (registrado no Google Cloud Console), `response_type=code`,
  `access_type=offline` e `prompt=consent` (para receber o refresh token), e os escopos `openid email profile`
  mais os escopos de leitura da Google Health API que o app usa (atividade, calorias gastas…) — confira os
  nomes na documentação da Google Health API.

#### `GET /auth/google/callback` (do backend, chamado pelo Google)

1. Troca o `code` do Google pelos tokens e valida o `id_token`.
2. Encontra o usuário pelo `sub` do Google ou cria um novo (nome do Google; `username` gerado, ex.: a partir
   do e-mail). O usuário novo nasce sem perfil, como no cadastro.
3. Guarda o refresh token (criptografado) para a Google Health API.
4. Gera um **código de uso único** (válido por ~1 minuto, ligado a esse usuário e ao `redirect_uri`) e
   redireciona para `{redirect_uri}?code=<código>&state=<state>`.

Se o usuário cancelar (o Google devolve `error=access_denied`) ou algo falhar, redirecione para
`{redirect_uri}?error=<mensagem em pt-BR>&state=<state>` (ex.: `Login com o Google cancelado.`). O front mostra
a mensagem como está.

Não coloque o token da sessão na URL: ela fica no histórico do navegador e em logs.

#### `POST /auth/google/exchange`

```json
{ "code": "<código de uso único>", "redirectUri": "https://<front>/login/google" }
```

Resposta `200`: `{ "token": "..." }`, igual ao login. Código inválido, expirado, já usado ou com outro
`redirectUri` → `400` `{ "error": "O login com o Google expirou. Tente novamente." }`.

#### Conectar o Google a uma conta existente 🔒

Quem se cadastrou com usuário e senha conecta o Google no card "Google Health" do `/perfil` — é o que dá
acesso aos dados da Google Health API. Como a navegação do navegador não leva o `Authorization`, o front
pede a URL antes, com `fetch`:

`POST /me/google/link`

```json
{ "redirectUri": "https://<front>/perfil/google", "state": "<aleatório do front>" }
```

Resposta `200`: `{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }` — a URL de consentimento, já
com os mesmos escopos e parâmetros do login e com um `state` do backend que identifica **este usuário**
(ex.: assinado e de curta duração), o `redirectUri` (mesma lista permitida) e o `state` do front. O front
redireciona o navegador para ela.

No callback do backend (o mesmo `GET /auth/google/callback`, distinguindo pelo `state`): liga o `sub` do
Google a esse usuário, guarda os tokens e redireciona para `{redirectUri}?connected=1&state=<state do front>`.
Erros, cancelamento ou conta Google já ligada a **outro** usuário do NutriAI → `{redirectUri}?error=<mensagem>&state=...`
(ex.: `Essa conta Google já está conectada a outro usuário.`).

Depois de conectado, "Continuar com o Google" no `/login` entra nessa mesma conta (o backend acha o usuário
pelo `sub`).

`DELETE /me/google` → `Me`: desconecta (apaga os tokens do Google e para de importar). Contas criadas pelo
Google não têm senha: recuse com `409` (`me.google.canDisconnect` é `false` para elas, e o front nem mostra o
botão).

#### Dados da Google Health API

Com os tokens guardados, o backend busca os dados de saúde do usuário e os usa em `/history/activity`,
`burnedKcal` de `/nutrition/today` e `/activity-sources` (com `connected: true` e o `lastSync`).

## Usuário e perfil 🔒

### `GET /me` → `Me`

```json
{
  "user": { "name": "Ana Souza", "username": "ana.souza" },
  "profile": {
    "sex": "feminino",
    "age": 32,
    "weightKg": 68.5,
    "heightCm": 165,
    "activityLevel": "moderado",
    "goal": "perder",
    "mealsPerDay": 4,
    "weighInDay": 1
  },
  "targets": { "calories": 1660, "bmr": 1395, "tdee": 2163, "waterLiters": 2.4, "clampedToMinimum": false },
  "weighInDue": true,
  "google": { "email": "ana@gmail.com", "canDisconnect": true }
}
```

- `profile` e `targets` são `null` até o primeiro `PUT /me/profile` (o front leva o usuário para `/perfil`).
- `profile.sex`: `feminino | masculino`; `activityLevel`: `sedentario | leve | moderado | intenso | extremo`;
  `goal`: `perder | manter | ganhar`; `mealsPerDay`: 3–6; `weighInDay`: 0 = domingo … 6 = sábado.
- `weighInDue`: hoje (no fuso do usuário) é `profile.weighInDay` **e** não há pesagem registrada hoje.
- `google`: conta Google conectada (`null` se não houver). `canDisconnect` é `false` quando a conta foi criada
  pelo Google (é o único jeito de entrar).

### `PUT /me/profile` → `Me`

Corpo: o `profile` inteiro. Recalcula `targets`.

### `POST /profile/estimate` → `Targets`

Corpo: um `profile` completo, **sem salvar**. O formulário de perfil chama enquanto o usuário edita, para
mostrar a meta antes de salvar.

**Regras das metas**

- TMB (Mifflin-St Jeor): `10 × peso + 6,25 × altura − 5 × idade`, `+5` para masculino, `−161` para feminino.
- Gasto diário (`tdee`) = TMB × fator: sedentário 1,2; leve 1,375; moderado 1,55; intenso 1,725; extremo 1,9.
- Meta = gasto + ajuste do objetivo (perder −500, manter 0, ganhar +300), arredondada para dezenas, com
  piso de 1200 kcal (feminino) / 1500 kcal (masculino). `clampedToMinimum` = ficou abaixo do piso.
- Água = 35 ml por kg, em litros com uma casa decimal.
- `bmr` e `tdee` arredondados para inteiro.

## Pesos 🔒

### `GET /weights` → `WeightEntry[]`

Do mais antigo para o mais recente: `[{ "id": "w-1", "at": "2026-09-28T07:15:00.000Z", "kg": 68.2 }]`.
Pesagens são só histórico: não alteram `profile.weightKg` nem as metas.

### `POST /weights` → `WeightEntry[]`

Corpo: `{ "kg": 68.2, "at": "2026-09-28T07:15:00.000Z" }` (até 89 dias no passado, não no futuro). Responde a
lista completa atualizada. Depois o front busca `/me` de novo (para `weighInDue`).

## Plano alimentar 🔒

### `GET /plan/today` → `TodayPlan`

O plano de hoje com **todas** as mudanças do usuário aplicadas, ordenado por horário:

```json
{
  "canCreateMeal": true,
  "meals": [
    {
      "id": 1,
      "title": "Torrada de Abacate com Ovo Poché",
      "time": "07:30",
      "totals": { "carbs": 29, "protein": 13, "fat": 22, "kcal": 350 },
      "foods": [
        { "name": "Pão integral", "grams": 50, "carbs": 24, "protein": 6, "fat": 2, "kcal": 140, "extraId": null },
        { "name": "Banana-prata", "grams": 60, "carbs": 16, "protein": 1, "fat": 0, "kcal": 60, "extraId": "x-7" }
      ]
    }
  ]
}
```

- `totals` = soma dos alimentos já arredondados, como aparecem.
- `extraId` ≠ `null`: alimento acrescentado pelo usuário (tem botão de remover).
- `canCreateMeal`: há sugestões de refeição disponíveis (com o assistente, sempre; senão o botão "Nova refeição" fica desativado).

**Todas as rotas de alteração do plano abaixo respondem `200` com o `TodayPlan` atualizado.**

**Plano inicial**, antes das mudanças do usuário:

- Tem `profile.mealsPerDay` refeições: café, almoço e jantar sempre, mais um lanche da tarde (a partir de 4),
  um da manhã (5) e uma ceia (6). Depois o usuário cria ou remove refeições à vontade.
- As porções de todas as refeições são escaladas na mesma proporção para o total do dia ficar o mais perto
  possível de `targets.calories`. Sem perfil, ficam as porções de referência. Se a meta mudar, o plano todo
  acompanha (inclusive o que o usuário acrescentou).

**Como o plano de hoje é montado** (o que o usuário muda fica guardado em duas camadas):

- **Permanente** (até o usuário desfazer): refeições removidas com "não fazer nada", refeições criadas
  (ids ≥ 1001), alimentos acrescentados por refeição, horários escolhidos, trocas de alimentos e um fator de
  porção por refeição.
- **Só de hoje** (descartado quando o dia vira): refeições removidas com "redistribuir", refeições trocadas
  por uma sugestão e um fator de porção por refeição.
- Para cada refeição: aplica as trocas de alimentos (ver "Trocas"), junta os alimentos acrescentados e
  multiplica as porções por `fator permanente × fator de hoje` (gramas e nutrientes, arredondando; gramas no
  mínimo 1).
- Sempre que um fator sobe para compensar calorias, confira os valores **já arredondados**: se o total do dia
  passar do total anterior, reduza o fator aos poucos (×0,999) até caber. O dia nunca ganha calorias com uma
  ação do usuário, exceto ao criar refeição com meta calórica (ver "Criar refeição"), que leva o dia de volta
  para a meta.

### `PUT /plan/meals/{id}/time`

Corpo: `{ "time": "08:00" }`. Permanente.

### Remover refeição

`GET /plan/meals/{id}/removal-options` → `RemovalOptions`

```json
{
  "suggestion": { "title": "Iogurte Grego com Granola e Morangos", "kcal": 330 },
  "redistribution": [{ "mealId": 3, "title": "Bowl de Salmão", "time": "20:00", "before": 435, "after": 520 }]
}
```

`POST /plan/meals/{id}/removal` com `{ "option": "suggest" | "redistribute" | "nothing" }`:

- `suggest` (só hoje): troca pela sugestão de calorias mais próximas da porção original (fator 1) da
  refeição, entre as que ainda não estão no plano, preferindo as sem alimentos restritos. Mesmo id e horário.
  `suggestion` é `null` se não houver nenhuma.
- `redistribute` (só hoje): a refeição sai e as refeições **seguintes** (horário maior) aumentam as porções
  pelo mesmo fator, para receber as calorias dela, sem passar do total que o dia tinha. `redistribution`
  lista o antes/depois delas (vazio se não houver refeição depois — então a opção não vale).
- `nothing` (permanente): a refeição sai do plano; as calorias não são repostas. Se for uma refeição criada,
  apaga ela e os alimentos acrescentados a ela.

### Criar refeição

`POST /plan/meal-preview` com `{ "title": "Lanche pré-treino", "time": "16:00" }` → `CreateMealPreview`
(nada é salvo):

```json
{
  "suggestion": "Omelete de Queijo com Salada",
  "foods": [
    { "name": "Ovo, de galinha, inteiro, cozido/10minutos", "grams": 100, "carbs": 1, "protein": 13, "fat": 10, "kcal": 146 },
    { "name": "Queijo, minas, frescal", "grams": 40, "carbs": 1, "protein": 7, "fat": 8, "kcal": 106 },
    { "name": "Alface, crespa, crua", "grams": 40, "carbs": 1, "protein": 1, "fat": 0, "kcal": 4 }
  ],
  "totals": { "carbs": 3, "protein": 21, "fat": 18, "kcal": 256 },
  "reductionPercent": 17,
  "changes": [{ "mealId": 1, "title": "Torrada de Abacate", "time": "07:30", "before": 350, "after": 290 }],
  "dayKcal": 1160
}
```

`POST /plan/meals` com o mesmo corpo cria de fato (permanente).

- Os alimentos são escolhidos pelo assistente (Claude) entre os do catálogo, considerando o nome da refeição,
  o horário, os alimentos restritos, as outras refeições do dia e quanto falta de cada macronutriente. O
  backend valida os nomes e calcula porções e nutrientes pelo catálogo. `suggestion` é o nome que o
  assistente deu e `foods` são os alimentos nas porções em que vão entrar. O `POST /plan/meals` com o mesmo
  nome e horário usa a mesma sugestão da prévia (guardada por 15 minutos).
- Sem o assistente (sem chave da API ou se ele falhar), os alimentos vêm de uma sugestão fixa do período do
  horário (manhã < 11:00, tarde < 17:00, noite), preferindo uma que ainda não está no plano e sem alimentos
  restritos.
- **Com meta calórica** (usuário com perfil): depois de criar, o dia volta para a meta. A refeição nova fica
  com `targets.calories ÷ (nº de refeições + 1)` e todas as outras ajustam as porções pelo mesmo fator para o
  total ficar o mais perto possível da meta, sem passar dela. Com o plano vazio, a nova fica com a meta inteira.
- **Sem meta:** a porção da sugestão é reduzida para no máximo `calorias do dia ÷ (nº de refeições + 1)` e as
  outras reduzem as porções para o total do dia não mudar. Com o plano vazio, a sugestão entra com a porção
  original.
- `reductionPercent` = quanto as outras refeições diminuem (%); **negativo = aumentam** (o dia estava abaixo
  da meta). `changes` = antes/depois de cada uma; `dayKcal` = total do dia depois de criar.

### Acrescentar alimento

`GET /plan/meals/{id}/food-search?q=banana` → `FoodSearchResult`

```json
{
  "found": true,
  "restricted": null,
  "options": [
    {
      "food": { "name": "Banana-prata", "grams": 60, "carbs": 16, "protein": 1, "fat": 0, "kcal": 60 },
      "reductionPercent": 4
    }
  ]
}
```

- Procura no catálogo, sem diferenciar maiúsculas nem acentos, os alimentos cujo nome **contém** o texto
  (`found: true`). Se nenhum, devolve os 5 mais parecidos (`found: false`); o front antigo usava
  semelhança por pares de letras (coeficiente de Dice sobre bigramas).
- Alimentos restritos pelo usuário nunca aparecem. Se o texto é exatamente um alimento restrito,
  `restricted` traz o nome e a marcação dele.
- Porção de cada opção: as calorias médias por alimento da refeição (`kcal da refeição ÷ (nº de alimentos + 1)`,
  ou 100 kcal se der 0), convertidas em gramas pelo catálogo.
- `reductionPercent`: quanto as porções de **todas** as refeições diminuem para o dia não ganhar calorias.

`POST /plan/meals/{id}/foods` com `{ "foodName": "Banana-prata" }` acrescenta (permanente), com a porção e a
redução da busca. Guarde o alimento na porção "fator 1" da refeição, para ele acompanhar as mudanças de
porção dela.

`DELETE /plan/meals/{id}/foods/{extraId}` remove um alimento acrescentado; as calorias dele voltam para
todas as refeições (porções aumentam pelo mesmo fator, sem passar do total que o dia tinha).

### Trocar alimento ("Substituir alimento")

`GET /plan/meals/{id}/substitutes?food=Guacamole` → `PlanFood[]`: alimentos do **mesmo grupo** do catálogo,
sem o próprio e sem os restritos pelo usuário, cada um numa porção com as **mesmas calorias** do alimento
como aparece na refeição.

`POST /plan/meals/{id}/swaps` com:

```json
{ "foodName": "Guacamole", "reason": "nao-gosto", "substitute": "Abacate" }
```

- `substitute: null` = o alimento sai sem substituto.
- `nao-gosto` / `nao-tenho`: troca **permanente em todas as refeições**, e o alimento fica restrito com essa
  marcação.
- `nao-quero`: troca **permanente só nesta refeição** (as outras continuam com ele), e o alimento fica
  restrito com `nao-quero` **só se ainda não tiver marcação**.
- Ao montar o plano, as trocas da refeição valem por cima das gerais, e seguem a cadeia (A → B e depois
  B → C = C), no máximo 5 passos. O substituto entra com as mesmas calorias do trocado.

### `/foods/restricted` — página Alimentos

`GET /foods/restricted` → `RestrictedFood[]`

```json
[{ "name": "Guacamole", "feedback": "nao-gosto", "group": "gorduras", "onlyInMeal": false, "substitute": "Abacate" }]
```

`onlyInMeal: true` para `nao-quero`. `substitute: null` = removido sem substituto. `group`:
`carboidratos | proteinas | laticinios | gorduras | frutas | vegetais | adocantes | acidos` (ou `null`).

`DELETE /foods/restricted/{name}` ("Liberar") → `RestrictedFood[]` atualizada. Só tira a restrição (o
alimento volta a poder ser sugerido e oferecido); **as trocas já feitas continuam**.

**Alimentos restritos:** nunca aparecem como substitutos nem na busca, e as sugestões de refeição (criar,
"sugerir uma nova") preferem as que não os usam.

## Nutrientes 🔒

### `GET /nutrition/today` → `NutritionToday`

```json
{
  "consumedKcal": 1985,
  "burnedKcal": 2210,
  "macros": [
    { "id": "proteinas", "name": "Proteínas", "atual": 81, "meta": 137, "unit": "g", "perKg": { "atual": 1.2, "meta": 2 } },
    { "id": "gorduras", "name": "Gorduras", "atual": 36, "meta": 69, "unit": "g", "perKg": { "atual": 0.5, "meta": 1 } },
    { "id": "carboidratos", "name": "Carboidratos", "atual": 140, "meta": 124, "unit": "g", "perKg": { "atual": 2, "meta": 1.8 } }
  ],
  "fibers": [{ "id": "fibras", "name": "Fibras", "atual": 22, "meta": 30, "unit": "g" }],
  "otherMacros": [{ "id": "acucares", "name": "Açúcares", "atual": 38, "meta": 50, "unit": "g", "limit": true }],
  "vitamins": [{ "id": "vitamina-c", "name": "Vitamina C", "atual": 95, "meta": 90, "unit": "mg" }],
  "minerals": [{ "id": "sodio", "name": "Sódio", "atual": 1800, "meta": 2000, "unit": "mg", "limit": true }]
}
```

- `consumedKcal`: calorias consumidas hoje (o front antigo usava macros × 4/9/4 kcal por grama).
- `burnedKcal`: gasto de hoje do Google Fit / Apple Saúde; `null` sem dados.
- `limit: true` quando `meta` é um máximo (açúcares, gordura saturada, colesterol, sódio).
- `macros` precisa ter os ids `proteinas`, `gorduras` e `carboidratos` (o front usa para as cores).
- Metas dos macros com perfil: proteína 2 g/kg e gordura 1 g/kg de peso; o carboidrato fica com o restante
  da meta calórica (4/9/4 kcal por grama, nunca negativo). Sem perfil, metas padrão.
- `perKg`: `atual` e `meta` divididos pelo peso do perfil (g/kg, uma casa decimal); `null` sem perfil. A barra
  de progresso do card "Meta diária" mostra esses valores.

### `GET /nutrients/groups` → `NutrientGroup[]`

Seletor do gráfico de nutrientes do histórico:

```json
[
  { "name": "Macronutrientes", "nutrients": [{ "id": "proteinas", "name": "Proteínas", "unit": "g" }] },
  { "name": "Vitaminas", "nutrients": [{ "id": "vitamina-c", "name": "Vitamina C", "unit": "mg" }] },
  { "name": "Minerais", "nutrients": [{ "id": "sodio", "name": "Sódio", "unit": "mg", "limit": true }] }
]
```

## Histórico 🔒

O front pede `days` = 7, 30 ou 90. Dias do mais antigo para o mais recente, o último é hoje.

### `GET /history/summary?days=N` → `HistorySummary`

```json
{
  "avgConsumed": 2010,
  "avgBurned": 2180,
  "avgBalance": -170,
  "daysOnGoal": 18,
  "totalDays": 30,
  "calorieGoal": 1660,
  "goalTolerance": 150
}
```

Médias arredondadas; `avgBalance` = consumida − gasta. Um dia está "dentro da meta" quando o consumo fica a
até `goalTolerance` (150) kcal da meta calórica.

### `GET /history/activity?days=N` → `ActivityHistory`

```json
{
  "days": [
    {
      "date": "2026-09-28",
      "consumed": 1985,
      "burned": 2210,
      "activeCalories": 560,
      "steps": 9800,
      "activeMinutes": 72,
      "distanceKm": 7.4,
      "source": "Google Fit"
    }
  ],
  "averages": { "steps": 8350, "activeCalories": 480, "activeMinutes": 61 },
  "totalDistanceKm": 187
}
```

Médias por dia e distância total arredondadas para inteiro.

### `GET /history/nutrients/{id}?days=N` → `NutrientHistory`

```json
{
  "nutrient": { "id": "sodio", "name": "Sódio", "unit": "mg", "meta": 2000, "limit": true },
  "days": [{ "date": "2026-09-28", "value": 1800 }],
  "average": 1840,
  "averagePercent": 92,
  "daysOnGoal": 9,
  "daysOverLimit": 4
}
```

Dia sem registro vale 0. `averagePercent` = média em % da meta. `daysOnGoal` = dias com valor ≥ meta;
`daysOverLimit` = dias com valor > meta (o front mostra um ou outro conforme `limit`).

### `GET /history/plans` → `PlanHistoryDay[]`

Dias anteriores, do mais recente para o mais antigo:

```json
[
  {
    "date": "2026-09-27",
    "followedCount": 3,
    "plannedKcal": 1440,
    "meals": [{ "time": "07:30", "title": "Panqueca de Aveia com Banana", "kcal": 380, "followed": true }],
    "flaggedFoods": [{ "name": "Guacamole", "feedback": "nao-quero" }]
  }
]
```

### `GET /activity-sources` → `ActivitySource[]`

```json
[
  { "name": "Google Fit", "platform": "Android", "connected": true, "lastSync": "2026-09-28T01:14:00.000Z" },
  { "name": "Apple Saúde", "platform": "iOS", "connected": false, "lastSync": null }
]
```

## Chat 🔒

- `GET /chat/messages` → `ChatMessage[]`: conversa do usuário, da mais antiga para a mais recente
  (`{ "id": "m-1", "role": "assistant" | "user", "text": "..." }`).
- `POST /chat/messages` com `{ "text": "..." }` → `ChatMessage`: guarda a mensagem do usuário e responde com a
  **resposta do assistente**.
- `GET /chat/suggestions` → `string[]`: perguntas sugeridas no painel lateral.
