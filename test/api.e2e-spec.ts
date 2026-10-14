import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { Me, PlanMeal, TodayPlan } from '../src/contract.js';
import { addDays, userClock } from '../src/common/timezone.js';
import { PlanPersonalizerService } from '../src/plan/personalizer.service.js';
import { createTestApp, FRONTEND } from './setup-app.js';

const create = vi.fn();
// O plano individual usa o endpoint beta (fallback do servidor); os dois caem no mesmo mock.
const anthropic = { messages: { create }, beta: { messages: { create } } };

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp(anthropic);
});

afterAll(async () => {
  await app.close();
});

const PROFILE = {
  sex: 'feminino',
  age: 32,
  weightKg: 68.5,
  heightCm: 165,
  activityLevel: 'moderado',
  goal: 'perder',
};

const ROUTINE = {
  eatingWindows: [
    { start: '07:00', end: '08:30' },
    { start: '12:00', end: '13:30' },
    { start: '15:30', end: '16:30' },
    { start: '19:00', end: '21:00' },
  ],
  wakeTime: '06:30',
  sleepTime: '23:00',
  trainingStart: '18:00',
  trainingEnd: '19:00',
  meals: ['cafe-da-manha', 'almoco', 'lanche-da-tarde', 'jantar'],
  hungriestPeriod: 'noite',
  leastHungryPeriod: 'manha',
  weighInDay: 1,
  diet: 'onivora',
};

/** Espera a montagem do plano individual (que roda em segundo plano depois da primeira rotina). */
const personalizationIdle = () => app.get(PlanPersonalizerService).whenIdle();

let counter = 0;

/** Cria um usuário e devolve um cliente HTTP autenticado. */
async function newUser(name = 'Ana Souza') {
  const username = `user.${counter++}`;
  const signup = await request(app.getHttpServer())
    .post('/auth/signup')
    .send({ name, username, password: 'segredo123' })
    .expect(201);
  const token = signup.body.token as string;
  const http = (method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Timezone', 'America/Sao_Paulo');
  return { username, token, http };
}

/** Grava um código de uso único do login com Google direto no banco. */
async function googleCode(userId: string, code: string, redirectUri: string) {
  await app
    .get(DataSource)
    .query(
      `INSERT INTO oauth_codes (code_hash, user_id, redirect_uri, expires_at) VALUES ($1, $2, $3, now() + interval '1 minute')`,
      [createHash('sha256').update(code).digest('hex'), userId, redirectUri],
    );
}

const kcal = (plan: TodayPlan) =>
  plan.meals.reduce((sum, meal) => sum + meal.totals.kcal, 0);

describe('autenticação', () => {
  it('cadastro, login, usuário repetido e credenciais erradas', async () => {
    const { username } = await newUser();
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Outra', username, password: 'segredo123' })
      .expect(409, { error: 'Esse usuário já está em uso.' });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: username.toUpperCase(), password: 'segredo123' })
      .expect(200);
    expect(login.body.token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'errada' })
      .expect(401, { error: 'Usuário ou senha incorretos.' });
  });

  it('valida o cadastro com mensagens em pt-BR', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ana', username: 'a!', password: 'segredo123' })
      .expect(400, {
        error:
          'O usuário deve ter de 3 a 20 caracteres: letras, números, ponto ou sublinhado.',
      });
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ana', username: 'ana.ok', password: '123' })
      .expect(400, { error: 'A senha deve ter pelo menos 6 caracteres.' });
  });

  it('rotas protegidas exigem token válido', async () => {
    await request(app.getHttpServer())
      .get('/me')
      .expect(401, { error: 'Sessão expirada. Entre novamente.' });
    await request(app.getHttpServer())
      .get('/plan/today')
      .set('Authorization', 'Bearer invalido')
      .expect(401, { error: 'Sessão expirada. Entre novamente.' });
  });
});

describe('perfil e pesos', () => {
  it('nasce sem perfil e calcula as metas ao salvar', async () => {
    const { http } = await newUser();
    const before = await http('get', '/me').expect(200);
    expect(before.body).toMatchObject({
      profile: null,
      routine: null,
      targets: null,
      weighInDue: false,
      google: null,
    });

    await http('put', '/me/routine')
      .send(ROUTINE)
      .expect(400, { error: 'Preencha o perfil primeiro.' });
    const saved = await http('put', '/me/profile').send(PROFILE).expect(200);
    expect((saved.body as Me).routine).toBeNull();
    expect((saved.body as Me).targets).toEqual({
      calories: 1660,
      bmr: 1395,
      tdee: 2163,
      waterLiters: 2.4,
      clampedToMinimum: false,
    });

    const estimate = await http('post', '/profile/estimate')
      .send({ ...PROFILE, goal: 'manter' })
      .expect(200);
    expect(estimate.body.calories).toBe(2160);
    await http('post', '/profile/estimate')
      .send({ ...PROFILE, age: 10 })
      .expect(400, { error: 'A idade deve estar entre 14 e 100 anos.' });
  });

  it('salva a rotina depois do perfil e valida os horários', async () => {
    const { http } = await newUser();
    await http('put', '/me/profile').send(PROFILE).expect(200);
    const saved = await http('put', '/me/routine')
      // Campos desconhecidos são descartados.
      .send({ ...ROUTINE, preferences: 'Almoço de marmita.' })
      .expect(200);
    await personalizationIdle();
    expect((saved.body as Me).routine).toEqual(ROUTINE);

    const invalid = (routine: object, error: string) =>
      http('put', '/me/routine')
        .send({ ...ROUTINE, ...routine })
        .expect(400, { error });
    await invalid(
      { eatingWindows: [] },
      'Informe pelo menos um horário disponível para comer.',
    );
    await invalid(
      { eatingWindows: [{ start: '13:00', end: '12:00' }] },
      'Em cada horário disponível, o início deve ser antes do fim.',
    );
    await invalid(
      {
        eatingWindows: [
          { start: '12:00', end: '13:00' },
          { start: '12:30', end: '14:00' },
        ],
      },
      'Os horários disponíveis para comer devem estar em ordem e não podem se sobrepor.',
    );
    await invalid(
      { eatingWindows: [{ start: '7h', end: '12:00' }] },
      'Informe os horários no formato HH:MM.',
    );
    await invalid(
      { leastHungryPeriod: 'noite' },
      'O período de mais fome e o de menos fome devem ser diferentes.',
    );
    await invalid({ trainingStart: '25:00' }, 'Informe o início do treino.');
    await invalid({ trainingEnd: null }, 'Informe o início e o fim do treino.');
    await invalid(
      { trainingEnd: '18:00' },
      'O treino deve terminar depois de começar.',
    );
    const busy =
      'Os horários para comer não podem cair no horário de sono ou de treino.';
    await invalid({ trainingStart: '20:00', trainingEnd: '21:30' }, busy);
    await invalid({ wakeTime: '07:30' }, busy);
    await invalid({ meals: [] }, 'Marque pelo menos uma refeição.');
    await invalid(
      { meals: ['almoco', 'brunch'] },
      'Escolha as refeições que você faz no dia.',
    );
    await invalid(
      { meals: ['almoco', 'almoco'] },
      'Escolha as refeições que você faz no dia.',
    );
    // Qualquer combinação vale, e o plano tem só as refeições marcadas (guardadas na ordem do dia).
    const few = await http('put', '/me/routine')
      .send({ ...ROUTINE, meals: ['ceia', 'almoco'] })
      .expect(200);
    expect((few.body as Me).routine?.meals).toEqual(['almoco', 'ceia']);
    const plan = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(plan.meals.map((meal) => meal.id)).toEqual([2, 6]);
    expect(Math.abs(kcal(plan) - 1660)).toBeLessThanOrEqual(17);
    await invalid(
      { hungriestPeriod: 'madrugada' },
      'Escolha o período em que sente mais fome.',
    );
    // "Não sinto": os períodos de fome em branco.
    const steady = await http('put', '/me/routine')
      .send({ ...ROUTINE, hungriestPeriod: null, leastHungryPeriod: null })
      .expect(200);
    expect((steady.body as Me).routine).toMatchObject({
      hungriestPeriod: null,
      leastHungryPeriod: null,
    });
    // Quem não treina manda os dois horários em branco.
    const idle = await http('put', '/me/routine')
      .send({ ...ROUTINE, trainingStart: null, trainingEnd: null })
      .expect(200);
    expect((idle.body as Me).routine).toMatchObject({
      trainingStart: null,
      trainingEnd: null,
    });
    // Dá para comer logo depois do treino.
    await http('put', '/me/routine')
      .send({ ...ROUTINE, trainingStart: '06:30', trainingEnd: '07:00' })
      .expect(200);
  });

  it('registra pesagens e recusa datas fora do intervalo', async () => {
    const { http } = await newUser();
    const at = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const list = await http('post', '/weights')
      .send({ kg: 68.2, at })
      .expect(200);
    expect(list.body).toEqual([{ id: expect.any(String), at, kg: 68.2 }]);

    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await http('post', '/weights').send({ kg: 68, at: future }).expect(400);
    const old = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();
    await http('post', '/weights').send({ kg: 68, at: old }).expect(400);
    expect((await http('get', '/weights').expect(200)).body).toHaveLength(1);
  });
});

describe('plano alimentar', () => {
  it('mantém o total do dia ao acrescentar alimento', async () => {
    const { http } = await newUser();
    const today = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(today.meals.map((meal) => meal.totals.kcal)).toEqual([
      348, 399, 399,
    ]);

    const search = await http(
      'get',
      '/plan/meals/1/food-search?q=banana prata',
    ).expect(200);
    expect(search.body.found).toBe(true);
    const added = (
      await http('post', '/plan/meals/1/foods')
        .send({ foodName: 'Banana, prata, crua' })
        .expect(200)
    ).body as TodayPlan;
    expect(kcal(added)).toBeLessThanOrEqual(kcal(today));
    const extra = added.meals[0].foods.find((food) => food.extraId !== null)!;
    expect(extra.name).toBe('Banana, prata, crua');

    const removed = (
      await http('delete', `/plan/meals/1/foods/${extra.extraId}`).expect(200)
    ).body as TodayPlan;
    expect(removed.meals[0].foods.every((food) => food.extraId === null)).toBe(
      true,
    );

    await http('put', '/plan/meals/1/time').send({ time: '09:30' }).expect(200);
    await http('put', '/plan/meals/1/time')
      .send({ time: '25:00' })
      .expect(400, { error: 'Informe o horário no formato HH:MM.' });
  });

  it('não cria nem remove refeição avulsa (as refeições vêm da rotina)', async () => {
    const { http } = await newUser();
    await http('get', '/plan/meals/1/removal-options').expect(404);
    await http('post', '/plan/meals/1/removal')
      .send({ option: 'nothing' })
      .expect(404);
    await http('post', '/plan/meals')
      .send({ title: 'Lanche', time: '16:00' })
      .expect(404);
    await http('put', '/plan/meals/99/time')
      .send({ time: '09:00' })
      .expect(404, { error: 'Refeição não encontrada.' });
  });

  it('troca alimentos e lista/libera restrições', async () => {
    const { http } = await newUser();
    const ARROZ = 'Arroz, integral, cozido';
    const ARROZ_BRANCO = 'Arroz, tipo 1, cozido';
    const AZEITE = 'Azeite, de oliva, extra virgem';

    const substitutes = await http(
      'get',
      `/plan/meals/2/substitutes?food=${encodeURIComponent(ARROZ)}`,
    ).expect(200);
    const names = substitutes.body.map((food: { name: string }) => food.name);
    // Sem resposta do Claude: até 8 do mesmo grupo (Cereais → carboidratos), sem o próprio alimento.
    expect(names.length).toBeLessThanOrEqual(8);
    expect(names).toContain(ARROZ_BRANCO);
    expect(names).not.toContain(ARROZ);
    expect(names).not.toContain('Feijão, carioca, cozido');

    const swapped = (
      await http('post', '/plan/meals/2/swaps')
        .send({
          foodName: ARROZ,
          reason: 'nao-gosto',
          substitute: ARROZ_BRANCO,
        })
        .expect(200)
    ).body as TodayPlan;
    const lunch = swapped.meals.find((meal) => meal.id === 2) as PlanMeal;
    expect(lunch.foods.map((food) => food.name)).not.toContain(ARROZ);
    expect(lunch.foods.map((food) => food.name)).toContain(ARROZ_BRANCO);

    // "Não quero" só no almoço: o jantar continua com azeite.
    const withoutOil = (
      await http('post', '/plan/meals/2/swaps')
        .send({ foodName: AZEITE, reason: 'nao-quero', substitute: null })
        .expect(200)
    ).body as TodayPlan;
    expect(
      withoutOil.meals
        .find((meal) => meal.id === 2)!
        .foods.map((food) => food.name),
    ).not.toContain(AZEITE);
    expect(
      withoutOil.meals
        .find((meal) => meal.id === 3)!
        .foods.map((food) => food.name),
    ).toContain(AZEITE);

    const restricted = await http('get', '/foods/restricted').expect(200);
    expect(restricted.body).toEqual([
      {
        name: ARROZ,
        feedback: 'nao-gosto',
        group: 'carboidratos',
        onlyInMeal: false,
        substitute: ARROZ_BRANCO,
      },
      {
        name: AZEITE,
        feedback: 'nao-quero',
        group: 'gorduras',
        onlyInMeal: true,
        substitute: null,
      },
    ]);

    const search = await http(
      'get',
      `/plan/meals/1/food-search?q=${encodeURIComponent('arroz, integral, cozido')}`,
    ).expect(200);
    expect(search.body.restricted).toEqual({
      name: ARROZ,
      feedback: 'nao-gosto',
    });
    expect(
      search.body.options.map(
        (option: { food: { name: string } }) => option.food.name,
      ),
    ).not.toContain(ARROZ);

    const released = await http(
      'delete',
      `/foods/restricted/${encodeURIComponent(ARROZ)}`,
    ).expect(200);
    expect(released.body.map((food: { name: string }) => food.name)).toEqual([
      AZEITE,
    ]);
    // A troca continua depois de liberar.
    const plan = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(
      plan.meals.find((meal) => meal.id === 2)!.foods.map((food) => food.name),
    ).toContain(ARROZ_BRANCO);
  });
});

describe('não posso', () => {
  it('troca em todas as refeições e lista o alimento como restrito', async () => {
    const { http } = await newUser();
    const AZEITE = 'Azeite, de oliva, extra virgem';
    const plan = (
      await http('post', '/plan/meals/2/swaps')
        .send({ foodName: AZEITE, reason: 'nao-posso', substitute: null })
        .expect(200)
    ).body as TodayPlan;
    for (const meal of plan.meals)
      expect(meal.foods.map((food) => food.name)).not.toContain(AZEITE);
    const restricted = await http('get', '/foods/restricted').expect(200);
    expect(restricted.body).toEqual([
      expect.objectContaining({
        name: AZEITE,
        feedback: 'nao-posso',
        onlyInMeal: false,
      }),
    ]);
  });
});

describe('substitutos do assistente', () => {
  it('os substitutos vêm do Claude, conferidos no catálogo, e a troca aceita outro grupo', async () => {
    create.mockReset();
    const { http } = await newUser();
    const ARROZ = 'Arroz, integral, cozido';
    const FEIJAO = 'Feijão, carioca, cozido';
    const MANDIOCA = 'Mandioca, cozida';
    create.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            names: [
              MANDIOCA,
              'Arroz de couve-flor',
              ARROZ,
              'feijao, carioca, cozido',
            ],
          }),
        },
      ],
    });
    const substitutes = await http(
      'get',
      `/plan/meals/2/substitutes?food=${encodeURIComponent(ARROZ)}`,
    ).expect(200);
    expect(create).toHaveBeenCalledTimes(1);
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain(`Substituir: "${ARROZ}"`);
    const arroz = (
      (await http('get', '/plan/today').expect(200)).body as TodayPlan
    ).meals
      .find((meal) => meal.id === 2)!
      .foods.find((food) => food.name === ARROZ)!;
    expect(substitutes.body.map((food: { name: string }) => food.name)).toEqual(
      [MANDIOCA, FEIJAO],
    );
    for (const food of substitutes.body as { kcal: number }[])
      expect(Math.abs(food.kcal - arroz.kcal)).toBeLessThanOrEqual(2);

    const swapped = (
      await http('post', '/plan/meals/2/swaps')
        .send({ foodName: ARROZ, reason: 'nao-quero', substitute: FEIJAO })
        .expect(200)
    ).body as TodayPlan;
    expect(
      swapped.meals
        .find((meal) => meal.id === 2)!
        .foods.filter((food) => food.name === FEIJAO).length,
    ).toBeGreaterThan(0);
    await http('post', '/plan/meals/2/swaps')
      .send({ foodName: FEIJAO, reason: 'nao-quero', substitute: 'Não existe' })
      .expect(400, {
        error: 'Esse substituto não está disponível para este alimento.',
      });
    create.mockReset();
  });

  it('se o Claude falhar, usa os substitutos do mesmo grupo', async () => {
    create.mockReset();
    create.mockRejectedValue(new Error('indisponível'));
    const { http } = await newUser();
    const substitutes = await http(
      'get',
      `/plan/meals/2/substitutes?food=${encodeURIComponent('Arroz, integral, cozido')}`,
    ).expect(200);
    expect(substitutes.body.length).toBeGreaterThan(0);

    // "Ver mais": um `exclude` por nome já mostrado; volta só opções novas, até acabarem.
    const path = `/plan/meals/2/substitutes?food=${encodeURIComponent('Arroz, integral, cozido')}`;
    let shown: string[] = substitutes.body.map(
      (food: { name: string }) => food.name,
    );
    for (let page = 0; page < 20; page++) {
      const exclude = shown
        .map((name) => `&exclude=${encodeURIComponent(name)}`)
        .join('');
      const more = (await http('get', `${path}${exclude}`).expect(200))
        .body as PlanMeal['foods'];
      const names = more.map((food) => food.name);
      expect(names.filter((name) => shown.includes(name))).toEqual([]);
      if (names.length === 0) break;
      shown = [...shown, ...names];
    }
    expect(shown.length).toBeGreaterThan(substitutes.body.length);
    create.mockReset();
  });
});

describe('plano individual do assistente', () => {
  const VEGETARIAN = { ...ROUTINE, diet: 'vegetariana' };
  const TOFU = 'Soja, queijo (tofu)';
  const FRANGO = 'Frango, peito, sem pele, grelhado';
  const reply = (text: unknown) => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(text) }],
  });
  const PLAN = {
    meals: [
      {
        id: 1,
        title: 'Pão com Ovo e Mamão',
        time: '07:30',
        foods: [
          { name: 'Pão, trigo, forma, integral', grams: 50 },
          { name: 'Ovo, de galinha, inteiro, cozido/10minutos', grams: 100 },
          { name: 'Mamão, Papaia, cru', grams: 150 },
        ],
      },
      {
        id: 2,
        title: 'Marmita de Tofu com Arroz e Feijão',
        time: '12:15',
        foods: [
          { name: TOFU, grams: 150 },
          { name: FRANGO, grams: 100 },
          { name: 'Arroz, integral, cozido', grams: 150 },
          { name: 'Feijão, carioca, cozido', grams: 100 },
        ],
      },
      {
        id: 4,
        title: 'Iogurte com Banana e Aveia',
        time: '16:00',
        foods: [
          { name: 'Iogurte, natural', grams: 170 },
          { name: 'Banana, prata, crua', grams: 100 },
          { name: 'Aveia, flocos, crua', grams: 30 },
        ],
      },
      {
        id: 3,
        title: 'Omelete com Batata-Doce e Brócolis',
        time: '20:15',
        foods: [
          { name: 'Ovo, de galinha, inteiro, cozido/10minutos', grams: 100 },
          { name: 'Batata, doce, cozida', grams: 150 },
          { name: 'Brócolis, cozido', grams: 100 },
        ],
      },
    ],
  };

  it('monta o plano na primeira rotina, em segundo plano, e só monta de novo a pedido', async () => {
    create.mockReset();
    let answer: (value: unknown) => void = () => {};
    create.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const { http } = await newUser();
    await http('put', '/me/profile').send(PROFILE).expect(200);
    expect(create).not.toHaveBeenCalled();
    const saved = await http('put', '/me/routine').send(VEGETARIAN).expect(200);
    expect((saved.body as Me).routine).toMatchObject({ diet: 'vegetariana' });

    const pending = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(pending.personalization).toBe('pending');
    expect(create).toHaveBeenCalledTimes(1);
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Tipo de alimentação: vegetariana');
    expect(prompt).toContain(
      'Horários em que pode comer: 07:00–08:30, 12:00–13:30, 15:30–16:30, 19:00–21:00.',
    );
    expect(prompt).toContain('treina das 18:00 às 19:00');
    expect(prompt).toContain('- id 4: lanche da tarde\n- id 3: jantar');
    await http('post', '/plan/personalize').expect(409, {
      error: 'Seu plano já está sendo montado.',
    });

    answer(reply(PLAN));
    await personalizationIdle();
    const ready = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(ready.personalization).toBe('ready');
    expect(ready.meals.map((meal) => meal.title)).toEqual([
      'Pão com Ovo e Mamão',
      'Marmita de Tofu com Arroz e Feijão',
      'Iogurte com Banana e Aveia',
      'Omelete com Batata-Doce e Brócolis',
    ]);
    // Os horários são os do assistente (dentro das janelas da rotina).
    expect(ready.meals.map((meal) => meal.time)).toEqual([
      '07:30',
      '12:15',
      '16:00',
      '20:15',
    ]);
    const lunch = ready.meals.find((meal) => meal.id === 2)!;
    // Frango fica de fora (vegetariana).
    expect(lunch.foods.map((food) => food.name)).not.toContain(FRANGO);
    expect(Math.abs(kcal(ready) - 1660)).toBeLessThanOrEqual(17);

    // Salvar o perfil ou a rotina de novo não monta outro plano.
    await http('put', '/me/profile')
      .send({ ...PROFILE, weightKg: 70 })
      .expect(200);
    await http('put', '/me/routine')
      .send({ ...VEGETARIAN, trainingStart: null, trainingEnd: null })
      .expect(200);
    await personalizationIdle();
    expect(create).toHaveBeenCalledTimes(1);

    // "Refazer meu plano": monta de novo; horário fora das janelas → espalhados pelas janelas.
    await http('put', '/plan/meals/1/time').send({ time: '09:00' }).expect(200);
    create.mockResolvedValueOnce(
      reply({
        meals: PLAN.meals.map((meal) =>
          meal.id === 3 ? { ...meal, time: '23:30' } : meal,
        ),
      }),
    );
    await http('post', '/plan/personalize').expect(200);
    await personalizationIdle();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[0].content).toContain('não treina');
    const redone = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(redone.personalization).toBe('ready');
    expect(redone.meals.map((meal) => [meal.id, meal.time])).toEqual([
      [1, '07:45'],
      [2, '12:45'],
      [4, '16:15'],
      [3, '20:15'],
    ]);
    create.mockReset();
  });

  it('se falhar, fica o plano padrão e dá para tentar de novo', async () => {
    create.mockReset();
    create.mockRejectedValueOnce(new Error('indisponível'));
    const { http } = await newUser();
    await http('put', '/me/profile').send(PROFILE).expect(200);
    await http('put', '/me/routine').send(VEGETARIAN).expect(200);
    await personalizationIdle();
    const failed = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(failed.personalization).toBe('failed');
    expect(failed.meals).toHaveLength(4);

    create.mockResolvedValueOnce(reply(PLAN));
    const retried = await http('post', '/plan/personalize').expect(200);
    // O mock responde na hora: a montagem pode já ter terminado.
    expect(['pending', 'ready']).toContain(
      (retried.body as TodayPlan).personalization,
    );
    await personalizationIdle();
    const ready = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(ready.personalization).toBe('ready');

    // Substitutos também respeitam a dieta.
    create.mockResolvedValueOnce(
      reply({ names: [FRANGO, 'Ovo, de galinha, inteiro, frito'] }),
    );
    const substitutes = await http(
      'get',
      `/plan/meals/2/substitutes?food=${encodeURIComponent(TOFU)}`,
    ).expect(200);
    expect(substitutes.body.map((food: { name: string }) => food.name)).toEqual(
      ['Ovo, de galinha, inteiro, frito'],
    );
    create.mockReset();
  });

  it('valida o tipo de alimentação', async () => {
    const { http } = await newUser();
    await http('put', '/me/routine')
      .send({ ...ROUTINE, diet: 'carnivora' })
      .expect(400, { error: 'Escolha o tipo de alimentação.' });
  });
});

describe('nutrientes e histórico', () => {
  it('responde nutrientes de hoje e as estatísticas', async () => {
    const { http } = await newUser();
    await http('put', '/me/profile').send(PROFILE).expect(200);
    await http('put', '/me/routine').send(ROUTINE).expect(200);
    await personalizationIdle();

    // Perfil com meta de 1660 kcal e 4 refeições: o plano inicial é escalado para perto da meta.
    const plan = (await http('get', '/plan/today').expect(200))
      .body as TodayPlan;
    expect(plan.meals).toHaveLength(4);
    const planKcal = kcal(plan);
    expect(Math.abs(planKcal - 1660)).toBeLessThanOrEqual(17);

    const nutrition = await http('get', '/nutrition/today').expect(200);
    expect(nutrition.body.consumedKcal).toBe(planKcal);
    // Vitaminas e minerais vêm da TACO.
    for (const section of ['fibers', 'vitamins', 'minerals']) {
      for (const item of nutrition.body[section])
        expect(item.atual).toBeGreaterThan(0);
    }
    expect(nutrition.body.burnedKcal).toBeNull();
    expect(
      nutrition.body.macros.map((macro: { id: string }) => macro.id),
    ).toEqual(['proteinas', 'gorduras', 'carboidratos']);
    // Metas: 2 g/kg de proteína, 1 g/kg de gordura, resto (de 1660 kcal) em carboidrato.
    expect(
      nutrition.body.macros.map(
        (macro: { meta: number; perKg: { meta: number } }) => [
          macro.meta,
          macro.perKg.meta,
        ],
      ),
    ).toEqual([
      [137, 2],
      [69, 1],
      [124, 1.8],
    ]);
    const proteinMacro = nutrition.body.macros[0];
    expect(proteinMacro.perKg.atual).toBe(
      Math.round((proteinMacro.atual / 68.5) * 10) / 10,
    );
    expect(
      nutrition.body.minerals.find(
        (item: { id: string }) => item.id === 'sodio',
      ),
    ).toMatchObject({ limit: true });

    const groups = await http('get', '/nutrients/groups').expect(200);
    expect(groups.body.map((group: { name: string }) => group.name)).toEqual([
      'Macronutrientes',
      'Vitaminas',
      'Minerais',
    ]);

    const summary = await http('get', '/history/summary?days=7').expect(200);
    expect(summary.body).toEqual({
      avgConsumed: planKcal,
      avgBurned: 2163,
      avgBalance: planKcal - 2163,
      daysOnGoal: 1,
      totalDays: 1,
      calorieGoal: 1660,
      goalTolerance: 150,
    });
    await http('get', '/history/summary?days=12').expect(400);

    const activity = await http('get', '/history/activity?days=7').expect(200);
    expect(activity.body.days).toHaveLength(1);

    const protein = await http(
      'get',
      '/history/nutrients/proteinas?days=7',
    ).expect(200);
    expect(protein.body.days).toHaveLength(7);
    expect(protein.body.days[6].value).toBeGreaterThan(0);
    await http('get', '/history/nutrients/nao-existe?days=7').expect(404);

    expect((await http('get', '/history/plans').expect(200)).body).toEqual([]);
    const sources = await http('get', '/activity-sources').expect(200);
    expect(
      sources.body.map((source: { connected: boolean }) => source.connected),
    ).toEqual([false, false]);
  });
});

describe('histórico com dias sem o app aberto', () => {
  it('repete o plano do último dia gravado, sem consumo zerado entre os dias', async () => {
    const { http, username } = await newUser();
    await http('get', '/plan/today').expect(200);
    const db = app.get(DataSource);
    const [{ id }] = (await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username],
    )) as { id: string }[];
    const today = userClock('America/Sao_Paulo').today;
    const day = (delta: number) => addDays(today, delta);

    // Fotos só em dias alternados (como quem abre o app dia sim, dia não) e atividade todos os dias.
    for (const delta of [-4, -2]) {
      await db.query(
        `INSERT INTO day_logs (user_id, date, meals, consumed_kcal, nutrients, flagged_foods)
         VALUES ($1, $2, $3, 2290, '{}', '[]')`,
        [
          id,
          day(delta),
          JSON.stringify([{ time: '12:30', title: 'Almoço', kcal: 2290 }]),
        ],
      );
    }
    for (let delta = -6; delta <= 0; delta++) {
      await db.query(
        `INSERT INTO activity_days (user_id, date, burned, active_calories, steps, active_minutes, distance_km, source)
         VALUES ($1, $2, 2200, 300, 5000, 30, 3.5, 'Google Health')`,
        [id, day(delta)],
      );
    }

    const activity = await http('get', '/history/activity?days=7').expect(200);
    const consumed = Object.fromEntries(
      activity.body.days.map((item: { date: string; consumed: number }) => [
        item.date,
        item.consumed,
      ]),
    );
    expect(
      [day(-4), day(-3), day(-2), day(-1)].map((date) => consumed[date]),
    ).toEqual([2290, 2290, 2290, 2290]);
    // Antes da primeira foto não havia plano: só a atividade, com consumo 0.
    expect(consumed[day(-6)]).toBe(0);

    const plans = await http('get', '/history/plans').expect(200);
    expect(plans.body.map((item: { date: string }) => item.date)).toEqual([
      day(-1),
      day(-2),
      day(-3),
      day(-4),
    ]);
    expect(plans.body[0]).toMatchObject({
      plannedKcal: 2290,
      followedCount: 1,
    });
  });
});

describe('chat', () => {
  it('começa com a saudação e responde com o Claude', async () => {
    create.mockReset();
    const { http } = await newUser('Bruno Lima');
    const first = await http('get', '/chat/messages').expect(200);
    expect(first.body).toEqual([
      {
        id: expect.stringMatching(/^m-\d+$/),
        role: 'assistant',
        text: expect.stringContaining('Olá, Bruno!'),
      },
    ]);

    create.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hoje seu plano tem 1146 kcal.' }],
    });
    const reply = await http('post', '/chat/messages')
      .send({ text: 'Quantas calorias hoje?' })
      .expect(200);
    expect(reply.body).toEqual({
      id: expect.any(String),
      role: 'assistant',
      text: 'Hoje seu plano tem 1146 kcal.',
    });

    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({ model: 'claude-haiku-4-5' });
    expect(params.messages).toEqual([
      { role: 'user', content: 'Quantas calorias hoje?' },
    ]);
    expect(params.system[1].text).toContain(
      'Plano de hoje (1146 kcal no total)',
    );

    create.mockRejectedValueOnce(new Error('falhou'));
    await http('post', '/chat/messages')
      .send({ text: 'De novo?' })
      .expect(503, {
        error:
          'O assistente está indisponível agora. Tente de novo em instantes.',
      });
    // A pergunta sem resposta não fica na conversa.
    expect((await http('get', '/chat/messages').expect(200)).body).toHaveLength(
      3,
    );

    const suggestions = await http('get', '/chat/suggestions').expect(200);
    expect(suggestions.body).toHaveLength(4);
  });
});

describe('Google', () => {
  it('start redireciona para o Google só com redirect_uri permitido', async () => {
    const ok = await request(app.getHttpServer())
      .get('/auth/google/start')
      .query({ redirect_uri: `${FRONTEND}/login/google`, state: 'abc' })
      .expect(302);
    const url = new URL(ok.headers.location);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toContain(
      'googlehealth.activity_and_fitness.readonly',
    );

    await request(app.getHttpServer())
      .get('/auth/google/start')
      .query({
        redirect_uri: 'https://evil.example/login/google',
        state: 'abc',
      })
      .expect(400, { error: 'Endereço de retorno não permitido.' });
  });

  it('callback cancelado volta para o front com o erro', async () => {
    const start = await request(app.getHttpServer())
      .get('/auth/google/start')
      .query({ redirect_uri: `${FRONTEND}/login/google`, state: 'abc' });
    const state = new URL(start.headers.location).searchParams.get('state');
    const callback = await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ error: 'access_denied', state })
      .expect(302);
    const back = new URL(callback.headers.location);
    expect(back.origin + back.pathname).toBe(`${FRONTEND}/login/google`);
    expect(back.searchParams.get('error')).toBe(
      'Login com o Google cancelado.',
    );
    expect(back.searchParams.get('state')).toBe('abc');
  });

  it('exchange troca o código uma vez só, e só com o mesmo redirectUri', async () => {
    const { http } = await newUser();
    const me = await http('get', '/me');
    const [user] = (await app
      .get(DataSource)
      .query('SELECT id FROM users WHERE username = $1', [
        me.body.user.username,
      ])) as { id: string }[];
    const redirectUri = `${FRONTEND}/login/google`;
    await googleCode(user.id, 'codigo-unico', redirectUri);

    await request(app.getHttpServer())
      .post('/auth/google/exchange')
      .send({ code: 'codigo-unico', redirectUri: `${FRONTEND}/outra` })
      .expect(400);
    const ok = await request(app.getHttpServer())
      .post('/auth/google/exchange')
      .send({ code: 'codigo-unico', redirectUri })
      .expect(200);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${ok.body.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/google/exchange')
      .send({ code: 'codigo-unico', redirectUri })
      .expect(400, { error: 'O login com o Google expirou. Tente novamente.' });
  });

  it('link devolve a URL de consentimento; conta criada pelo Google não desconecta', async () => {
    const { http } = await newUser();
    const link = await http('post', '/me/google/link')
      .send({ redirectUri: `${FRONTEND}/perfil/google`, state: 'xyz' })
      .expect(200);
    expect(new URL(link.body.url).origin).toBe('https://accounts.google.com');

    const db = app.get(DataSource);
    const [googleUser] = (await db.query(
      `INSERT INTO users (name, username) VALUES ('Google', 'g.user') RETURNING id`,
    )) as {
      id: string;
    }[];
    await db.query(
      `INSERT INTO google_accounts (user_id, sub, email, start_date) VALUES ($1, 'sub-1', 'g@gmail.com', current_date)`,
      [googleUser.id],
    );
    await googleCode(
      googleUser.id,
      'codigo-google',
      `${FRONTEND}/login/google`,
    );
    const login = await request(app.getHttpServer())
      .post('/auth/google/exchange')
      .send({ code: 'codigo-google', redirectUri: `${FRONTEND}/login/google` })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const me = await request(app.getHttpServer())
      .get('/me')
      .set(auth)
      .expect(200);
    expect(me.body.google).toEqual({
      email: 'g@gmail.com',
      canDisconnect: false,
    });
    await request(app.getHttpServer())
      .delete('/me/google')
      .set(auth)
      .expect(409);
  });
});
