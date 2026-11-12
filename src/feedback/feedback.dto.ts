import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { FeedbackAnswer } from '../contract.js';
import { MAX_FEEDBACK_TEXT } from './feedback-form.js';

const TOO_LONG = `Use no máximo ${MAX_FEEDBACK_TEXT} caracteres em cada resposta.`;
const INVALID = 'Respostas inválidas.';

export class FeedbackAnswerDto implements FeedbackAnswer {
  @IsString({ message: INVALID })
  @MaxLength(10, { message: INVALID })
  questionId: string;

  @IsArray({ message: INVALID })
  @ArrayMaxSize(10, { message: INVALID })
  @IsString({ each: true, message: INVALID })
  @MaxLength(200, { each: true, message: INVALID })
  choices: string[];

  @IsOptional()
  @IsString({ message: INVALID })
  @MaxLength(MAX_FEEDBACK_TEXT, { message: TOO_LONG })
  other: string | null;

  @IsOptional()
  @IsString({ message: INVALID })
  @MaxLength(MAX_FEEDBACK_TEXT, { message: TOO_LONG })
  text: string | null;

  @IsOptional()
  @IsString({ message: INVALID })
  @MaxLength(MAX_FEEDBACK_TEXT, { message: TOO_LONG })
  comment: string | null;
}

/** Corpo de `POST /feedback`. */
export class FeedbackRequestDto {
  @IsArray({ message: 'Envie as respostas.' })
  @ArrayMaxSize(20, { message: INVALID })
  @ValidateNested({ each: true })
  @Type(() => FeedbackAnswerDto)
  answers: FeedbackAnswerDto[];
}

/** Só os campos da resposta (o DTO validado traz protótipo de classe). */
export function toFeedbackAnswers(dto: FeedbackRequestDto): FeedbackAnswer[] {
  return dto.answers.map(({ questionId, choices, other, text, comment }) => ({
    questionId,
    choices,
    other: other ?? null,
    text: text ?? null,
    comment: comment ?? null,
  }));
}
