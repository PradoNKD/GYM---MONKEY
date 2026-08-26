import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

// Aviso discreto que ensina a instalar o PWA. Existe porque:
// - no iOS NAO ha prompt automatico: instala-se manualmente pelo Compartilhar,
//   e o item some em aba privada, entao muita gente "nao acha";
// - no iOS so o Safari instala (Chrome/Firefox/Edge no iPhone nao tem a opcao);
// - no Android/desktop da pra oferecer o botao nativo (beforeinstallprompt).
const DISMISS_KEY = "gym-monkey.install-hint";

type PromptDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function ehIOS(): boolean {
  const ua = navigator.userAgent;
  const classico = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ se apresenta como Mac; o toque denuncia que e um tablet.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classico || iPadOS;
}

function ehNavegadorSemInstalacaoNoIOS(): boolean {
  // Chrome (CriOS), Firefox (FxiOS) e Edge (EdgiOS) no iOS nao adicionam a tela inicial.
  return /crios|fxios|edgios/i.test(navigator.userAgent);
}

function jaEstaInstalado(): boolean {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

function jaFoiDispensado(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [dispensado, setDispensado] = useState(jaFoiDispensado);
  const [promptNativo, setPromptNativo] = useState<PromptDeInstalacao | null>(null);

  useEffect(() => {
    function capturar(evento: Event) {
      // Impede o mini-infobar padrao pra mostrarmos o nosso no momento certo.
      evento.preventDefault();
      setPromptNativo(evento as PromptDeInstalacao);
    }
    window.addEventListener("beforeinstallprompt", capturar);
    return () => window.removeEventListener("beforeinstallprompt", capturar);
  }, []);

  if (dispensado || jaEstaInstalado()) return null;

  function dispensar() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Sem localStorage (ex.: navegacao privada): esconde ao menos nesta sessao.
    }
    setDispensado(true);
  }

  const botaoFechar = (
    <button className="icon-btn" aria-label="Dispensar" onClick={dispensar}>
      <X size={18} />
    </button>
  );

  // Android / desktop com suporte nativo a instalacao.
  if (promptNativo) {
    return (
      <div className="install-hint" role="status">
        <div className="install-hint-texto">
          <strong>Instale o GYM MONKEY</strong>
          <span>Deixe o app na tela inicial e abra em tela cheia.</span>
        </div>
        <div className="install-hint-acoes">
          <button
            className="btn-mini btn-mini--ok"
            onClick={() => void promptNativo.prompt()}
          >
            Instalar
          </button>
          {botaoFechar}
        </div>
      </div>
    );
  }

  if (ehIOS()) {
    if (ehNavegadorSemInstalacaoNoIOS()) {
      return (
        <div className="install-hint" role="status">
          <div className="install-hint-texto">
            <strong>Para instalar no iPhone</strong>
            <span>
              Abra este site no <b>Safari</b> — só por ele dá pra adicionar à tela inicial.
            </span>
          </div>
          {botaoFechar}
        </div>
      );
    }

    return (
      <div className="install-hint" role="status">
        <div className="install-hint-texto">
          <strong>Instale na tela inicial</strong>
          <span>
            Toque em Compartilhar <Share size={14} aria-label="Compartilhar" /> e depois em{" "}
            <b>"Adicionar à Tela de Início"</b>.
          </span>
        </div>
        {botaoFechar}
      </div>
    );
  }

  return null;
}
