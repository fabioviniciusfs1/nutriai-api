import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth.decorators.js';
import { Clock, type UserClock } from '../../common/timezone.js';
import type { AuthResponse, GoogleLinkResponse, Me } from '../../contract.js';
import { GoogleExchangeDto, GoogleLinkDto } from './google.dto.js';
import { GoogleAuthService } from './google-auth.service.js';

@Controller()
export class GoogleAuthController {
  constructor(private readonly google: GoogleAuthService) {}

  /** Navegação do navegador: redireciona para o consentimento do Google. */
  @Public()
  @Get('auth/google/start')
  start(
    @Query('redirect_uri') redirectUri: string | undefined,
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ) {
    response.redirect(302, this.google.startLogin(redirectUri, state));
  }

  /** Chamado pelo Google; volta para a página do front. */
  @Public()
  @Get('auth/google/callback')
  async callback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Res() response: Response,
  ) {
    response.redirect(302, await this.google.callback(query));
  }

  @Public()
  @Post('auth/google/exchange')
  @HttpCode(200)
  exchange(@Body() body: GoogleExchangeDto): Promise<AuthResponse> {
    return this.google.exchange(body.code, body.redirectUri);
  }

  @Post('me/google/link')
  @HttpCode(200)
  link(
    @CurrentUser() userId: string,
    @Body() body: GoogleLinkDto,
  ): Promise<GoogleLinkResponse> {
    return this.google.startLink(userId, body.redirectUri, body.state);
  }

  @Delete('me/google')
  disconnect(
    @CurrentUser() userId: string,
    @Clock() clock: UserClock,
  ): Promise<Me> {
    return this.google.disconnect(userId, clock);
  }
}
