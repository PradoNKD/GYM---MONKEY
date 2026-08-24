import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: { findByEmail: jest.Mock; create: jest.Mock };
  let jwtService: { sign: jest.Mock };

  const existingUser = {
    id: 'user-1',
    name: 'Usuario Existente',
    email: 'existente@example.com',
    passwordHash: '',
    role: 'USER',
    active: true,
  };

  beforeAll(async () => {
    existingUser.passwordHash = await bcrypt.hash('senha1234', 4);
  });

  beforeEach(() => {
    usersService = { findByEmail: jest.fn(), create: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
    );
  });

  describe('register', () => {
    it('cria o usuario mas NAO loga (fica pendente de aprovacao)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: 'user-2',
        name: 'Novo Usuario',
        email: 'novo@example.com',
      });

      const result = await authService.register({
        name: 'Novo Usuario',
        email: 'novo@example.com',
        password: 'senha1234',
      });

      expect(result.status).toBe('pending_approval');
      expect(result).not.toHaveProperty('accessToken');
      // Nao emite token no cadastro: a conta so entra apos aprovacao.
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(usersService.create).toHaveBeenCalled();
    });

    it('normaliza o e-mail (trim + lowercase) antes de checar duplicidade', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: 'user-3',
        name: 'Fulano',
        email: 'fulano@example.com',
      });

      await authService.register({
        name: 'Fulano',
        email: '  Fulano@Example.com  ',
        password: 'senha1234',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'fulano@example.com',
      );
    });

    it('lanca ConflictException quando o e-mail ja esta cadastrado', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      await expect(
        authService.register({
          name: 'Outro',
          email: existingUser.email,
          password: 'senha1234',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('retorna token quando e-mail e senha estao corretos e a conta esta ativa', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      const result = await authService.login({
        email: existingUser.email,
        password: 'senha1234',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe(existingUser.id);
      expect(result.user.role).toBe('USER');
    });

    it('lanca ForbiddenException quando a conta esta inativa (aguardando aprovacao)', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...existingUser,
        active: false,
      });

      await expect(
        authService.login({
          email: existingUser.email,
          password: 'senha1234',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('so checa o active depois da senha (nao vaza que a conta existe)', async () => {
      // Conta inativa + senha errada deve dar Unauthorized (senha), nao
      // Forbidden (inativa): a ordem evita revelar contas existentes.
      usersService.findByEmail.mockResolvedValue({
        ...existingUser,
        active: false,
      });

      await expect(
        authService.login({
          email: existingUser.email,
          password: 'senhaErrada1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanca UnauthorizedException quando o e-mail nao existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'ninguem@example.com',
          password: 'qualquercoisa1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanca UnauthorizedException quando a senha esta errada', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      await expect(
        authService.login({
          email: existingUser.email,
          password: 'senhaErrada1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('nao revela se o problema foi o e-mail ou a senha (mesma mensagem)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      let mensagemEmailInexistente = '';
      try {
        await authService.login({
          email: 'ninguem@example.com',
          password: 'qualquercoisa1',
        });
      } catch (error) {
        mensagemEmailInexistente = (error as Error).message;
      }

      usersService.findByEmail.mockResolvedValue(existingUser);
      let mensagemSenhaErrada = '';
      try {
        await authService.login({
          email: existingUser.email,
          password: 'senhaErrada1',
        });
      } catch (error) {
        mensagemSenhaErrada = (error as Error).message;
      }

      expect(mensagemEmailInexistente).toBe(mensagemSenhaErrada);
    });
  });
});
