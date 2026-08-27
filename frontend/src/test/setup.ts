import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
  // O tema mora no <html>, fora da arvore do React: o cleanup nao o desfaz.
  delete document.documentElement.dataset.tema;
  delete document.documentElement.dataset.tela;
});
