import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, type Repository } from 'typeorm';
import { SESSION_EXPIRED } from '../auth/auth.guard.js';
import {
  addDays,
  localDate,
  weekday,
  type UserClock,
} from '../common/timezone.js';
import type {
  DietAdjustment,
  DietEstimateRequest,
  DietSettings,
  Me,
  Profile,
  Routine,
  WeightProjection,
} from '../contract.js';
import {
  GoogleAccountEntity,
  UserEntity,
  WeightEntity,
} from '../database/entities/index.js';
import {
  calculateTargets,
  projectWeight,
  targetWeightError,
} from '../targets/targets.js';
import {
  adjustMacro,
  dietAdjustment,
  dietSettingsError,
  dietSettingsOf,
  MIN_FAT_PER_KG,
  MIN_PROTEIN_PER_KG,
} from '../targets/diet.js';
import { routineError } from './routine.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(WeightEntity)
    private readonly weights: Repository<WeightEntity>,
    @InjectRepository(GoogleAccountEntity)
    private readonly googleAccounts: Repository<GoogleAccountEntity>,
  ) {}

  /** Usuário da sessão; se ele não existe mais, a sessão é inválida. */
  async get(userId: string): Promise<UserEntity> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException(SESSION_EXPIRED);
    return user;
  }

  async me(userId: string, clock: UserClock): Promise<Me> {
    const user = await this.get(userId);
    const google = await this.googleAccounts.findOneBy({ userId });
    return {
      user: {
        name: user.name,
        username: user.username,
        createdOn: localDate(user.createdAt, clock.timeZone),
      },
      // Perfis salvos antes do peso meta não têm o campo.
      profile: user.profile
        ? {
            ...user.profile,
            targetWeightKg: user.profile.targetWeightKg ?? null,
          }
        : null,
      routine: user.routine,
      targets: user.profile ? calculateTargets(user.profile) : null,
      weighInDue: await this.weighInDue(user, clock),
      // Conta criada pelo Google (sem senha) não pode desconectar: seria o único jeito de entrar.
      google: google
        ? { email: google.email, canDisconnect: user.passwordHash !== null }
        : null,
    };
  }

  async updateProfile(
    userId: string,
    profile: Profile,
    clock: UserClock,
  ): Promise<Me> {
    const error = targetWeightError(profile);
    if (error) throw new BadRequestException(error);
    const user = await this.get(userId);
    const result = await this.users.update(
      { id: userId },
      {
        profile,
        targetWeightSetOn: targetWeightSetOn(user, profile, clock),
      },
    );
    if (!result.affected)
      throw new NotFoundException('Usuário não encontrado.');
    return this.me(userId, clock);
  }

  /** Troca só o peso meta (`null` tira a meta); não muda as metas nem o plano. */
  async updateTargetWeight(
    userId: string,
    targetWeightKg: number | null,
    clock: UserClock,
  ): Promise<Me> {
    const user = await this.get(userId);
    if (!user.profile)
      throw new BadRequestException('Preencha o perfil primeiro.');
    const profile: Profile = { ...user.profile, targetWeightKg };
    const error = targetWeightError(profile);
    if (error) throw new BadRequestException(error);
    await this.users.update(
      { id: userId },
      {
        profile,
        targetWeightSetOn: targetWeightSetOn(user, profile, clock),
      },
    );
    return this.me(userId, clock);
  }

  /**
   * Projeção até o peso meta de `profile` (sem salvar). Começa no dia em que o peso meta salvo foi definido;
   * se ainda não há peso meta salvo ou `profile` traz outro, começa hoje.
   */
  async projection(
    userId: string,
    profile: Profile,
    clock: UserClock,
  ): Promise<WeightProjection> {
    const user = await this.get(userId);
    const saved = user.profile?.targetWeightKg ?? null;
    const startDate =
      saved !== null && saved === profile.targetWeightKg
        ? (user.targetWeightSetOn ?? clock.today)
        : clock.today;
    const result = projectWeight(profile, startDate);
    if (typeof result === 'string') throw new BadRequestException(result);
    return result;
  }

  /** Salva a rotina (o perfil vem antes: é o primeiro passo do cadastro). */
  async updateRoutine(
    userId: string,
    routine: Routine,
    clock: UserClock,
  ): Promise<Me> {
    const error = routineError(routine);
    if (error) throw new BadRequestException(error);
    const user = await this.get(userId);
    if (!user.profile)
      throw new BadRequestException('Preencha o perfil primeiro.');
    await this.users.update({ id: userId }, { routine });
    return this.me(userId, clock);
  }

  /** Perfil do usuário; o ajuste da dieta depende dele. */
  private async profileOf(userId: string) {
    const user = await this.get(userId);
    if (!user.profile)
      throw new BadRequestException('Preencha o perfil primeiro.');
    return { user, profile: user.profile };
  }

  /** Ajuste da dieta salvo, com as contas feitas. */
  async diet(userId: string): Promise<DietAdjustment> {
    const { user, profile } = await this.profileOf(userId);
    return dietAdjustment(profile, dietSettingsOf(user.dietSettings));
  }

  /** O ajuste com a mudança de um macro (e a compensação), sem salvar. */
  async estimateDiet(
    userId: string,
    request: DietEstimateRequest,
  ): Promise<DietAdjustment> {
    const { user, profile } = await this.profileOf(userId);
    const current: DietSettings = {
      proteinPerKg: Math.max(MIN_PROTEIN_PER_KG, request.proteinPerKg),
      fatPerKg: Math.max(MIN_FAT_PER_KG, request.fatPerKg),
      eggUnitGrams: dietSettingsOf(user.dietSettings).eggUnitGrams,
    };
    return dietAdjustment(
      profile,
      adjustMacro(profile, current, request.macro, request.perKg),
    );
  }

  /** Salva o ajuste da dieta: vale na hora para as metas e as porções do plano. */
  async updateDiet(
    userId: string,
    settings: DietSettings,
  ): Promise<DietAdjustment> {
    const profile = await this.checkDiet(userId, settings);
    await this.users.update({ id: userId }, { dietSettings: settings });
    return dietAdjustment(profile, settings);
  }

  /** Confere o ajuste da dieta (como ao salvar) e devolve o perfil. */
  async checkDiet(userId: string, settings: DietSettings): Promise<Profile> {
    const { profile } = await this.profileOf(userId);
    const error = dietSettingsError(profile, settings);
    if (error) throw new BadRequestException(error);
    return profile;
  }

  /** Hoje é o dia de pesagem da rotina e ainda não há peso registrado hoje (no fuso do usuário). */
  private async weighInDue(user: UserEntity, { today, timeZone }: UserClock) {
    if (!user.routine || weekday(today) !== user.routine.weighInDay)
      return false;
    // Margem de dois dias para cobrir qualquer fuso; o filtro exato é pelo dia local.
    const recent = await this.weights.findBy({
      userId: user.id,
      at: MoreThanOrEqual(new Date(`${addDays(today, -2)}T00:00:00Z`)),
    });
    return !recent.some((entry) => localDate(entry.at, timeZone) === today);
  }
}

/** Dia em que o peso meta foi salvo: hoje se mudou, o mesmo de antes se não mudou, `null` sem peso meta. */
function targetWeightSetOn(
  user: UserEntity,
  profile: Profile,
  clock: UserClock,
): string | null {
  if (profile.targetWeightKg === null) return null;
  const unchanged =
    (user.profile?.targetWeightKg ?? null) === profile.targetWeightKg;
  return unchanged && user.targetWeightSetOn
    ? user.targetWeightSetOn
    : clock.today;
}
