import type {
  FeedbackAnswer,
  FeedbackForm,
  FeedbackQuestion,
} from '../contract.js';

/**
 * Uma pergunta do formulário com os campos do Google Forms (`entry.<id>`) da resposta e do comentário;
 * `entry` `null` = a pergunta ainda não existe no Google (fica só no app).
 */
type FormQuestion = FeedbackQuestion & {
  entry: number | null;
  commentEntry: number | null;
};

/** Tamanho máximo de cada texto (comentário, "Outro", resposta aberta). */
export const MAX_FEEDBACK_TEXT = 2000;

const AGREEMENT = [
  'Discordo Totalmente',
  'Discordo parcialmente',
  'Nem concordo nem discordo',
  'Concordo parcialmente',
  'Concordo Totalmente',
];

const comment = (n: number) => `Comentário sobre a pergunta ${n} (opcional)`;

const scale = (
  n: number,
  title: string,
  entry: number,
  commentEntry: number,
  options = AGREEMENT,
): FormQuestion => ({
  id: `q${n}`,
  title: `${n}. ${title}`,
  help: null,
  kind: 'single',
  options,
  other: false,
  required: true,
  comment: comment(n),
  entry,
  commentEntry,
});

/** As perguntas do "Formulário de validação do Alere.ai" (Google Forms), com os textos exatos de lá. */
const QUESTIONS: FormQuestion[] = [
  {
    id: 'q1',
    title: '1. Antes do Alere.ai, você já usou:',
    help: 'Pode marcar mais de uma opção.',
    kind: 'multiple',
    options: [
      'App de dieta com IA',
      'App de dieta mais simples, sem IA (ex.: MyFitnessPal, FatSecret)',
      'Acompanhamento com nutricionista',
      'Nenhum',
    ],
    other: true,
    required: true,
    comment: comment(1),
    entry: 1832850513,
    commentEntry: 981106520,
  },
  scale(2, 'O Alere.ai é fácil de usar.', 1556225304, 659829477),
  scale(
    3,
    'O plano alimentar gerado se encaixa na minha rotina diária.',
    1441663346,
    521348341,
  ),
  scale(
    4,
    'Depois das trocas de alimentos, o plano ficou mais adequado ao meu gosto.',
    1448301613,
    921648110,
    ['Não fiz troca', ...AGREEMENT],
  ),
  scale(
    5,
    'Eu usaria as informações nutricionais do Alere.ai sem sentir necessidade de conferi-las em outra fonte.',
    950156575,
    616484050,
  ),
  scale(
    6,
    'Confio que o plano gerado é benéfico para a minha saúde.',
    1088062381,
    272969677,
  ),
  scale(
    7,
    'Quanto você estaria disposto(a) a pagar por mês para usar o Alere.ai?',
    771922947,
    1225760091,
    ['Não pagaria', 'Até R$ 15', 'Até R$ 25', 'Até R$ 35', 'Mais de R$ 35'],
  ),
  {
    id: 'q8',
    title:
      '8. O que você mais gostou e o que mudaria ou acrescentaria no Alere.ai?',
    help: null,
    kind: 'text',
    options: [],
    other: false,
    required: false,
    comment: null,
    entry: 106460765,
    commentEntry: null,
  },
  {
    id: 'q9',
    title: '9. Comentários gerais (opcional)',
    help: null,
    kind: 'text',
    options: [],
    other: false,
    required: false,
    comment: null,
    entry: 1117855297,
    commentEntry: null,
  },
];

/** O formulário como o front exibe (sem os campos do Google). */
export const FEEDBACK_FORM: FeedbackForm = {
  title: 'Formulário de validação do Alere.ai',
  description:
    'Obrigado por testar o Alere.ai! Suas respostas nos ajudam a melhorar o app.',
  questions: QUESTIONS.map(
    ({ entry: _entry, commentEntry: _commentEntry, ...question }) => question,
  ),
  confirmation: 'Sua resposta foi registrada.',
};

const blank = (text: string | null) => !text?.trim();

/** Respostas na ordem do formulário, com os textos aparados (vazio → `null`) e sem perguntas faltando. */
export function normalizeFeedback(answers: FeedbackAnswer[]): FeedbackAnswer[] {
  return QUESTIONS.map((question) => {
    const answer = answers.find((a) => a.questionId === question.id);
    const clean = (text: string | null | undefined) =>
      text?.trim() ? text.trim() : null;
    return {
      questionId: question.id,
      choices: question.kind === 'text' ? [] : (answer?.choices ?? []),
      other: question.other ? clean(answer?.other) : null,
      text: question.kind === 'text' ? clean(answer?.text) : null,
      comment: question.comment ? clean(answer?.comment) : null,
    };
  });
}

/** O que impede de enviar as respostas, em pt-BR; `null` se estão ok. */
export function feedbackError(raw: FeedbackAnswer[]): string | null {
  const ids = raw.map((a) => a.questionId);
  if (ids.some((id) => !QUESTIONS.some((question) => question.id === id)))
    return 'Pergunta desconhecida no formulário.';
  if (new Set(ids).size !== ids.length)
    return 'Envie uma resposta por pergunta.';
  const answers = normalizeFeedback(raw);
  for (const question of QUESTIONS) {
    const answer = answers.find((a) => a.questionId === question.id)!;
    const number = question.id.slice(1);
    const texts = [answer.other, answer.text, answer.comment];
    if (texts.some((text) => (text?.length ?? 0) > MAX_FEEDBACK_TEXT))
      return `Use no máximo ${MAX_FEEDBACK_TEXT} caracteres em cada resposta.`;
    if (answer.choices.some((choice) => !question.options.includes(choice)))
      return `Escolha uma das opções da pergunta ${number}.`;
    if (new Set(answer.choices).size !== answer.choices.length)
      return `Escolha uma das opções da pergunta ${number}.`;
    if (question.kind === 'single' && answer.choices.length > 1)
      return `Escolha só uma opção na pergunta ${number}.`;
    const answered =
      question.kind === 'text'
        ? !blank(answer.text)
        : answer.choices.length > 0 || answer.other !== null;
    if (question.required && !answered) return `Responda a pergunta ${number}.`;
  }
  return null;
}

/** Corpo do `formResponse` do Google Forms com as respostas (já normalizadas). */
export function googleFormBody(answers: FeedbackAnswer[]): URLSearchParams {
  const body = new URLSearchParams();
  for (const question of QUESTIONS) {
    const answer = answers.find((a) => a.questionId === question.id);
    if (!answer || question.entry === null) continue;
    const field = `entry.${question.entry}`;
    for (const choice of answer.choices) body.append(field, choice);
    if (answer.other !== null) {
      body.append(field, '__other_option__');
      body.append(`${field}.other_option_response`, answer.other);
    }
    if (answer.text !== null) body.append(field, answer.text);
    if (question.commentEntry !== null && answer.comment !== null)
      body.append(`entry.${question.commentEntry}`, answer.comment);
  }
  return body;
}
