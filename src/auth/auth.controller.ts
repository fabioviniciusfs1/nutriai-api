import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../common/auth.decorators.js';
import type { AuthResponse } from '../contract.js';
import { LoginDto, SignupDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body() body: SignupDto): Promise<AuthResponse> {
    return this.auth.signup(body);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<AuthResponse> {
    return this.auth.login(body);
  }
}
