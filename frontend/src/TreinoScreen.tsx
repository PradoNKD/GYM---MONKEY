import { Check, Hourglass, RotateCcw } from "lucide-react";
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
  acordando,
  podeTentarDeNovo,
  podeRecarregar,
  onRecarregar,
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
  /** O servidor esta acordando (cold start do plano free do Render). */
  acordando: boolean;
  /** O ultimo toque NAO valeu: oferece repetir sem risco de inverter. */
  podeTentarDeNovo: boolean;
  /** A leitura falhou e a tela esta sem dado: oferece buscar de novo. */
  podeRecarregar: boolean;
  onRecarregar: () => void;
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
      {/* PRIMEIRA coisa da tela, de proposito. Enquanto o servidor nao responde,
          a linha de status abaixo diz "Fora do treino" -- e isso e um chute: o
          app ainda nao falou com ninguem. Ler o aviso antes muda o sentido de
          tudo o que vem depois, de afirmacao para "ainda carregando". Embaixo
          da meta, como estava, a explicacao chegava tarde.

          O icone e uma ampulheta, nao um triangulo de alerta: o triangulo e o
          sinal universal de problema, e contradiria a decisao de nao tratar a
          espera como erro (mesma razao das cores neutras). */}
      {acordando && (
        <p className="aviso-acordando" role="status">
          <Hourglass size={14} />
          O servidor estava dormindo e esta acordando. Isso leva uns segundos na
          primeira vez do dia.
        </p>
      )}

      {/* Sem resumo a pilula nao aparece, em vez de cair no padrao "Fora do
          treino". Esse padrao e um chute: enquanto o servidor nao responde, pode
          haver um treino aberto, e a pilula estaria mentindo -- lado a lado com
          uma mensagem dizendo que o app nao conseguiu ler nada. Ficava visivel
          por meio segundo no carregamento normal, e por 30 no cold start.

          A condicao e "nao ha dado NENHUM", nao "a leitura falhou": se uma
          leitura anterior deu certo, o que esta na tela e fato -- so
          possivelmente velho -- e sumir com ele esconderia informacao boa. */}
      {resumo && (
        <p className={`status ${emAndamento ? "status--in" : "status--out"}`}>
          {emAndamento
            ? `Treino em andamento desde ${formatarHorario(emAndamento.startedAt)}`
            : "Fora do treino"}
        </p>
      )}

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

      {/* Repetir uma LEITURA e sempre seguro: buscar duas vezes nao muda nada no
          servidor. E por isso que este botao pode existir sem a prova que o
          "Tentar de novo" do toggle exige -- ali repetir uma escrita inverteria
          o treino, aqui o pior caso e uma requisicao a mais.

          Os dois nunca aparecem juntos: `podeTentarDeNovo` so e ligado quando a
          leitura de verificacao DEU certo, e `podeRecarregar` quando ela falhou. */}
      {podeRecarregar && (
        <div className="saida-de-erro">
          {/* Fica na tela durante a busca, desabilitado e com o rotulo trocado,
              em vez de desaparecer. Sumir tiraria a unica resposta ao toque
              justamente nos primeiros segundos, em que nada mais muda -- e daria
              a impressao de que o toque nao pegou. */}
          <button
            type="button"
            className="btn-mini"
            onClick={onRecarregar}
            disabled={carregando}
          >
            <RotateCcw size={14} />
            {carregando ? "Buscando..." : "Tentar de novo"}
          </button>
        </div>
      )}
      {sucesso && (
        <p className="aviso-sucesso" role="status">
          <Check size={14} />
          {sucesso}
        </p>
      )}

      {/* `podeRecarregar` desliga este botao porque, com a leitura falhada, o app
          NAO sabe se ha treino aberto -- e o rotulo mentiria. Sem resumo ele cai
          no padrao "Começar treino", mesmo que exista um treino em andamento no
          servidor, e o toque voltaria com "Você ja tem um treino em andamento".
          De quebra, sobra uma acao clara na tela em vez de dois botoes
          competindo pelo dedo. */}
      <button
        type="button"
        className={`btn ${emAndamento ? "btn--checkout" : "btn--checkin"}`}
        onClick={onAlternar}
        disabled={carregando || enviando || podeRecarregar}
      >
        {enviando ? "Registrando..." : emAndamento ? "Finalizar treino" : "Começar treino"}
      </button>

      {/* Aparece so quando ficou PROVADO que o toque nao valeu -- o servidor foi
          consultado e o estado nao mudou. Sem essa prova, oferecer "tentar de
          novo" convidaria a inverter um treino que ja tinha comecado. */}
      {podeTentarDeNovo && !enviando && (
        <button type="button" className="btn-mini" onClick={onAlternar}>
          <RotateCcw size={14} />
          Tentar de novo
        </button>
      )}

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
