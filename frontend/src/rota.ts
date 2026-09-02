import { useEffect, useState } from "react";

/**
 * Navegacao por abas.
 *
 * **Por que hash (`#/historico`) e nao caminho (`/historico`)**: o site e
 * publicado no GitHub Pages, que serve arquivo estatico e nao tem fallback de
 * SPA. Num caminho de verdade, abrir `/GYM---MONKEY/historico` direto -- ou dar
 * F5 dentro do app -- devolveria **404**, porque nao existe arquivo ali. A saida
 * comum e duplicar o `index.html` como `404.html`, um truque que depende de
 * detalhe de hospedagem. Com hash o servidor nunca ve a rota, entao o problema
 * nao existe, e o botao voltar do celular continua funcionando de graca.
 *
 * Nao entra biblioteca de router: sao tres abas, sem rota aninhada e sem
 * parametro. Quando a v2.0 pedir rota com parametro, o lugar de trocar isto por
 * uma biblioteca e aqui -- os componentes so conhecem `useAba`.
 */

export type Aba = "hoje" | "historico" | "perfil";

/** A ordem aqui e a ordem da barra na tela. */
export const ABAS: readonly Aba[] = ["hoje", "historico", "perfil"];

/** Onde o app abre, e onde ele cai quando o hash nao diz nada util. */
export const ABA_INICIAL: Aba = "hoje";

export const TITULO_DA_ABA: Record<Aba, string> = {
  hoje: "Hoje",
  historico: "Histórico",
  perfil: "Perfil",
};

function ehAba(valor: string): valor is Aba {
  return (ABAS as readonly string[]).includes(valor);
}

/**
 * Le a aba de um hash de URL.
 *
 * Tolerante de proposito: hash vazio, desconhecido, com ou sem barra, com
 * query ou com maiusculas cai na aba inicial em vez de quebrar. Rota vinda da
 * URL e entrada do usuario -- link velho, favorito, PWA reabrindo com hash
 * antigo -- e tela em branco e o pior resultado possivel.
 */
export function lerAba(hash: string): Aba {
  const limpo = hash
    .replace(/^#/, "")
    .replace(/^\//, "")
    .replace(/\/+$/, "")
    .split(/[?&]/)[0]
    .trim()
    .toLowerCase();

  return ehAba(limpo) ? limpo : ABA_INICIAL;
}

export function hashDaAba(aba: Aba): string {
  return `#/${aba}`;
}

/**
 * A aba atual, sincronizada com o hash da URL.
 *
 * O hash e a fonte da verdade, nao um espelho do estado: assim o botao voltar
 * do aparelho troca de aba, e recarregar mantem a pessoa onde ela estava.
 */
export function useAba(): { aba: Aba; irPara: (proxima: Aba) => void } {
  const [aba, setAba] = useState<Aba>(() =>
    lerAba(typeof window === "undefined" ? "" : window.location.hash),
  );

  useEffect(() => {
    function aoTrocar() {
      setAba(lerAba(window.location.hash));
    }

    window.addEventListener("hashchange", aoTrocar);
    return () => window.removeEventListener("hashchange", aoTrocar);
  }, []);

  function irPara(proxima: Aba) {
    window.location.hash = hashDaAba(proxima);
    // Este `setAba` e **redundante quando o `hashchange` dispara** -- e ele
    // dispara em todo navegador atual. Foi teste de mutacao que mostrou isso:
    // apagar esta linha nao quebra nenhum teste. Fica como rede, porque somos
    // um PWA e webview embutida ja teve historico de nao entregar o evento; sem
    // ela, um evento perdido congela a navegacao inteira. Nao e o caminho
    // normal, e nao deve ser lido como se fosse.
    setAba(proxima);
  }

  return { aba, irPara };
}
