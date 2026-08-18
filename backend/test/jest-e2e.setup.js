process.env.DATABASE_URL = 'file:./test.db';
// >= 32 chars para passar pela validacao de env (validateEnv); e so um valor
// de teste, nao um segredo real.
process.env.JWT_SECRET = 'QQsW4jpFy-s1yi5ryJBNRJrgTOXU1DUhV_rS0jVJ5lD';
process.env.FRONTEND_URL = 'http://localhost:5173';
