import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: { findById: jest.Mock };

  beforeEach(() => {
    usersService = { findById: jest.fn() };
    const configService = {
      get: jest.fn().mockReturnValue('segredo-de-teste'),
    } as unknown as ConfigService;

    strategy = new JwtStrategy(
      configService,
      usersService as unknown as UsersService,
    );
  });

  it('retorna id, nome, e-mail e role quando o usuario existe e esta ativo', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      name: 'Fulano',
      email: 'fulano@example.com',
      role: 'USER',
      active: true,
      passwordHash: 'nao-deveria-sair-daqui',
    });

    const result = await strategy.validate({ sub: 'user-1' });

    expect(result).toEqual({
      id: 'user-1',
      name: 'Fulano',
      email: 'fulano@example.com',
      role: 'USER',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('lanca UnauthorizedException quando o usuario do token nao existe mais', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'user-deletado' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lanca UnauthorizedException quando a conta foi desativada (token deixa de valer)', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      name: 'Fulano',
      email: 'fulano@example.com',
      role: 'USER',
      active: false,
    });

    await expect(strategy.validate({ sub: 'user-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
