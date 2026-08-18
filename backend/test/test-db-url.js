// URL do banco de teste, compartilhada entre o setup do jest e o reset do banco.
// Local usa o Postgres instalado (banco gym_monkey_test); no CI, o
// TEST_DATABASE_URL aponta pro Postgres de servico do GitHub Actions.
module.exports.testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/gym_monkey_test?schema=public';
