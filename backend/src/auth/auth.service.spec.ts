import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
    it('cria o usuario e retorna token quando o e-mail ainda nao existe', async () => {
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

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-2',
        name: 'Novo Usuario',
        email: 'novo@example.com',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-2' });
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

    it('nao inclui o hash da senha na resposta', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: 'user-4',
        name: 'Sem Hash',
        email: 'semhash@example.com',
        passwordHash: 'hash-nao-deveria-sair',
      });

      const result = await authService.register({
        name: 'Sem Hash',
        email: 'semhash@example.com',
        password: 'senha1234',
      });

      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('retorna token quando e-mail e senha estao corretos', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      const result = await authService.login({
        email: existingUser.email,
        password: 'senha1234',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe(existingUser.id);
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
