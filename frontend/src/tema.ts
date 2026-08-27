import { useCallback, useEffect, useState } from "react";

/**
 * Tema claro/escuro.
 *
 * Sao tres estados, nao dois. "sistema" existe porque o celular ja tem essa
 * preferencia configurada (e ela muda sozinha ao anoitecer, em quem usa o
 * modo automatico do iOS/Android); "claro" e "escuro" existem porque quem
 * treina de madrugada quer escuro independente do que o sistema diz.
 */
export type Tema = "sistema" | "claro" | "escuro";

/** Tema de fato pintado na tela -- "sistema" ja resolvido. */
export type TemaEfetivo = "claro" | "escuro";

const CHAVE = "gym-monkey.tema";

/** Ordem do ciclo do botao. */
export const PROXIMO_TEMA: Record<Tema, Tema> = {
  sistema: "claro",
  claro: "escuro",
  escuro: "sistema",
};

/** Como o tema e chamado para o usuario (rotulo do botao e leitor de tela). */
export const NOME_DO_TEMA: Record<Tema, string> = {
  sistema: "automatico",
  claro: "claro",
  escuro: "escuro",
};

/**
 * Cor da barra de status do sistema (Android) / da barra do Safari.
 *
 * No claro fica o vermelho da marca, como sempre foi. No escuro fica a mesma
 * cor do fundo do app: barra vermelha em cima de app escuro nao parece
 * decisao, parece defeito.
 */
const COR_DA_BARRA: Record<TemaEfetivo, string> = {
  claro: "#ff4d3d",
  escuro: "#121212",
};

function consultaDeTemaEscuro(): MediaQueryList | null {
  // matchMedia falta em ambiente de teste antigo, e a chamada pode lancar.
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  } catch {
    return null;
  }
}

/** O que o sistema operacional pede. Na duvida, claro. */
export function preferenciaDoSistema(): TemaEfetivo {
  return consultaDeTemaEscuro()?.matches ? "escuro" : "claro";
}

export function resolverTema(tema: Tema): TemaEfetivo {
  return tema === "sistema" ? preferenciaDoSistema() : tema;
}

export function lerTemaSalvo(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "claro" || salvo === "escuro" || salvo === "sistema") return salvo;
  } catch {
    // Navegacao privada sem localStorage: segue o sistema nesta sessao.
  }
  return "sistema";
}

function salvarTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem persistencia, o tema ainda vale enquanto o app estiver aberto.
  }
}

/**
 * Escreve o tema no <html> e na barra de status.
 *
 * Em "sistema" o atributo e **removido** em vez de receber o tema resolvido.
 * Parece detalhe e nao e: sem atributo, quem decide e o
 * `@media (prefers-color-scheme: dark)` do CSS, que o navegador reavalia
 * sozinho. Se gravassemos "claro" ali, o app ficaria presilhado no claro ate
 * alguem tocar no botao -- e quem escolheu "automatico" quer justo o
 * contrario.
 */
export function aplicarTema(tema: Tema): TemaEfetivo {
  const efetivo = resolverTema(tema);
  const raiz = document.documentElement;

  if (tema === "sistema") {
    delete raiz.dataset.tema;
  } else {
    raiz.dataset.tema = tema;
  }

  // A barra de status nao tem media query: essa cor e sempre escrita a mao.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", COR_DA_BARRA[efetivo]);

  return efetivo;
}

/**
 * Deixa a tela escura enquanto o componente estiver montado, **sem** apagar o
 * tema que o usuario escolheu.
 *
 * E o caso da tela de login: ela e escura sempre, porque vai receber um fundo
 * com o logo do app. Fazer isso gravando "escuro" em `data-tema` sobrescreveria
 * a escolha da pessoa; por isso vai num atributo separado (`data-tela`), com
 * especificidade maior no CSS. Ao sair da tela, tudo volta como estava.
 */
export function useTemaEscuroFixo(): void {
  useEffect(() => {
    const raiz = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const corAnterior = meta?.getAttribute("content") ?? null;

    raiz.dataset.tela = "escura";
    meta?.setAttribute("content", COR_DA_BARRA.escuro);

    return () => {
      delete raiz.dataset.tela;
      if (corAnterior !== null) meta?.setAttribute("content", corAnterior);
    };
  }, []);
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo);
  const [efetivo, setEfetivo] = useState<TemaEfetivo>(() => resolverTema(lerTemaSalvo()));

  useEffect(() => {
    setEfetivo(aplicarTema(tema));
  }, [tema]);

  // Em "sistema", acompanhar a troca em tempo real -- o iOS/Android alterna
  // sozinho no fim do dia, e o app aberto na mao precisa acompanhar.
  useEffect(() => {
    if (tema !== "sistema") return;

    const consulta = consultaDeTemaEscuro();
    if (!consulta?.addEventListener) return;

    const aoTrocar = () => setEfetivo(aplicarTema("sistema"));
    consulta.addEventListener("change", aoTrocar);
    return () => consulta.removeEventListener("change", aoTrocar);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((atual) => {
      const proximo = PROXIMO_TEMA[atual];
      salvarTema(proximo);
      return proximo;
    });
  }, []);

  return { tema, efetivo, alternar };
}
