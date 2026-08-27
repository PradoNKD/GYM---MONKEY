import { Moon, Sun, SunMoon } from "lucide-react";
import { NOME_DO_TEMA, PROXIMO_TEMA, useTema, type Tema } from "./tema";

const ICONE: Record<Tema, typeof SunMoon> = {
  sistema: SunMoon,
  claro: Sun,
  escuro: Moon,
};

/**
 * Um botao que cicla sistema -> claro -> escuro -> sistema.
 *
 * O rotulo diz o estado atual **e** o proximo, porque so o icone nao explica
 * um ciclo de tres: "sol e lua" nao e obviamente "automatico".
 */
export function BotaoTema() {
  const { tema, alternar } = useTema();
  const Icone = ICONE[tema];
  const rotulo = `Tema ${NOME_DO_TEMA[tema]}. Trocar para ${NOME_DO_TEMA[PROXIMO_TEMA[tema]]}`;

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={alternar}
      aria-label={rotulo}
      title={rotulo}
    >
      <Icone size={18} />
    </button>
  );
}
