import { TAMANHO_SHA_CURTO, VERSAO_DESCONHECIDA, versaoDoBuild } from './versao';

const SHA = 'c54308c1f9b4a7d2e6083a5b1c9d4e7f2a8b6c31';

describe('versaoDoBuild', () => {
  it('encurta o SHA que o Render injeta', () => {
    expect(versaoDoBuild({ RENDER_GIT_COMMIT: SHA })).toBe('c54308c');
    expect(versaoDoBuild({ RENDER_GIT_COMMIT: SHA })).toHaveLength(TAMANHO_SHA_CURTO);
  });

  it('aceita os nomes de outras hospedagens', () => {
    expect(versaoDoBuild({ GIT_COMMIT: SHA })).toBe('c54308c');
    expect(versaoDoBuild({ SOURCE_VERSION: SHA })).toBe('c54308c');
  });

  it('prefere o do Render quando ha mais de um', () => {
    expect(versaoDoBuild({ RENDER_GIT_COMMIT: SHA, GIT_COMMIT: 'aaaaaaa' })).toBe(
      'c54308c',
    );
  });

  it('mantem um SHA que ja veio curto', () => {
    expect(versaoDoBuild({ RENDER_GIT_COMMIT: 'abc1234' })).toBe('abc1234');
  });

  it('ignora espacos em volta', () => {
    expect(versaoDoBuild({ RENDER_GIT_COMMIT: `  ${SHA}\n` })).toBe('c54308c');
  });

  // O /health e o que segura o trafego no deploy: ele nao pode falhar por causa
  // de um campo informativo que veio vazio.
  describe('nunca quebra o health check', () => {
    it('sem nenhuma variavel', () => {
      expect(versaoDoBuild({})).toBe(VERSAO_DESCONHECIDA);
    });

    it('com a variavel vazia', () => {
      expect(versaoDoBuild({ RENDER_GIT_COMMIT: '' })).toBe(VERSAO_DESCONHECIDA);
      expect(versaoDoBuild({ RENDER_GIT_COMMIT: '   ' })).toBe(VERSAO_DESCONHECIDA);
    });
  });
});
