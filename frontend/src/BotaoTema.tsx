import { Moon, Sun } from "lucide-react";
import { NOME_DO_TEMA, oposto, useTema } from "./tema";

/**
 * Um botao de dois estados: mostra o icone do tema que o toque vai aplicar.
 *
 * Nao existe um terceiro estado "automatico" na tela, e nao precisa: seguir o
 * celular e o comportamento de quem nunca tocou no botao, e voltar pro tema que
 * o aparelho ja pede apaga a escolha e devolve o automatico. Ver tema.ts.
 */
export function BotaoTema() {
  const { efetivo, alternar } = useTema();

  const alvo = oposto(efetivo);
  const Icone = alvo === "escuro" ? Moon : Sun;
  const rotulo = `Mudar para o tema ${NOME_DO_TEMA[alvo]}`;

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
