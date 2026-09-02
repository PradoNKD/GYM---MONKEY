import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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
