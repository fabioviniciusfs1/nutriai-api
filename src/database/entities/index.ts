import { ActivityDayEntity } from './activity-day.entity.js';
import {
  BaseMealEntity,
  FoodEntity,
  NutrientDefEntity,
} from './catalog.entities.js';
import { ChatMessageEntity } from './chat-message.entity.js';
import { DayLogEntity } from './day-log.entity.js';
import { GoogleAccountEntity } from './google-account.entity.js';
import { LlmCallEntity } from './llm-call.entity.js';
import { OAuthCodeEntity } from './oauth-code.entity.js';
import { PlanStateEntity } from './plan-state.entity.js';
import { TacoFoodEntity } from './taco-food.entity.js';
import { TbcaFoodEntity } from './tbca-food.entity.js';
import { UserEntity } from './user.entity.js';
import { WeightEntity } from './weight.entity.js';

export type { LlmTask } from './llm-call.entity.js';

export {
  ActivityDayEntity,
  BaseMealEntity,
  ChatMessageEntity,
  DayLogEntity,
  FoodEntity,
  GoogleAccountEntity,
  LlmCallEntity,
  NutrientDefEntity,
  OAuthCodeEntity,
  PlanStateEntity,
  TacoFoodEntity,
  TbcaFoodEntity,
  UserEntity,
  WeightEntity,
};

export const ENTITIES = [
  ActivityDayEntity,
  BaseMealEntity,
  ChatMessageEntity,
  DayLogEntity,
  FoodEntity,
  GoogleAccountEntity,
  LlmCallEntity,
  NutrientDefEntity,
  OAuthCodeEntity,
  PlanStateEntity,
  TacoFoodEntity,
  TbcaFoodEntity,
  UserEntity,
  WeightEntity,
];
