import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GoogleAccountEntity,
  UserEntity,
  WeightEntity,
} from '../database/entities/index.js';
import { PlanModule } from '../plan/plan.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, WeightEntity, GoogleAccountEntity]),
    PlanModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
