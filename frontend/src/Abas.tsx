import { CalendarDays, Dumbbell, User } from "lucide-react";
import { ABAS, TITULO_DA_ABA, type Aba } from "./rota";

/**
 * Barra de abas no rodape.
 *
 * **Embaixo, nao em cima**: em celular o polegar alcanca o rodape sem trocar a
 * mao de posicao, e a tela Treino tem um botao grande que e a acao principal --
 * abas no topo competiriam com o cabecalho.
 *
 * A aba ativa e marcada por `aria-current="page"`, nao so por cor: quem usa
 * leitor de tela ou nao distingue as cores precisa saber onde esta.
 */

const ICONE_DA_ABA = {
  treino: Dumbbell,
  historico: CalendarDays,
  perfil: User,
} as const satisfies Record<Aba, unknown>;

export function Abas({
  ativa,
  onTrocar,
}: {
  ativa: Aba;
  onTrocar: (aba: Aba) => void;
}) {
  return (
    <nav className="abas" aria-label="Navegacao principal">
      {ABAS.map((aba) => {
        const Icone = ICONE_DA_ABA[aba];
        const ehAtiva = aba === ativa;

        return (
          <button
            key={aba}
            type="button"
            className={`aba ${ehAtiva ? "aba--ativa" : ""}`}
            onClick={() => onTrocar(aba)}
            aria-current={ehAtiva ? "page" : undefined}
          >
            <Icone size={20} aria-hidden="true" />
            <span className="aba-titulo">{TITULO_DA_ABA[aba]}</span>
          </button>
        );
      })}
    </nav>
  );
}
