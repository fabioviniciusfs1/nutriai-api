import { usernameFromEmail, usernameWithSuffix } from './username.js';

describe('username do Google', () => {
  it('normaliza o e-mail', () => {
    expect(usernameFromEmail('Ana.Souza+fit@gmail.com')).toBe('ana.souzafit');
    expect(usernameFromEmail('joão-silva@gmail.com')).toBe('joaosilva');
    expect(usernameFromEmail('a@b.com')).toBe('auser');
    expect(
      usernameFromEmail('um.nome.muito.comprido.mesmo@gmail.com'),
    ).toHaveLength(20);
  });

  it('acrescenta sufixo sem passar de 20', () => {
    expect(usernameWithSuffix('ana.souza', 7)).toBe('ana.souza7');
    expect(usernameWithSuffix('a'.repeat(20), 1234)).toBe(
      `${'a'.repeat(16)}1234`,
    );
  });
});
