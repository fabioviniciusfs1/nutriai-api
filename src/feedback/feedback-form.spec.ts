import type { FeedbackAnswer } from '../contract.js';
import {
  feedbackError,
  FEEDBACK_FORM,
  googleFormBody,
  normalizeFeedback,
} from './feedback-form.js';

const answer = (
  questionId: string,
  change: Partial<FeedbackAnswer> = {},
): FeedbackAnswer => ({
  questionId,
  choices: [],
  other: null,
  text: null,
  comment: null,
  ...change,
});

/** Todas as obrigatórias respondidas. */
const complete = (): FeedbackAnswer[] => [
  answer('q1', { choices: ['Nenhum'] }),
  ...['q2', 'q3', 'q5', 'q6'].map((id) =>
    answer(id, { choices: ['Concordo Totalmente'] }),
  ),
  answer('q4', { choices: ['Não fiz troca'] }),
  answer('q7', { choices: ['Até R$ 15'] }),
];

describe('formulário de feedback', () => {
  it('tem as 9 perguntas, as 7 primeiras obrigatórias e com comentário', () => {
    expect(FEEDBACK_FORM.questions.map((q) => q.id)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      'q6',
      'q7',
      'q8',
      'q9',
    ]);
    expect(FEEDBACK_FORM.questions.map((q) => q.required)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(FEEDBACK_FORM.questions[3].options[0]).toBe('Não fiz troca');
    expect(FEEDBACK_FORM.questions[7].comment).toBeNull();
    expect(FEEDBACK_FORM.questions[0]).not.toHaveProperty('entry');
  });

  it('aceita as obrigatórias respondidas, sem a 8 e a 9', () => {
    expect(feedbackError(complete())).toBeNull();
  });

  it('pede as obrigatórias, opções do formulário e uma só na escala', () => {
    expect(feedbackError(complete().slice(1))).toBe('Responda a pergunta 1.');
    const answers = complete();
    answers[1] = answer('q2', { choices: ['Talvez'] });
    expect(feedbackError(answers)).toBe(
      'Escolha uma das opções da pergunta 2.',
    );
    answers[1] = answer('q2', {
      choices: ['Concordo Totalmente', 'Discordo Totalmente'],
    });
    expect(feedbackError(answers)).toBe('Escolha só uma opção na pergunta 2.');
    expect(feedbackError([...complete(), answer('q10')])).toBe(
      'Pergunta desconhecida no formulário.',
    );
  });

  it('"Outro" conta como resposta da 1; texto só de espaços não', () => {
    const answers = complete();
    answers[0] = answer('q1', { other: 'Planilha' });
    expect(feedbackError(answers)).toBeNull();
    answers[0] = answer('q1', { other: '   ' });
    expect(feedbackError(answers)).toBe('Responda a pergunta 1.');
  });

  it('manda ao Google os entry ids, o "Outro" e os comentários', () => {
    const answers = normalizeFeedback([
      ...complete().slice(1),
      answer('q1', {
        choices: ['App de dieta com IA', 'Nenhum'],
        other: ' Planilha ',
        comment: 'Usei pouco',
      }),
      answer('q8', { text: 'Gostei das trocas' }),
      answer('q9', { text: 'Nada a acrescentar' }),
    ]);
    const body = googleFormBody(answers);
    expect(body.getAll('entry.1832850513')).toEqual([
      'App de dieta com IA',
      'Nenhum',
      '__other_option__',
    ]);
    expect(body.get('entry.1832850513.other_option_response')).toBe('Planilha');
    expect(body.get('entry.981106520')).toBe('Usei pouco');
    expect(body.get('entry.1448301613')).toBe('Não fiz troca');
    expect(body.get('entry.106460765')).toBe('Gostei das trocas');
    expect(body.has('entry.659829477')).toBe(false);
    expect(body.get('entry.1117855297')).toBe('Nada a acrescentar');
  });
});
