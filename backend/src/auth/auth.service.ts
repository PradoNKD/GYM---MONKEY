import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

// Mensagem única e genérica pra login: não revela se o problema foi e-mail
// inexistente ou senha errada.
const CREDENCIAIS_INVALIDAS = 'E-mail ou senha invalidos';
const CONTA_PENDENTE =
  'Sua conta ainda nao foi liberada. Aguarde a aprovacao de um supervisor.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(
      dto.email.trim().toLowerCase(),
    );

    if (existing) {
      throw new ConflictException('Ja existe um usuario com este e-mail');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

    // Novo usuario entra inativo: nao logamos automaticamente. Ele so recebe
    // token via /auth/login depois que um supervisor liberar a conta.
    return {
      status: 'pending_approval' as const,
      message:
        'Conta criada! Ela precisa ser liberada por um supervisor antes do primeiro acesso.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(
      dto.email.trim().toLowerCase(),
    );

    if (!user) {
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    // Checa a liberação só depois da senha conferir, pra não vazar quais
    // e-mails existem no sistema.
    if (!user.active) {
      throw new ForbiddenException(CONTA_PENDENTE);
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }) {
    const accessToken = this.jwtService.sign({ sub: user.id });

    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}
