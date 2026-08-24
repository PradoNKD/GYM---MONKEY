import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';

// Roda depois do JwtAuthGuard: exige que o usuario autenticado seja SUPERVISOR.
@Injectable()
export class SupervisorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    if (request.user?.role !== Role.SUPERVISOR) {
      throw new ForbiddenException('Acesso restrito a supervisores');
    }

    return true;
  }
}
