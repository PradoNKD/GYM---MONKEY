import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LimitePorConta } from './limite-por-conta.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Sem @Throttle aqui de proposito: o teto por IP e o `default` (30/min nesta
  // rota), e o limite apertado de 5/min vem do throttler `por-conta`, contado
  // por (IP + e-mail). Antes eram 5/min por IP, o que travava o login de todo
  // mundo na academia quando alguem errava a senha algumas vezes.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @LimitePorConta()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
