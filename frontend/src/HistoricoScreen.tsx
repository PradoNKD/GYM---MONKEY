import { Check, ListPlus, Pencil, TriangleAlert, X } from "lucide-react";
import { Dica } from "./Dica";
import { MapaDoAno } from "./MapaDoAno";
import { RegistroTreino, ResumoDoRegistro } from "./RegistroTreino";
import {
  descricaoDaDuracao,
  formatarHorario,
  motivoDeNaoContar,
  rotuloDoDia,
  temFimConfiavel,
  type GrupoDeSessoes,
} from "./calculos";
import type { LimitesDoRegistro } from "./rotulos";
import type {
  MapaDoAno as Mapa,
  RegistroTreinoEntrada,
  Sessao,
} from "./types";

/**
 * Aba **Historico**: a tela de consulta.
 *
 * A lista de treinos por dia, o mapa do ano e as duas acoes que agem sobre um
 * treino passado -- anotar e corrigir. Elas continuam sendo **dois botoes
 * separados**, nao um menu: corrigir mexe no que CONTA e e auditado; anotar e
 * rotulo, livre e ilimitado.
 */

interface Correcao {
  editandoId: string | null;
  fim: string;
  motivo: string;
  salvando: boolean;
  erro: string | null;
  onIniciar: (sessao: Sessao) => void;
  onMudarFim: (valor: string) => void;
  onMudarMotivo: (valor: string) => void;
  onSalvar: (id: string) => void;
  onCancelar: () => void;
}

interface Registro {
  /** Sessao com o formulario de anotacao aberto, se houver. */
  abertoId: string | null;
  limites: LimitesDoRegistro;
  salvando: boolean;
  erro: string | null;
  onAbrir: (sessao: Sessao) => void;
  onSalvar: (id: string, dados: RegistroTreinoEntrada) => void;
  onCancelar: () => void;
}

export function HistoricoScreen({
  grupos,
  mapa,
  carregando,
  duracaoMinima,
  proximoCursor,
  carregandoMais,
  onCarregarMais,
  erro,
  sucesso,
  correcao,
  registro,
}: {
  grupos: GrupoDeSessoes[];
  mapa: Mapa | null;
  carregando: boolean;
  duracaoMinima: number;
  proximoCursor: string | null;
  carregandoMais: boolean;
  onCarregarMais: () => void;
  erro: string | null;
  sucesso: string | null;
  correcao: Correcao;
  registro: Registro;
}) {
  function renderCorrecao(sessao: Sessao) {
    return (
      <li key={sessao.id} className="linha-registro sessao-edicao">
        <label className="sessao-campo">
          Fim do treino
          <input
            type="datetime-local"
            value={correcao.fim}
            onChange={(e) => correcao.onMudarFim(e.target.value)}
            disabled={correcao.salvando}
          />
        </label>
        <label className="sessao-campo">
          Motivo da correcao (uma correcao por treino)
          <input
            type="text"
            placeholder="Ex.: esqueci de finalizar"
            value={correcao.motivo}
            onChange={(e) => correcao.onMudarMotivo(e.target.value)}
            minLength={3}
            maxLength={200}
            disabled={correcao.salvando}
          />
        </label>
        {correcao.erro && (
          <p className="sessao-edicao-erro" role="alert">
            <TriangleAlert size={13} />
            {correcao.erro}
          </p>
        )}

        <span className="sessao-edicao-acoes">
          <button
            type="button"
            className="btn-mini btn-mini--ok"
            onClick={() => correcao.onSalvar(sessao.id)}
            disabled={
              correcao.salvando ||
              !correcao.fim ||
              correcao.motivo.trim().length < 3
            }
            aria-label="Salvar correcao"
          >
            <Check size={14} />
            {correcao.salvando ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={correcao.onCancelar}
            disabled={correcao.salvando}
            aria-label="Cancelar correcao"
          >
            <X size={16} />
          </button>
        </span>
      </li>
    );
  }

  function renderSessao(sessao: Sessao) {
    if (correcao.editandoId === sessao.id) return renderCorrecao(sessao);

    const aviso = motivoDeNaoContar(sessao, duracaoMinima);
    const registrando = registro.abertoId === sessao.id;

    return (
      <li
        key={sessao.id}
        className={`linha-registro linha-sessao ${sessao.contavel ? "" : "linha-sessao--nao-conta"} ${registrando ? "linha-sessao--registrando" : ""}`}
      >
        <span className="sessao-info">
          <span className="sessao-horas">
            {formatarHorario(sessao.startedAt)}
            {temFimConfiavel(sessao) ? ` - ${formatarHorario(sessao.endedAt!)}` : ""}
          </span>
          {aviso && (
            <span className="sessao-aviso">
              <TriangleAlert size={12} />
              {aviso}
            </span>
          )}
          {!registrando && <ResumoDoRegistro sessao={sessao} />}
        </span>
        <span className="sessao-duracao">{descricaoDaDuracao(sessao)}</span>
        {sessao.status !== "OPEN" && !registrando && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => registro.onAbrir(sessao)}
            aria-label="Registrar o treino"
          >
            <ListPlus size={14} />
          </button>
        )}
        {sessao.corrigivel && !registrando && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => correcao.onIniciar(sessao)}
            aria-label="Corrigir treino"
          >
            <Pencil size={14} />
          </button>
        )}
        {registrando && (
          <RegistroTreino
            sessao={sessao}
            limites={registro.limites}
            salvando={registro.salvando}
            erro={registro.erro}
            onSalvar={(dados) => registro.onSalvar(sessao.id, dados)}
            onCancelar={registro.onCancelar}
          />
        )}
      </li>
    );
  }

  return (
    <>
      <MapaDoAno mapa={mapa} />

      {erro && <p className="auth-erro">{erro}</p>}
      {sucesso && (
        <p className="aviso-sucesso" role="status">
          <Check size={14} />
          {sucesso}
        </p>
      )}

      <section className="secao">
        <h2 className="secao-titulo">
          Histórico
          <Dica
            rotulo="O que fazem os botoes de cada treino?"
            texto="A lista tem dois botoes por treino. O de lista (+) ANOTA: tipo de treino, esforco e observacao, livre e quantas vezes quiser, sem mexer no que conta. O lapis CORRIGE o horario: so o horario de FIM, uma vez por treino, e no maximo 1h a mais do que foi marcado -- porque corrigir mexe no que conta na semana, e fica registrado com o motivo."
          />
        </h2>

        {carregando && <p className="admin-vazio">Carregando...</p>}
        {/* A instrucao aponta pra aba Treino: o botao de comecar nao esta
            mais nesta tela, e mandar "toque em Começar treino" sem dizer onde
            e mandar procurar. */}
        {!carregando && grupos.length === 0 && (
          <p className="admin-vazio">
            Nenhum treino ainda. Comece o primeiro na aba Treino.
          </p>
        )}

        <div className="lista-registros--historico">
          {grupos.map((grupo) => (
            <div key={grupo.chave} className="grupo-dia">
              <h3 className="grupo-dia-titulo">{rotuloDoDia(grupo.data)}</h3>
              <ul className="lista-registros">
                {grupo.sessoes.map((sessao) => renderSessao(sessao))}
              </ul>
            </div>
          ))}
        </div>

        {proximoCursor && (
          <button
            type="button"
            className="btn-mini"
            onClick={onCarregarMais}
            disabled={carregandoMais}
          >
            {carregandoMais ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </section>
    </>
  );
}
