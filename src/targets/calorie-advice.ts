// Ajuste das calorias (±10%) e as sugestões tiradas das pesagens e do peso meta.
import { addDays, localDate } from '../common/timezone.js';
import type { CalorieAdvice, CalorieStep, Goal } from '../contract.js';

/** Quanto cada botão muda a meta em vigor. */
const STEP = 0.1;
/** Variação na semana abaixo disso (em kg, na direção do objetivo) conta como peso parado. */
export const STALLED_KG = 0.2;

/** A meta depois de um ajuste: 10% da meta em vigor, em dezenas, nunca abaixo do piso. */
export function stepCalories(
  calories: number,
  direction: CalorieStep,
  minimum: number,
): number {
  const factor = direction === 'increase' ? 1 + STEP : 1 - STEP;
  return Math.max(minimum, Math.round((calories * factor) / 10) * 10);
}

type Weighing = { at: Date; kg: number };

/**
 * Variação do peso na semana (kg, uma casa): da pesagem mais recente para a mais recente de pelo menos 6 dias
 * antes dela (quem se pesa no mesmo dia da semana). Só contam pesagens do dia `since` em diante (o último
 * ajuste das calorias) e a última tem de ser dos últimos 7 dias; sem esse par, `null`.
 */
export function weeklyChange(
  weights: Weighing[],
  since: string | null,
  today: string,
  timeZone: string,
): number | null {
  const days = weights.map((entry) => ({
    day: localDate(entry.at, timeZone),
    kg: entry.kg,
  }));
  const latest = days.at(-1);
  if (!latest || latest.day < addDays(today, -7)) return null;
  const limit = addDays(latest.day, -6);
  const previous = days.findLast(
    (entry) => entry.day <= limit && (since === null || entry.day >= since),
  );
  if (!previous) return null;
  return Math.round((latest.kg - previous.kg) * 10) / 10;
}

const kgFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const kcalFormat = new Intl.NumberFormat('pt-BR');
const signedKg = (kg: number) => `${kg > 0 ? '+' : ''}${kgFormat.format(kg)}`;

/** Objetivo pelo peso meta: acima do peso atual = ganhar, abaixo = perder; igual, `null`. */
export function goalForTarget(
  targetWeightKg: number,
  currentKg: number,
): 'perder' | 'ganhar' | null {
  if (targetWeightKg > currentKg) return 'ganhar';
  if (targetWeightKg < currentKg) return 'perder';
  return null;
}

export type CalorieAdviceInput = {
  /** O objetivo de agora: o do perfil, ou o do último peso meta (acima ou abaixo do peso atual). */
  goal: Goal;
  targetWeightKg: number | null;
  /** Pesagens do mais antigo para o mais recente. */
  weights: Weighing[];
  /** `weeklyChange` das pesagens. */
  weeklyChangeKg: number | null;
  /** O objetivo virou com o último peso meta e as calorias ainda não foram ajustadas desde então. */
  turned: boolean;
  calories: number;
  minimum: number;
};

/**
 * O que o sistema sugere: chegou ao peso meta → escolher um novo (acima do peso atual para ganhar, abaixo para
 * perder); o objetivo acabou de virar → ±10% na direção nova; perdendo, o peso parou de cair → −10% (ou nada a
 * fazer, no piso); ganhando, parou de subir → +10%. Sem sugestão, `null`.
 */
export function calorieAdvice({
  goal,
  targetWeightKg,
  weights,
  weeklyChangeKg,
  turned,
  calories,
  minimum,
}: CalorieAdviceInput): CalorieAdvice | null {
  if (goal === 'manter') return null;
  const latest = weights.at(-1);
  if (
    latest &&
    targetWeightKg !== null &&
    (goal === 'perder'
      ? latest.kg <= targetWeightKg
      : latest.kg >= targetWeightKg)
  )
    return {
      kind: 'reached',
      title: 'Você chegou ao peso meta!',
      text: `Seu peso (${kgFormat.format(latest.kg)} kg) chegou ao peso meta de ${kgFormat.format(targetWeightKg)} kg. Escolha um novo peso meta: acima do peso atual para ganhar peso, ou abaixo para continuar emagrecendo.`,
    };
  const decreaseTo = stepCalories(calories, 'decrease', minimum);
  const increaseTo = stepCalories(calories, 'increase', minimum);
  const floor: CalorieAdvice = {
    kind: 'floor',
    title: 'Seu peso parou de cair',
    text: `A meta já está no mínimo de calorias (${kcalFormat.format(calories)} kcal) e não dá para diminuir mais. Procure um nutricionista para seguir emagrecendo.`,
  };
  if (turned)
    if (goal === 'ganhar')
      return {
        kind: 'increase',
        title: 'Você escolheu ganhar peso',
        text: `Para começar a ganhar peso, aumente 10% das calorias (para ${kcalFormat.format(increaseTo)} kcal).`,
      };
    else
      return decreaseTo < calories
        ? {
            kind: 'decrease',
            title: 'Você escolheu perder peso',
            text: `Para começar a emagrecer, diminua 10% das calorias (para ${kcalFormat.format(decreaseTo)} kcal).`,
          }
        : { ...floor, title: 'Você escolheu perder peso' };
  if (weeklyChangeKg === null) return null;
  const week = `Na última semana, seu peso variou ${signedKg(weeklyChangeKg)} kg.`;
  if (goal === 'perder' && weeklyChangeKg > -STALLED_KG)
    return decreaseTo < calories
      ? {
          kind: 'decrease',
          title: 'Seu peso parou de cair',
          text: `${week} Você pode diminuir 10% das calorias (para ${kcalFormat.format(decreaseTo)} kcal) para continuar emagrecendo.`,
        }
      : { ...floor, text: `${week} ${floor.text}` };
  if (goal === 'ganhar' && weeklyChangeKg < STALLED_KG)
    return {
      kind: 'increase',
      title: 'Seu peso parou de subir',
      text: `${week} Você pode aumentar 10% das calorias (para ${kcalFormat.format(increaseTo)} kcal) para continuar ganhando peso.`,
    };
  return null;
}
