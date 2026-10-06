import {
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
import type { Me, Profile } from '../contract.js';
import {
  GoogleAccountEntity,
  UserEntity,
  WeightEntity,
} from '../database/entities/index.js';
import { calculateTargets } from '../targets/targets.js';

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
      user: { name: user.name, username: user.username },
      profile: user.profile,
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
    const result = await this.users.update({ id: userId }, { profile });
    if (!result.affected)
      throw new NotFoundException('Usuário não encontrado.');
    return this.me(userId, clock);
  }

  /** Hoje é o dia de pesagem do perfil e ainda não há peso registrado hoje (no fuso do usuário). */
  private async weighInDue(user: UserEntity, { today, timeZone }: UserClock) {
    if (!user.profile || weekday(today) !== user.profile.weighInDay)
      return false;
    // Margem de dois dias para cobrir qualquer fuso; o filtro exato é pelo dia local.
    const recent = await this.weights.findBy({
      userId: user.id,
      at: MoreThanOrEqual(new Date(`${addDays(today, -2)}T00:00:00Z`)),
    });
    return !recent.some((entry) => localDate(entry.at, timeZone) === today);
  }
}
