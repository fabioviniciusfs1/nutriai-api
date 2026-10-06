/** `username` válido (`[a-z0-9._]{3,20}`) a partir do e-mail do Google. */
export function usernameFromEmail(email: string): string {
  const base = (email.split('@')[0] ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);
  return base.length >= 3 ? base : `${base}user`.slice(0, 20).padEnd(3, '0');
}

/** Variação de `base` com sufixo numérico, ainda com até 20 caracteres. */
export function usernameWithSuffix(base: string, suffix: number): string {
  const tail = String(suffix);
  return `${base.slice(0, 20 - tail.length)}${tail}`;
}
