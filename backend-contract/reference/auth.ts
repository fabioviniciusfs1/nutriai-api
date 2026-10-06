// Autenticação simulada no navegador: contas, sessão e perfil ficam no localStorage.
// NÃO é segura — serve só para prototipar o fluxo até existir um backend.
import { useSyncExternalStore } from "react";
import type { Profile } from "@/lib/calorie-target";
import type { FoodFeedback } from "@/lib/food-feedback";
import type { mealPlan } from "@/lib/mock-data";

const USERS_KEY = "nutriai:users";
const SESSION_KEY = "nutriai:session";

/** Peso registrado pelo usuário. Só histórico: não altera `profile.weightKg` nem a meta calórica. */
export type WeightEntry = {
  id: string;
  /** Data/hora da pesagem em ISO 8601. */
  at: string;
  kg: number;
};

type PlanFoods = (typeof mealPlan)[number]["foods"];

/**
 * Mudanças permanentes no plano, até o usuário desfazer: refeições removidas com "não fazer nada",
 * refeições criadas e alimentos acrescentados. Criar/acrescentar tira as calorias das outras
 * refeições (reduzindo as porções), para o total do dia não aumentar.
 */
export type PlanChanges = {
  /** Refeições do plano base removidas com "não fazer nada" (para voltar, só criando outra). */
  removed: number[];
  /** Refeições criadas pelo usuário: nome e horário dele, alimentos sugeridos pelo sistema. */
  added: {
    id: number;
    title: string;
    time: string;
    /** Nome da sugestão de onde vieram os alimentos. */
    suggestion: string;
    foods: PlanFoods;
  }[];
  /**
   * Alimentos acrescentados pelo usuário a cada refeição (id → alimentos), na porção "base" (fator 1):
   * mudam junto com as porções da refeição.
   */
  extraFoods: Record<number, PlanFoods>;
  /** Fator permanente das porções de cada refeição (id → fator). */
  scales: Record<number, number>;
};

export const EMPTY_PLAN_CHANGES: PlanChanges = {
  removed: [],
  added: [],
  extraFoods: {},
  scales: {},
};

/** Mudanças que valem só no dia em que foram feitas ("sugerir uma nova" e "redistribuir"). */
export type DayPlanChanges = {
  /** Removidas hoje com "redistribuir". */
  removed: number[];
  /** Trocadas hoje por outra sugestão. */
  replacements: Record<number, { title: string; foods: PlanFoods }>;
  /**
   * Fator das porções só de hoje (id → fator), multiplicado pelo permanente: ao remover com
   * "redistribuir", as refeições seguintes aumentam para receber as calorias.
   */
  scales: Record<number, number>;
};

export const EMPTY_DAY_PLAN: DayPlanChanges = {
  removed: [],
  replacements: {},
  scales: {},
};

/** Data local "AAAA-MM-DD": as mudanças do plano valem só para o dia em que foram feitas. */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type StoredUser = {
  name: string;
  username: string;
  passwordHash: string;
  profile: Profile | null;
  /** Horário escolhido pelo usuário para cada refeição do plano (id da refeição → "HH:MM"). */
  mealTimes?: Record<number, string>;
  weights?: WeightEntry[];
  planChanges?: PlanChanges;
  /** Mudanças do plano de um dia; em outro dia são ignoradas. */
  dayPlan?: { date: string; changes: DayPlanChanges };
  /**
   * Alimentos restritos ("Não gosto / Não quero / Não tenho"): o assistente não os recomenda até o
   * usuário liberar na página Alimentos. Liberar não desfaz trocas já feitas.
   */
  foodFeedback?: Record<string, FoodFeedback>;
  /**
   * Trocas permanentes de "Não gosto" e "Não tenho" em todas as refeições (nome → substituto;
   * "" = sai sem substituto). Continuam valendo mesmo depois de o alimento ser liberado.
   */
  foodSubstitutes?: Record<string, string>;
  /**
   * Trocas permanentes de "Não quero", só na refeição marcada (id da refeição → alimento →
   * substituto; "" = sai sem substituto). Ex.: um alimento que aparece em 3 refeições e é marcado
   * em uma passa a ser comido 2 vezes por dia, todos os dias.
   */
  mealFoodSwaps?: Record<number, Record<string, string>>;
};

export type AuthState = {
  user: { name: string; username: string } | null;
  profile: Profile | null;
  mealTimes: Record<number, string>;
  /** Ordenados do mais antigo para o mais recente. */
  weights: WeightEntry[];
  planChanges: PlanChanges;
  /** Mudanças do plano de hoje (vazio se não houver ou se forem de outro dia). */
  dayPlan: DayPlanChanges;
  foodFeedback: Record<string, FoodFeedback>;
  foodSubstitutes: Record<string, string>;
  mealFoodSwaps: Record<number, Record<string, string>>;
};

type Result = { ok: true } | { ok: false; error: string };

const listeners = new Set<() => void>();

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readUsers(): Record<string, StoredUser> {
  try {
    return JSON.parse(readStorage(USERS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Armazenamento indisponível (ex.: navegação privada bloqueada): a sessão só dura até recarregar.
  }
  listeners.forEach((listener) => listener());
}

function writeUsers(users: Record<string, StoredUser>) {
  write(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(username: string, password: string) {
  const data = new TextEncoder().encode(`nutriai:${username}:${password}`);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // crypto.subtle só existe em contexto seguro (https ou localhost); fallback para acesso via IP na rede local.
  let hash = 0x811c9dc5;
  for (const byte of data) hash = Math.imul(hash ^ byte, 0x01000193);
  return `fnv:${(hash >>> 0).toString(16)}`;
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function signUp(name: string, rawUsername: string, password: string): Promise<Result> {
  const username = normalizeUsername(rawUsername);
  if (name.trim().length < 2) return { ok: false, error: "Informe seu nome." };
  if (!/^[a-z0-9._]{3,20}$/.test(username)) {
    return { ok: false, error: "O usuário deve ter de 3 a 20 caracteres: letras, números, ponto ou sublinhado." };
  }
  if (password.length < 6) return { ok: false, error: "A senha deve ter pelo menos 6 caracteres." };

  const users = readUsers();
  if (users[username]) return { ok: false, error: "Esse usuário já está em uso." };

  users[username] = {
    name: name.trim(),
    username,
    passwordHash: await hashPassword(username, password),
    profile: null,
  };
  writeUsers(users);
  write(SESSION_KEY, username);
  return { ok: true };
}

export async function signIn(rawUsername: string, password: string): Promise<Result> {
  const username = normalizeUsername(rawUsername);
  const user = readUsers()[username];
  if (!user || user.passwordHash !== (await hashPassword(username, password))) {
    return { ok: false, error: "Usuário ou senha incorretos." };
  }
  write(SESSION_KEY, username);
  return { ok: true };
}

export function signOut() {
  write(SESSION_KEY, null);
}

export function saveProfile(profile: Profile) {
  const username = readStorage(SESSION_KEY);
  const users = readUsers();
  if (!username || !users[username]) return;
  users[username] = { ...users[username], profile };
  writeUsers(users);
}

export function saveMealTime(mealId: number, time: string) {
  const username = readStorage(SESSION_KEY);
  const users = readUsers();
  if (!username || !users[username]) return;
  users[username] = { ...users[username], mealTimes: { ...users[username].mealTimes, [mealId]: time } };
  writeUsers(users);
}

export function addWeightEntry(kg: number, at: Date) {
  const username = readStorage(SESSION_KEY);
  const users = readUsers();
  if (!username || !users[username]) return;
  const entry: WeightEntry = { id: `${at.getTime()}-${Math.random().toString(36).slice(2, 8)}`, at: at.toISOString(), kg };
  users[username] = { ...users[username], weights: [...(users[username].weights ?? []), entry] };
  writeUsers(users);
}

export function saveDayPlanChanges(changes: DayPlanChanges) {
  const username = readStorage(SESSION_KEY);
  const users = readUsers();
  if (!username || !users[username]) return;
  users[username] = { ...users[username], dayPlan: { date: today(), changes } };
  writeUsers(users);
}

export function savePlanChanges(changes: PlanChanges) {
  updateUser((user) => ({ ...user, planChanges: changes }));
}

function updateUser(update: (user: StoredUser) => StoredUser) {
  const username = readStorage(SESSION_KEY);
  const users = readUsers();
  if (!username || !users[username]) return;
  users[username] = update(users[username]);
  writeUsers(users);
}

/**
 * "Não gosto" / "Não tenho": o alimento é trocado por `substitute` em todas as refeições, de forma
 * permanente (`null` = sai sem substituto), e fica restrito para o assistente.
 */
export function markFoodEverywhere(foodName: string, value: FoodFeedback, substitute: string | null) {
  updateUser((user) => ({
    ...user,
    foodFeedback: { ...user.foodFeedback, [foodName]: value },
    foodSubstitutes: { ...user.foodSubstitutes, [foodName]: substitute ?? "" },
  }));
}

/**
 * "Não quero": troca o alimento só na refeição `mealId`, de forma permanente (as outras refeições
 * continuam com ele). O alimento fica restrito para o assistente, sem sobrescrever uma marcação
 * "Não gosto"/"Não tenho" que já exista.
 */
export function markFoodInMeal(mealId: number, foodName: string, substitute: string | null) {
  updateUser((user) => ({
    ...user,
    foodFeedback: { ...user.foodFeedback, [foodName]: user.foodFeedback?.[foodName] ?? "nao-quero" },
    mealFoodSwaps: {
      ...user.mealFoodSwaps,
      [mealId]: { ...user.mealFoodSwaps?.[mealId], [foodName]: substitute ?? "" },
    },
  }));
}

/** Libera o alimento para o assistente voltar a recomendá-lo. Trocas já feitas continuam. */
export function releaseFood(foodName: string) {
  updateUser((user) => {
    const foodFeedback = { ...user.foodFeedback };
    delete foodFeedback[foodName];
    return { ...user, foodFeedback };
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Mantém abas diferentes sincronizadas (login/logout em outra aba).
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

let cachedKey: string | undefined;
const SIGNED_OUT: AuthState = {
  user: null,
  profile: null,
  mealTimes: {},
  weights: [],
  planChanges: EMPTY_PLAN_CHANGES,
  dayPlan: EMPTY_DAY_PLAN,
  foodFeedback: {},
  foodSubstitutes: {},
  mealFoodSwaps: {},
};

let cachedState: AuthState = SIGNED_OUT;

/** Só os campos de hoje: planos salvos em versões antigas também traziam refeições criadas. */
function dayChanges(changes: Partial<DayPlanChanges>): DayPlanChanges {
  return {
    removed: changes.removed ?? [],
    replacements: changes.replacements ?? {},
    scales: changes.scales ?? {},
  };
}

function getSnapshot(): AuthState {
  const usersRaw = readStorage(USERS_KEY);
  const session = readStorage(SESSION_KEY);
  // A data entra na chave para o plano voltar ao base quando o dia vira.
  const key = `${session}|${today()}|${usersRaw}`;
  if (key === cachedKey) return cachedState;

  const user = session ? readUsers()[session] : undefined;
  cachedKey = key;
  cachedState = user
    ? {
        user: { name: user.name, username: user.username },
        profile: user.profile,
        mealTimes: user.mealTimes ?? {},
        weights: [...(user.weights ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
        // Mescla com o vazio: planos salvos antes de um campo existir (ex.: `added`) continuam válidos.
        planChanges: { ...EMPTY_PLAN_CHANGES, ...user.planChanges },
        dayPlan: user.dayPlan?.date === today() ? dayChanges(user.dayPlan.changes) : EMPTY_DAY_PLAN,
        foodFeedback: user.foodFeedback ?? {},
        foodSubstitutes: user.foodSubstitutes ?? {},
        mealFoodSwaps: user.mealFoodSwaps ?? {},
      }
    : SIGNED_OUT;
  return cachedState;
}

/** `undefined` enquanto o estado do navegador ainda não foi lido (render no servidor e hidratação). */
export function useAuth(): AuthState | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
