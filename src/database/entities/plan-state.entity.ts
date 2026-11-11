import { Column, Entity, PrimaryColumn, VersionColumn } from 'typeorm';
import type { AvoidRule, FoodFeedback } from '../../contract.js';

/**
 * O que vale em todos os planos do usuário: as restrições de alimentos e as trocas gerais. O que é de cada plano
 * (um por grupo de dias da rotina) fica em `schedule_plans`. Permanentes até o usuário desfazer.
 */
@Entity('plan_states')
export class PlanStateEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  /** Alimentos restritos (nome → marcação). Liberar tira daqui, mas não desfaz as trocas. */
  @Column('jsonb', { name: 'food_feedback', default: {} })
  foodFeedback: Record<string, FoodFeedback>;

  /** Trocas de "Não gosto"/"Não tenho"/"Não posso" em todas as refeições (nome → substituto; "" = sem substituto). */
  @Column('jsonb', { name: 'food_substitutes', default: {} })
  foodSubstitutes: Record<string, string>;

  /** "Alimentos que você não come": tipos de alimento que saem do plano, das sugestões e das buscas. */
  @Column('jsonb', { name: 'food_avoid', default: [] })
  foodAvoid: AvoidRule[];

  @VersionColumn()
  version: number;
}
