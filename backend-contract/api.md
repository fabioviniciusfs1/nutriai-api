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
| Plano do dia, acrescentar alimento, porções | [`reference/MealPlan.tsx`](reference/MealPlan.tsx) |
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

Quem se cadastrou com usuário e senha conecta o Google na página "Conexão Google Health" (`/google-health`, no
menu que abre ao clicar no nome; o retorno do Google continua em `/perfil/google`) — é o que dá
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
    "targetWeightKg": 60
  },
  "routine": {
    "eatingWindows": [
      { "start": "07:00", "end": "08:30" },
      { "start": "12:00", "end": "13:30" },
      { "start": "19:00", "end": "21:00" }
    ],
    "wakeTime": "06:30",
    "sleepTime": "23:00",
    "trainingStart": "18:00",
    "trainingEnd": "19:00",
    "meals": ["cafe-da-manha", "almoco", "lanche-da-tarde", "jantar"],
    "hungriestPeriod": "noite",
    "leastHungryPeriod": "manha",
    "weighInDay": 1,
    "diet": "vegetariana"
  },
  "targets": { "calories": 1660, "bmr": 1395, "tdee": 2163, "waterLiters": 2.4, "waterMlPerKg": 35, "clampedToMinimum": false },
  "weighInDue": true,
  "google": { "email": "ana@gmail.com", "canDisconnect": true }
}
```

- O cadastro tem dois passos: perfil e rotina. `profile` e `targets` são `null` até o primeiro
  `PUT /me/profile` (o front leva o usuário para `/perfil`); `routine` é `null` até o primeiro `PUT /me/routine`
  (o front leva para `/rotina`). As outras páginas exigem os dois.
- `profile.sex`: `feminino | masculino`; `activityLevel`: `sedentario | leve | moderado | intenso | extremo`;
  `goal`: `perder | manter | ganhar`. `targetWeightKg`: peso meta em kg; `null` com objetivo manter
  (ou em perfis salvos antes do peso meta). Ver `PUT /me/profile` e `PUT /me/target-weight`.
- `routine`: ver `PUT /me/routine`. `weighInDay`: 0 = domingo … 6 = sábado.
- `routine.diet`: `onivora | pescetariana | vegetariana | vegana` ("Escolha o tipo de alimentação."). O backend
  tira do plano individual e dos substitutos o que a dieta exclui (pescetariana: carnes;
  vegetariana: carnes e peixes; vegana: tudo de origem animal, inclusive ovos, laticínios e mel), pela origem
  animal de cada alimento do catálogo (categoria da TACO e nome, nos pratos prontos).
- `weighInDue`: hoje (no fuso do usuário) é `routine.weighInDay` **e** não há pesagem registrada hoje.
- `google`: conta Google conectada (`null` se não houver). `canDisconnect` é `false` quando a conta foi criada
  pelo Google (é o único jeito de entrar).

### `PUT /me/profile` → `Me`

Corpo: o `profile` inteiro. Recalcula `targets`. Não monta o plano individual (isso é da rotina).

- `targetWeightKg` (peso meta): obrigatório com objetivo perder (menor que `weightKg`) ou ganhar (maior)
  ("Informe o peso meta."); com manter, ausente ou `null` ("Com o objetivo de manter o peso, não há peso meta.").
  30–300 kg com uma casa decimal ("O peso meta deve estar entre 30 e 300 kg."). Outros erros: "Para perder peso, o peso meta deve ser menor que o
  atual.", "Para ganhar peso, o peso meta deve ser maior que o atual.". Não muda as metas.

### `PUT /me/target-weight` → `Me`

Corpo: `{ "targetWeightKg": 62.5 }` (`null` só com objetivo manter). O perfil fica fixo depois do cadastro, mas o
peso meta pode mudar quando quiser (o card "Peso meta" em `/perfil`). Só troca esse campo: não muda as metas
nem o plano. Sem perfil → `400` "Preencha o perfil primeiro."; as regras e mensagens são as de `PUT /me/profile`,
contra o perfil salvo.

### `PUT /me/routine` → `Me`

Corpo: a `routine` inteira. Sem perfil → `400` "Preencha o perfil primeiro.".

- `eatingWindows`: de 1 a 12 janelas `{ "start": "HH:MM", "end": "HH:MM" }` em que a pessoa pode comer, iguais
  todos os dias: início antes do fim, em ordem e sem sobreposição (uma pode começar quando a outra termina).
  O front mostra as horas do dia todas disponíveis e a pessoa desmarca as que não pode; cada hora disponível vale
  até o minuto 59 dela (sem encostar na hora seguinte) e as vizinhas viram uma janela só (07, 08 e 12
  disponíveis → `07:00–08:59` e `12:00–12:59`).
  Erros: "Informe pelo menos um horário disponível para comer.", "Em cada horário disponível, o início deve ser
  antes do fim.", "Os horários disponíveis para comer devem estar em ordem e não podem se sobrepor.".
- `wakeTime`, `sleepTime`: `"HH:MM"` (dormir pode ser antes de acordar: depois da meia-noite).
- `trainingStart`, `trainingEnd`: `"HH:MM"` os dois, ou `null` os dois (não treina; na tela, a escolha
  "Treino / Não treino"). Só um preenchido → "Informe o início e o fim do treino."; iguais → "O treino deve
  terminar depois de começar."; o fim pode ser antes do início (treino que passa da meia-noite).
- As janelas de `eatingWindows` não podem ter nenhum minuto dentro do sono (de `sleepTime` até `wakeTime`) nem
  do treino: `400` "Os horários para comer não podem cair no horário de sono ou de treino.". Encostar pode (treino
  das 06:00 às 07:00 → janela `07:00–08:00`). O front já tira esses horários da grade.
- `hungriestPeriod`, `leastHungryPeriod`: `manha | tarde | noite` (manhã até 10:59, tarde até 16:59) ou `null`
  (na tela, "Não sinto": a pessoa não tem um período com mais, ou com menos, fome). Quando os dois são períodos,
  têm de ser diferentes ("O período de mais fome e o de menos fome devem ser diferentes.").
- `meals`: as refeições que a pessoa faz no dia, de `cafe-da-manha | lanche-da-manha | almoco |
  lanche-da-tarde | jantar | ceia` — qualquer combinação com pelo menos uma ("Marque pelo menos uma refeição."),
  sem repetir nem valores de fora ("Escolha as refeições que você faz no dia."). A resposta traz na ordem do dia.
- `weighInDay`, `diet`: como em `GET /me`.

Na **primeira vez** (rotina era `null`) e com o assistente configurado, começa a montagem do **plano
individual** em segundo plano (ver "Plano individual" em `GET /plan/today`); a resposta não espera por ela.
Salvar a rotina de novo **não** monta outro plano: o front pergunta ao usuário e, se ele quiser, chama
`POST /plan/personalize`. Sem refazer, a rotina nova vale para o que não depende do plano individual
(refeições do plano padrão, tipo de alimentação nos substitutos, dia da pesagem).

### `POST /profile/estimate` → `Targets`

Corpo: um `profile` completo, **sem salvar**. O formulário de perfil chama enquanto o usuário edita, para
mostrar a meta antes de salvar.

**Regras das metas**

- TMB (Mifflin-St Jeor): `10 × peso + 6,25 × altura − 5 × idade`, `+5` para masculino, `−161` para feminino.
- Gasto diário (`tdee`) = TMB × fator: sedentário 1,2; leve 1,375; moderado 1,55; intenso 1,725; extremo 1,9.
- Meta = gasto + ajuste do objetivo (perder −500, manter 0, ganhar +300), arredondada para dezenas, com
  piso de 1200 kcal (feminino) / 1500 kcal (masculino). `clampedToMinimum` = ficou abaixo do piso.
- Água = 35 ml por kg (`waterMlPerKg`), em litros com uma casa decimal (`waterLiters`).
- `bmr` e `tdee` arredondados para inteiro.

### `POST /profile/projection` → `WeightProjection`

Corpo: um `profile` completo com `targetWeightKg`, **sem salvar**. O card "Peso meta" de `/perfil` chama enquanto
o usuário edita (só com objetivo perder ou ganhar), no cadastro e depois dele, para mostrar em quanto tempo chega
ao peso meta num gráfico de linha.

```json
{
  "months": 4.3,
  "duration": { "months": 4, "days": 8 },
  "weeklyChangeKg": -0.5,
  "points": [
    { "month": 0, "date": "2026-10-20", "weightKg": 68.5 },
    { "month": 1, "date": "2026-11-20", "weightKg": 66.5 },
    { "month": 2, "date": "2026-12-20", "weightKg": 64.5 },
    { "month": 3, "date": "2027-01-20", "weightKg": 62.5 },
    { "month": 4, "date": "2027-02-20", "weightKg": 60.5 },
    { "month": 4.3, "date": "2027-02-28", "weightKg": 60 }
  ]
}
```

- Regra clássica: ~7.700 kcal de sobra (ou de falta) = 1 kg. Diferença diária = `calories − tdee` das metas do
  perfil (perder ≈ −500, ganhar ≈ +300; menor quando a meta foi elevada ao piso), sempre a mesma: a projeção é
  uma reta. Mês = 365,25 ÷ 12 dias.
- `duration`: o mesmo tempo em meses inteiros e dias, do primeiro ao último ponto (o front mostra "em cerca de
  4 meses e 8 dias"). `months` e `weeklyChangeKg` com uma casa decimal (`weeklyChangeKg` negativo ao perder). `points`: um ponto por
  mês desde o mês 0 (peso atual), pesos com uma casa; o último é o peso meta em `months`.
- `date` de cada ponto: o mês 0 é o dia em que o peso meta foi salvo (`PUT /me/profile` ou `PUT /me/target-weight`
  guardam o dia quando ele muda); se o corpo traz outro peso meta que o salvo (ou ainda não há perfil), é hoje
  (pelo `X-Timezone`). Os meses seguintes caem no mesmo dia do calendário (o último dia do mês quando ele não
  existe); o último ponto soma os dias da fração do mês. O gráfico mostra o eixo como `DD/MM/AAAA`.
- O perfil segue as regras de `PUT /me/profile` (com manter não há projeção). Também `400`
  ao perder com a meta no piso acima do gasto, "Com a meta mínima de calorias, não dá para
  estimar quando o peso meta chega. Procure um nutricionista.".

### Ajuste da dieta — `/me/diet`

Página "Ajuste da dieta" (card "Minha conta"). Exemplo: 80 kg, meta de 2260 kcal. Todas as rotas exigem o perfil (`400` "Preencha o perfil
primeiro." sem ele) e respondem `DietAdjustment`:

```json
{
  "settings": { "proteinPerKg": 1.8, "fatPerKg": 1, "eggUnitGrams": 55 },
  "calories": 2260,
  "perKg": { "proteinas": 1.8, "gorduras": 1, "carboidratos": 3.01 },
  "grams": { "proteinas": 144, "gorduras": 80, "carboidratos": 241 },
  "split": { "proteinas": 25, "gorduras": 32, "carboidratos": 43 },
  "minPerKg": { "proteinas": 1.6, "gorduras": 0.5, "carboidratos": 0 },
  "maxPerKg": { "proteinas": 4.81, "gorduras": 2.33, "carboidratos": 4.13 }
}
```

- `GET /me/diet`: o ajuste salvo; sem ajuste, os padrões (proteína 2 g/kg, gordura 1 g/kg, ovo de 55 g).
- `POST /me/diet/estimate` (`DietEstimateRequest`), **sem salvar**: aplica a mudança de um macro com a
  compensação. O front chama a cada − / + (passo de 0,1 g/kg) e mostra a resposta.
- `PUT /me/diet` (`DietSettings`): salva. Vale na hora para as metas de `/nutrition/today` e do histórico, para
  as porções de `/plan/today` e para o próximo plano individual.

**Regras**

- A meta calórica do dia não muda: `calories` = meta do perfil (`Targets.calories`). Proteína e gordura em g/kg do
  peso do perfil; carboidrato = o restante das calorias (4/9/4 kcal por grama).
- Mínimos: proteína **1,6 g/kg**, gordura **0,5 g/kg**, carboidrato 0.
- Mudar a proteína ou a gordura compensa no carboidrato (o carboidrato sobe quando elas descem, e desce quando
  elas sobem). Mudar o carboidrato compensa na gordura.
- Valor abaixo do mínimo vira o mínimo; acima do máximo (o que deixaria o macro compensado abaixo do mínimo dele)
  vira o máximo. `minPerKg` e `maxPerKg` dizem os limites com o ajuste atual.
- `perKg` com duas casas decimais (o front mostra uma), `grams` inteiros, `split` como `macroSplit` de
  `/nutrition/today`.
- `eggUnitGrams`: inteiro de 30 a 90 g. Os ovos do plano (de galinha, inteiros) vão em unidades inteiras desse
  peso (ver `units` em `GET /plan/today`).
- `PUT` valida: `400` com "A proteína deve ser de pelo menos 1,6 g/kg.", "A gordura deve ser de pelo menos
  0,5 g/kg.", "Proteína e gordura passam da meta de calorias." ou "O peso do ovo deve estar entre 30 e 90 g.".

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
  "personalization": "ready",
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
- `units`: só nos ovos de galinha inteiros (cozido, frito, poché…), quantas unidades; `grams` = `units` ×
  `eggUnitGrams` do ajuste da dieta (55 g por padrão). As porções desses ovos sempre ficam em unidades inteiras
  (pelo menos 1), menos no alimento extra com as gramas do usuário. O front mostra "2 unidades · 110 g".
- `personalization`: montagem do plano individual — `pending` (montando; `meals` traz o plano atual, mas o front
  mostra só um card "Montando seu plano personalizado…" e pergunta de novo a cada poucos segundos), `ready` (aplicado), `failed` (não deu certo; o plano não muda) ou `null`
  (nunca pedido: sem assistente).

**Todas as rotas de alteração do plano abaixo respondem `200` com o `TodayPlan` atualizado.**

**Plano individual**: na primeira rotina, o assistente monta as refeições do plano base que o usuário marcou em
`routine.meals` (mesmos ids; cada uma no seu papel: café da manhã, lanche, almoço…), com o perfil, as metas do dia, o tipo de alimentação, os restritos e a
rotina. Ele escolhe o **horário** de cada refeição dentro de `eatingWindows` e distribui as calorias pela rotina
(refeições maiores no período de mais fome, menores no de menos, uma refeição perto do treino, leve perto de
dormir). A refeição dura até 30 minutos e termina pelo menos 30 minutos antes do fim da janela: o horário vai
do início da janela até 1 hora antes da hora cheia em que ela acaba (janela `12:00–13:59` → de 12:00 a 13:00;
`07:00–07:59` → só 07:00); os limites abaixo usam esses horários. Entre uma refeição e a seguinte, **no máximo 6 horas** (o sono da noite não conta), salvo quando as
janelas não permitem: se 6 horas depois de uma refeição o usuário não pode comer, a próxima vem no início da
próxima janela (ex.: janelas 12:00–13:00 e 19:00–20:00, almoço às 12:00 → jantar até as 19:00). Horário do
assistente que passa desse limite é adiantado até ele; os outros ficam. Se algum horário vier fora das janelas,
repetido, ilegível ou fora da ordem do dia, o backend espalha as refeições pelas janelas (uma em cada, no meio
dela, quando há janelas suficientes; as que sobram nas mais longas), em passos de 5 minutos, e adianta as que
passariam do limite.
Só alimentos do catálogo
entram; os restritos e os de fora da dieta são descartados. Quando fica pronto, as mudanças feitas no plano
(inclusive horários escolhidos pelo usuário) são zeradas; as restrições e trocas gerais ficam. Refeição base
sem versão do assistente (ex.: o usuário marcou mais uma refeição depois, sem refazer) continua a padrão.
Sem o assistente, o plano padrão fica com os horários do plano base.

### `POST /plan/personalize` → `TodayPlan`

Monta o plano individual de novo, com o perfil e a rotina atuais: é o "Refazer meu plano" depois de mudar a
rotina e o "tentar de novo" depois de uma falha. Responde na hora, já com `pending`. Com uma montagem em
andamento → `409` "Seu plano já está sendo montado."; sem perfil ou rotina → `409` "Preencha o perfil e a
rotina para montar o plano."; sem o assistente → `503` "O assistente está indisponível agora. Tente de novo em
instantes.".

**Plano inicial**, antes das mudanças do usuário:

- Tem as refeições de `routine.meals` (as do plano individual, quando houver), uma do plano base para cada: café da
  manhã, lanche da manhã, almoço, lanche da tarde, jantar e ceia. Sem rotina: café da manhã, almoço e jantar.
  Para incluir ou tirar uma refeição, o usuário muda a rotina (`PUT /me/routine`); não há rota para criar nem
  remover refeição avulsa.
- As porções de todas as refeições são escaladas na mesma proporção para o total do dia ficar o mais perto
  possível de `targets.calories`. Sem perfil, ficam as porções de referência. Se a meta mudar, o plano todo
  acompanha, menos os alimentos extras (ficam nas gramas que o usuário escolheu).

**Como o plano de hoje é montado** (o que o usuário muda é permanente, até ele desfazer: horários escolhidos,
alimentos acrescentados por refeição, trocas de alimentos e um fator de porção por refeição):

- Para cada refeição: aplica as trocas de alimentos (ver "Trocas"), multiplica as porções pelo fator dela
  (gramas e nutrientes, arredondando; gramas no mínimo 1) e junta os alimentos extras, nas gramas do usuário
  (sem o fator).
- Sempre que um fator sobe para compensar calorias, confira os valores **já arredondados**: se o total do dia
  passar do total anterior, reduza o fator aos poucos (×0,999) até caber. Só o alimento extra aumenta as
  calorias do dia.

### `PUT /plan/meals/{id}/time`

Corpo: `{ "time": "08:00" }`. Permanente.

### Incluir ou tirar refeição

Não há rota para criar nem remover uma refeição avulsa: as refeições do dia vêm de `routine.meals`. Para
incluir ou tirar uma, o usuário muda a rotina (`PUT /me/routine`). Uma refeição incluída entra com a versão
padrão do plano base (ou a do assistente, se ele refizer o plano com `POST /plan/personalize`).

### Acrescentar alimento extra

`GET /plan/meals/{id}/food-search?q=banana` → `FoodSearchResult`

```json
{
  "found": true,
  "restricted": null,
  "options": [
    {
      "food": { "name": "Banana-prata", "grams": 60, "carbs": 16, "protein": 1, "fat": 0, "kcal": 60 }
    }
  ]
}
```

- Procura no catálogo, sem diferenciar maiúsculas nem acentos, os alimentos cujo nome **contém** o texto
  (`found: true`). Se nenhum, devolve os 5 mais parecidos (`found: false`); o front antigo usava
  semelhança por pares de letras (coeficiente de Dice sobre bigramas).
- Alimentos restritos pelo usuário nunca aparecem. Se o texto é exatamente um alimento restrito,
  `restricted` traz o nome e a marcação dele.
- Porção sugerida de cada opção (o valor inicial das gramas no diálogo): as calorias médias por alimento da
  refeição (`kcal da refeição ÷ (nº de alimentos + 1)`, ou 100 kcal se der 0), convertidas em gramas pelo
  catálogo.

`GET /plan/meals/{id}/food-portion?food=Banana-prata&grams=150` → `PlanFood`: prévia da quantidade que o
usuário digitou (gramas e nutrientes calculados). `grams`: inteiro de 1 a 2000; fora disso, `400`
"Informe a quantidade em gramas (1 a 2000).". Alimento restrito ou fora do catálogo: o mesmo erro do `POST`.

`POST /plan/meals/{id}/foods` com `{ "foodName": "Banana-prata", "grams": 150 }` acrescenta o alimento extra
(permanente) nas gramas do usuário. `grams` como na prévia. As gramas ficam **fixas** (não acompanham o fator
da refeição nem a meta), as outras refeições não mudam e as calorias do extra **somam** às do dia.

`DELETE /plan/meals/{id}/foods/{extraId}` remove um alimento extra; as outras refeições não mudam.

### Trocar alimento ("Substituir alimento")

`GET /plan/meals/{id}/substitutes?food=Guacamole` → `PlanFood[]`: **até 8** substitutos, cada um numa porção
com as **mesmas calorias** do alimento como aparece na refeição, sem o próprio e sem os restritos pelo usuário.

- Com o assistente: ele sugere os nomes (de qualquer grupo), pensando na refeição e no horário, e o backend
  devolve só os que existem no catálogo, na ordem dele. Se o alimento não é cru, os crus são descartados.
  A resposta pode levar alguns segundos.
- Sem o assistente (ou se ele falhar ou não sugerir nada válido): os do **mesmo grupo** mais parecidos —
  primeiro os da mesma família (mesmo começo do nome, ex. "Arroz, …"), sem preferir os crus, e pela proporção
  de proteína, gordura e carboidrato.
- Alimentos fora do tipo de alimentação do perfil nunca entram (nem são aceitos no `POST /swaps`).
- Lista vazia: não há substitutos (o usuário ainda pode escolher "Sem substituto").
- **"Ver mais"**: a mesma rota com um `exclude` para cada nome já mostrado
  (`?food=Guacamole&exclude=Abacate&exclude=Azeite%20de%20oliva`; um parâmetro por nome, porque os nomes têm
  vírgula) devolve até 8 opções **novas**, sem nenhum dos excluídos. Lista vazia = não há mais opções. Vale
  no máximo 64 nomes em `exclude` (o resto é ignorado), então o front para de oferecer o "Ver mais" com 64
  opções na tela.
- **Pesquisa** (quem já sabe o que quer comer): `?food=Guacamole&q=banana` devolve, sem chamar o assistente, até
  **20** alimentos do catálogo cujo nome contém o texto (sem diferenciar maiúsculas, acentos e pontuação; se
  nenhum bate, os mais parecidos), de **qualquer grupo**, com as mesmas calorias, sem o próprio, sem os
  restritos e sem os de fora do tipo de alimentação. O diálogo de troca abre só com a pesquisa e o card "Sem
  substituto"; as sugestões vêm quando o usuário clica em "Sugerir".

`POST /plan/meals/{id}/swaps` com:

```json
{ "foodName": "Guacamole", "reason": "nao-gosto", "substitute": "Abacate" }
```

- `substitute: null` = o alimento sai sem substituto.
- `substitute`: qualquer alimento do catálogo com calorias, que não seja o próprio nem esteja restrito
  (senão `400` "Esse substituto não está disponível para este alimento.").
- `nao-gosto` / `nao-tenho` / `nao-posso`: troca **permanente em todas as refeições**, e o alimento fica restrito com essa
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

**Alimentos restritos:** nunca aparecem como substitutos nem na busca.

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
  "fiberPerKg": 0.3,
  "kcalPerKg": 26.2,
  "macroSplit": { "proteinas": 25, "gorduras": 25, "carboidratos": 50 },
  "otherMacros": [{ "id": "acucares", "name": "Açúcares", "atual": 38, "meta": 50, "unit": "g", "limit": true }],
  "vitamins": [{ "id": "vitamina-c", "name": "Vitamina C", "atual": 95, "meta": 90, "unit": "mg" }],
  "minerals": [{ "id": "sodio", "name": "Sódio", "atual": 1800, "meta": 2000, "unit": "mg", "limit": true }]
}
```

- `consumedKcal`: calorias consumidas hoje (o front antigo usava macros × 4/9/4 kcal por grama).
- `burnedKcal`: gasto de hoje do Google Fit / Apple Saúde; `null` sem dados.
- `limit: true` quando `meta` é um máximo (açúcares, gordura saturada, colesterol, sódio).
- `macros` precisa ter os ids `proteinas`, `gorduras` e `carboidratos` (o front usa para as cores).
- Metas dos macros com perfil: proteína e gordura em g/kg do ajuste da dieta (`/me/diet`; padrão 2 g/kg e
  1 g/kg); o carboidrato fica com o restante da meta calórica (4/9/4 kcal por grama, nunca negativo). Sem
  perfil, metas padrão.
- `perKg`: `atual` e `meta` divididos pelo peso do perfil (g/kg, uma casa decimal); `null` sem perfil. O card
  "Meta diária" mostra o `atual`.
- `fiberPerKg`: fibras de hoje em g/kg (uma casa decimal); `null` sem perfil. Card "Meta diária".
- `kcalPerKg`: calorias consumidas hoje (`consumedKcal`) por kg de peso (uma casa decimal); `null` sem perfil.
  Card "Calorias" da "Meta diária".
- `macroSplit`: parte das calorias dos macros de hoje que vem de cada um (proteína e carboidrato 4 kcal/g,
  gordura 9 kcal/g), em % inteiros que somam 100 (o que o arredondamento perde vai para as maiores sobras);
  `null` sem consumo. O gráfico de pizza do card "Meta diária" mostra esses valores.

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
