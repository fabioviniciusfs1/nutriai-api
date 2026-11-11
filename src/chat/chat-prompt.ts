import type {
  Profile,
  RestrictedFood,
  Routine,
  Targets,
  TodayPlan,
} from '../contract.js';
import { DIET_NAMES } from '../plan/engine/diet.js';
import { daysText, routineLines, scheduleOn, WEEK } from '../users/routine.js';

/** Instruções fixas do assistente (não mudam entre requisições: ficam em cache). */
export const SYSTEM_PROMPT = `Você é o assistente nutricional do NutriAI, um app brasileiro de plano alimentar.

Responda sempre em português do Brasil, em tom acolhedor e direto, com no máximo três parágrafos curtos.
O texto é exibido como texto simples: não use Markdown (sem títulos, negrito, tabelas ou listas com marcadores).

Use os dados do usuário que vêm no contexto (perfil, metas, plano de hoje e alimentos restritos) para
personalizar a resposta. Os números do plano já foram calculados pelo app: cite-os como estão, sem
recalcular. Não sugira alimentos que o usuário marcou como restritos.

Você não altera o plano: para mudanças, oriente o usuário a usar os botões do plano (trocar alimento,
adicionar alimento, mudar horário); para incluir ou tirar uma refeição, a mudar a rotina. Não faça
diagnósticos nem prescreva dietas para doenças, gestação ou transtornos alimentares: nesses casos, recomende
procurar um nutricionista ou médico.`;

const SEX = { feminino: 'feminino', masculino: 'masculino' } as const;
const GOAL = {
  perder: 'emagrecimento',
  manter: 'manter o peso',
  ganhar: 'aumento de massa magra',
} as const;

/** Contexto do usuário para a conversa (muda a cada requisição). */
export function userContext(input: {
  name: string;
  today: string;
  profile: Profile | null;
  routine: Routine | null;
  targets: Targets | null;
  plan: TodayPlan;
  restricted: RestrictedFood[];
}): string {
  const lines = [
    `Contexto do usuário (hoje é ${input.today}):`,
    `Nome: ${input.name}`,
  ];
  const { profile, routine, targets } = input;
  if (profile && targets) {
    lines.push(
      `Perfil: sexo ${SEX[profile.sex]}, ${profile.age} anos, ${profile.weightKg} kg, ${profile.heightCm} cm, ` +
        `atividade ${profile.activityLevel}, objetivo ${GOAL[profile.goal]}` +
        (profile.targetWeightKg
          ? `, peso meta ${profile.targetWeightKg} kg.`
          : '.'),
      `Metas: ${targets.calories} kcal por dia (gasto estimado ${targets.tdee} kcal), água ${targets.waterLiters} L.`,
    );
    if (routine) {
      lines.push(`Tipo de alimentação: ${DIET_NAMES[routine.diet]}.`);
      // Com grupos de dias, cada um tem a rotina e o plano dele; o de hoje vem marcado.
      const today = scheduleOn(routine, input.today);
      for (const schedule of routine.schedules) {
        if (routine.schedules.length > 1)
          lines.push(
            `Rotina de ${daysText(schedule.days)}${schedule.id === today.id ? ' (a de hoje)' : ''}:`,
          );
        lines.push(...routineLines({ ...schedule, days: WEEK }));
      }
    }
  } else {
    lines.push('Perfil ainda não preenchido.');
  }

  const meals = input.plan.meals;
  if (meals.length === 0) {
    lines.push('Plano de hoje: vazio.');
  } else {
    const dayKcal = meals.reduce((sum, meal) => sum + meal.totals.kcal, 0);
    lines.push(`Plano de hoje (${dayKcal} kcal no total):`);
    for (const meal of meals) {
      const foods = meal.foods
        .map((food) => `${food.name} ${food.grams} g`)
        .join(', ');
      const { kcal, carbs, protein, fat } = meal.totals;
      lines.push(
        `- ${meal.time} ${meal.title}: ${kcal} kcal, ${carbs} g carboidratos, ${protein} g proteínas, ` +
          `${fat} g gorduras. Alimentos: ${foods}.`,
      );
    }
  }

  lines.push(
    input.restricted.length === 0
      ? 'Alimentos restritos: nenhum.'
      : `Alimentos restritos: ${input.restricted.map((food) => food.name).join(', ')}.`,
  );
  return lines.join('\n');
}
