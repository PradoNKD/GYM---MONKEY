import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

const UA_SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const UA_CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const UA_CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function definirUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

function definirStandalone(standalone: boolean) {
  // matchMedia é o sinal principal de "está instalado (display-mode: standalone)".
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, "standalone", { value: standalone, configurable: true });
}

describe("InstallPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    definirStandalone(false);
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    Object.defineProperty(navigator, "platform", { value: "iPhone", configurable: true });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("no Safari do iPhone (nao instalado) ensina a adicionar a tela inicial", () => {
    definirUA(UA_SAFARI_IOS);
    render(<InstallPrompt />);

    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
  });

  it("em outro navegador do iPhone, manda abrir no Safari", () => {
    definirUA(UA_CHROME_IOS);
    render(<InstallPrompt />);

    expect(screen.getByText(/Abra este site no/)).toBeInTheDocument();
    expect(screen.getByText("Safari")).toBeInTheDocument();
  });

  it("nao mostra nada quando o app ja esta instalado (standalone)", () => {
    definirUA(UA_SAFARI_IOS);
    definirStandalone(true);

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("nao mostra nada em desktop sem suporte a instalacao nativa", () => {
    definirUA(UA_CHROME_DESKTOP);
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("ao dispensar, some e nao volta (grava no localStorage)", async () => {
    definirUA(UA_SAFARI_IOS);
    const { unmount } = render(<InstallPrompt />);

    await userEvent.click(screen.getByRole("button", { name: "Dispensar" }));
    expect(screen.queryByText(/Adicionar à Tela de Início/)).not.toBeInTheDocument();
    expect(localStorage.getItem("gym-monkey.install-hint")).toBe("1");

    // Mesmo remontando (novo carregamento), continua escondido.
    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByText(/Adicionar à Tela de Início/)).not.toBeInTheDocument();
  });

  it("reserva espaco no rodape enquanto a dica esta na tela", async () => {
    // A dica flutua sobre a pagina e tapava o fim do card num iPhone SE.
    definirUA(UA_SAFARI_IOS);
    render(<InstallPrompt />);

    expect(document.body).toHaveClass("com-dica-instalacao");

    await userEvent.click(screen.getByRole("button", { name: "Dispensar" }));

    expect(document.body).not.toHaveClass("com-dica-instalacao");
  });

  it("nao reserva espaco quando nao ha dica a dar", () => {
    definirUA(UA_CHROME_DESKTOP);
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });

    render(<InstallPrompt />);

    expect(document.body).not.toHaveClass("com-dica-instalacao");
  });

  it("no Android/desktop com beforeinstallprompt, oferece o botao Instalar", () => {
    definirUA(UA_CHROME_DESKTOP);
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });

    render(<InstallPrompt />);

    const evento = new Event("beforeinstallprompt");
    Object.assign(evento, { prompt: vi.fn().mockResolvedValue(undefined) });
    act(() => {
      window.dispatchEvent(evento);
    });

    expect(screen.getByRole("button", { name: "Instalar" })).toBeInTheDocument();
  });
});
