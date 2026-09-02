import { Check } from "lucide-react";
import {
  ConviteDeRecomeco,
  FestaDeConquistas,
  ResumoConquistas,
} from "./Conquistas";
import { MetaSemana } from "./MetaSemana";
import { RegistroTreino } from "./RegistroTreino";
import { formatarHorario } from "./calculos";
import type { LimitesDoRegistro } from "./rotulos";
import type {
  ConquistaNova,
  RegistroTreinoEntrada,
  ResumoSessoes,
  Sessao,
} from "./types";

/**
 * Aba **Treino**: a tela de acao.
 *
 * Fica so o que responde "e agora?": se ha treino em andamento, o botao que
 * comeca ou finaliza, os numeros da semana e as comemoracoes. Consulta do
 * passado -- lista de treinos e mapa do ano -- mora na aba Historico.
 *
 * **O registro do treino recem-finalizado abre AQUI**, e nao na lista. Antes da
 * separacao em abas ele abria dentro do historico, que era a mesma tela; com
 * abas, abrir na lista significaria abrir numa tela que a pessoa nao esta
 * olhando. O momento seguinte ao check-out e o de maior intencao -- e o unico
 * momento em que vale pedir.
 */
export function TreinoScreen({
  resumo,
  carregando,
  enviando,
  onAlternar,
  onAlterarMeta,
  salvandoMeta,
  novasConquistas,
  onFecharFesta,
  erro,
  sucesso,
  registro,
}: {
  resumo: ResumoSessoes | undefined;
  carregando: boolean;
  enviando: boolean;
  onAlternar: () => void;
  onAlterarMeta: (meta: number) => void;
  salvandoMeta: boolean;
  novasConquistas: ConquistaNova[];
  onFecharFesta: () => void;
  erro: string | null;
  sucesso: string | null;
  /** Presente so no instante seguinte ao check-out. */
  registro: {
    sessao: Sessao;
    limites: LimitesDoRegistro;
    salvando: boolean;
    erro: string | null;
    onSalvar: (dados: RegistroTreinoEntrada) => void;
    onCancelar: () => void;
  } | null;
}) {
  const emAndamento = resumo?.emAndamento ?? null;
  const conquistas = resumo?.conquistas;

  return (
    <>
      <p className={`status ${emAndamento ? "status--in" : "status--out"}`}>
        {emAndamento
          ? `Treino em andamento desde ${formatarHorario(emAndamento.startedAt)}`
          : "Fora do treino"}
      </p>

      <MetaSemana
        meta={resumo?.meta}
        recordeDiario={resumo?.recordeDiario ?? 0}
        minutosNaSemana={resumo?.semana.minutos ?? 0}
        onAlterarMeta={onAlterarMeta}
        salvandoMeta={salvandoMeta}
      />

      <ConviteDeRecomeco tipo={resumo?.freshStart ?? null} />

      <FestaDeConquistas novas={novasConquistas} onFechar={onFecharFesta} />

      {conquistas && <ResumoConquistas conquistas={conquistas} />}

      {erro && <p className="auth-erro">{erro}</p>}
      {sucesso && (
        <p className="aviso-sucesso" role="status">
          <Check size={14} />
          {sucesso}
        </p>
      )}

      <button
        type="button"
        className={`btn ${emAndamento ? "btn--checkout" : "btn--checkin"}`}
        onClick={onAlternar}
        disabled={carregando || enviando}
      >
        {enviando ? "Registrando..." : emAndamento ? "Finalizar treino" : "Começar treino"}
      </button>

      {registro && (
        <RegistroTreino
          sessao={registro.sessao}
          limites={registro.limites}
          salvando={registro.salvando}
          erro={registro.erro}
          destacado
          onSalvar={registro.onSalvar}
          onCancelar={registro.onCancelar}
        />
      )}
    </>
  );
}
