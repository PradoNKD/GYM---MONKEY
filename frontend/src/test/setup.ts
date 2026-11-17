import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Node 26 introduziu globalThis.localStorage experimental que pode vir como undefined
// sem --localstorage-file. Assegura que localStorage aponte para window.localStorage do jsdom.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.clear !== "function") {
  const storage: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => (key in storage ? storage[key] : null),
    setItem: (key: string, value: string) => { storage[key] = String(value); },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
    get length() { return Object.keys(storage).length; },
    key: (i: number) => Object.keys(storage)[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: typeof window !== "undefined" && window.localStorage ? window.localStorage : mockStorage,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  // O tema mora no <html>, fora da arvore do React: o cleanup nao o desfaz.
  delete document.documentElement.dataset.tema;
  delete document.documentElement.dataset.tela;
  // A aba mora no hash da URL, que tambem sobrevive ao cleanup. Sem isto, um
  // teste que troca de aba deixa o proximo abrindo na aba errada -- e a falha
  // aparece no teste seguinte, longe da causa.
  // `replaceState` e nao atribuicao: atribuir o hash enfileira um
  // `hashchange` que pode cair no teste seguinte, ja montado, e trocar a
  // aba dele no meio do caminho.
  if (window.location.hash) window.history.replaceState(null, "", " ");
});
