import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aplicarTema,
  escolhaPara,
  lerTemaSalvo,
  resolverTema,
  useTema,
  useTemaEscuroFixo,
} from "./tema";

/**
 * matchMedia controlavel: o jsdom devolve sempre `matches: false`, e boa parte
 * do que importa aqui e justamente o comportamento com o sistema no escuro.
 */
function mockarSistema(inicialEscuro: boolean) {
  let escuro = inicialEscuro;
  const ouvintes = new Set<() => void>();

  window.matchMedia = ((query: string) => ({
    get matches() {
      return escuro && query.includes("prefers-color-scheme: dark");
    },
    media: query,
    onchange: null,
    addEventListener: (_evento: string, cb: () => void) => ouvintes.add(cb),
    removeEventListener: (_evento: string, cb: () => void) => ouvintes.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;

  return {
    trocarPara(novoEscuro: boolean) {
      escuro = novoEscuro;
      for (const cb of ouvintes) cb();
    },
    ouvintesAtivos: () => ouvintes.size,
  };
}

function corDaBarra(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;
}

describe("tema", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.tema;
    document.head.innerHTML = '<meta name="theme-color" content="#ff4d3d" />';
    mockarSistema(false);
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.tema;
  });

  describe("lerTemaSalvo", () => {
    it("sem nada salvo, segue o sistema", () => {
      expect(lerTemaSalvo()).toBe("sistema");
    });

    it("le a escolha salva", () => {
      localStorage.setItem("gym-monkey.tema", "escuro");
      expect(lerTemaSalvo()).toBe("escuro");
    });

    it("ignora valor invalido em vez de propagar lixo pro CSS", () => {
      localStorage.setItem("gym-monkey.tema", "roxo");
      expect(lerTemaSalvo()).toBe("sistema");
    });
  });

  describe("resolverTema", () => {
    it("em 'sistema', segue a preferencia do aparelho", () => {
      mockarSistema(true);
      expect(resolverTema("sistema")).toBe("escuro");
    });

    it("escolha explicita vence o sistema", () => {
      mockarSistema(true);
      expect(resolverTema("claro")).toBe("claro");
    });
  });

  describe("aplicarTema", () => {
    it("em 'sistema', NAO marca data-tema -- e o CSS que decide", () => {
      // Este e o ponto sutil: se gravassemos "claro" aqui, o app ficaria
      // preso no claro quando o celular virasse escuro sozinho.
      document.documentElement.dataset.tema = "claro";

      aplicarTema("sistema");

      expect(document.documentElement.dataset.tema).toBeUndefined();
    });

    it("em escolha explicita, marca data-tema", () => {
      aplicarTema("escuro");
      expect(document.documentElement.dataset.tema).toBe("escuro");

      aplicarTema("claro");
      expect(document.documentElement.dataset.tema).toBe("claro");
    });

    it("pinta a barra de status com a cor do tema efetivo", () => {
      aplicarTema("escuro");
      expect(corDaBarra()).toBe("#121212");

      aplicarTema("claro");
      expect(corDaBarra()).toBe("#ff4d3d");
    });

    it("em 'sistema' com aparelho escuro, a barra tambem escurece", () => {
      mockarSistema(true);

      expect(aplicarTema("sistema")).toBe("escuro");
      expect(corDaBarra()).toBe("#121212");
    });
  });

  describe("useTema", () => {
    it("com aparelho no claro: alterna pro escuro e volta pro automatico", () => {
      // Dois estados, nao tres. Voltar pro tema que o aparelho ja pede apaga a
      // escolha -- e o que faz um botao de dois estados nunca trancar ninguem
      // fora do automatico.
      mockarSistema(false);
      const { result } = renderHook(() => useTema());
      expect(result.current.efetivo).toBe("claro");

      act(() => result.current.alternar());
      expect(result.current.efetivo).toBe("escuro");
      expect(result.current.tema).toBe("escuro");
      expect(document.documentElement.dataset.tema).toBe("escuro");

      act(() => result.current.alternar());
      expect(result.current.efetivo).toBe("claro");
      expect(result.current.tema).toBe("sistema");
      expect(document.documentElement.dataset.tema).toBeUndefined();
    });

    it("com aparelho no escuro: alterna pro claro e volta pro automatico", () => {
      mockarSistema(true);
      const { result } = renderHook(() => useTema());
      expect(result.current.efetivo).toBe("escuro");

      act(() => result.current.alternar());
      expect(result.current.efetivo).toBe("claro");
      expect(result.current.tema).toBe("claro");

      act(() => result.current.alternar());
      expect(result.current.efetivo).toBe("escuro");
      expect(result.current.tema).toBe("sistema");
      expect(document.documentElement.dataset.tema).toBeUndefined();
    });

    it("depois de voltar ao automatico, volta a acompanhar o aparelho", () => {
      // O ponto de apagar a escolha: se gravassemos "claro" ali, o app ficaria
      // preso no claro quando o celular virasse escuro sozinho.
      const sistema = mockarSistema(false);
      const { result } = renderHook(() => useTema());

      act(() => result.current.alternar()); // -> escuro (escolha explicita)
      act(() => result.current.alternar()); // -> claro, que e o do sistema: apaga

      act(() => sistema.trocarPara(true));

      expect(result.current.efetivo).toBe("escuro");
    });

    it("comeca do tema salvo, nao do padrao", () => {
      localStorage.setItem("gym-monkey.tema", "escuro");

      const { result } = renderHook(() => useTema());

      expect(result.current.tema).toBe("escuro");
      expect(result.current.efetivo).toBe("escuro");
    });

    it("em 'sistema', acompanha o aparelho trocando de tema em tempo real", () => {
      const sistema = mockarSistema(false);
      const { result } = renderHook(() => useTema());
      expect(result.current.efetivo).toBe("claro");

      act(() => sistema.trocarPara(true));

      expect(result.current.efetivo).toBe("escuro");
      expect(corDaBarra()).toBe("#121212");
    });

    it("com tema forcado, ignora o aparelho trocando", () => {
      const sistema = mockarSistema(false);
      localStorage.setItem("gym-monkey.tema", "claro");
      const { result } = renderHook(() => useTema());

      act(() => sistema.trocarPara(true));

      expect(result.current.efetivo).toBe("claro");
      expect(corDaBarra()).toBe("#ff4d3d");
    });

    it("solta o ouvinte do sistema ao desmontar", () => {
      const sistema = mockarSistema(false);
      const { unmount } = renderHook(() => useTema());
      expect(sistema.ouvintesAtivos()).toBe(1);

      unmount();

      expect(sistema.ouvintesAtivos()).toBe(0);
    });
  });

  describe("escolhaPara", () => {
    it("grava a escolha quando ela difere do aparelho", () => {
      mockarSistema(false);
      expect(escolhaPara("escuro")).toBe("escuro");
    });

    it("grava 'sistema' quando a escolha coincide com o aparelho", () => {
      mockarSistema(false);
      expect(escolhaPara("claro")).toBe("sistema");

      mockarSistema(true);
      expect(escolhaPara("escuro")).toBe("sistema");
    });
  });

  describe("useTemaEscuroFixo", () => {
    it("escurece a tela enquanto montada e desfaz ao sair", () => {
      const { unmount } = renderHook(() => useTemaEscuroFixo());

      expect(document.documentElement.dataset.tela).toBe("escura");
      expect(corDaBarra()).toBe("#121212");

      unmount();

      expect(document.documentElement.dataset.tela).toBeUndefined();
      expect(corDaBarra()).toBe("#ff4d3d");
    });

    it("nao apaga o tema escolhido pelo usuario", () => {
      // O ponto todo de usar `data-tela` em vez de `data-tema`: quem escolheu
      // claro continua no claro depois de sair da tela de login.
      localStorage.setItem("gym-monkey.tema", "claro");
      aplicarTema("claro");

      const { unmount } = renderHook(() => useTemaEscuroFixo());
      expect(document.documentElement.dataset.tema).toBe("claro");

      unmount();

      expect(document.documentElement.dataset.tema).toBe("claro");
      expect(lerTemaSalvo()).toBe("claro");
    });

    it("devolve a barra de status pra cor do tema do usuario, nao pra vermelha fixa", () => {
      aplicarTema("escuro");
      expect(corDaBarra()).toBe("#121212");

      const { unmount } = renderHook(() => useTemaEscuroFixo());
      unmount();

      expect(corDaBarra()).toBe("#121212");
    });
  });
});
