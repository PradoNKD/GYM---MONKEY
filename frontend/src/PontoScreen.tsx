import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Dumbbell,
  Flame,
  LogOut,
  Pencil,
  ShieldCheck,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { alternarTreino, ApiError, buscarSessoes, corrigirSessao } from "./api";
import { BotaoTema } from "./BotaoTema";
import { useAuth } from "./AuthContext";
import {
  agruparSessoesPorDia,
  descricaoDaDuracao,
  formatarHorario,
  formatarMinutos,
  isoParaDatetimeLocal,
  motivoDeNaoContar,
  rotuloDoDia,
  temFimConfiavel,
} from "./calculos";
import type { PaginaSessoes, Sessao } from "./types";

/** So o primeiro nome: o header do celular nao tem largura pra "Sair (Nome Sobrenome)". */
function primeiroNome(nome: string | undefined): string {
  return nome?.trim().split(/\s+/)[0] ?? "";
}

export function PontoScreen({ onOpenAdmin }: { onOpenAdmin?: () => void }) {
  const { token, user, logout } = useAuth();
  const [pagina, setPagina] = useState<PaginaSessoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  // Correcao em andamento (uma por vez).
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [fimEdicao, setFimEdicao] = useState("");
  const [motivoEdicao, setMotivoEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      setPagina(await buscarSessoes(token));
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : "Nao foi possivel carregar o historico",
      );
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumo = pagina?.resumo;
  const emAndamento = resumo?.emAndamento ?? null;
  const duracaoMinima = resumo?.regras.duracaoMinimaMin ?? 20;
  const grupos = useMemo(
    () => agruparSessoesPorDia(pagina?.itens ?? []),
    [pagina?.itens],
  );

  async function alternar() {
    if (!token) return;
    setErro(null);
    setEnviando(true);

    try {
      await alternarTreino(token);
      // Recarrega em vez de remendar o estado local: streak e resumo da semana
      // sao calculados no servidor, entao so ele sabe os numeros novos.
      await carregar();
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : "Nao foi possivel registrar o treino",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function carregarMais() {
    if (!token || !pagina?.proximoCursor) return;
    setCarregandoMais(true);

    try {
      const proxima = await buscarSessoes(token, { cursor: pagina.proximoCursor });
      setPagina({
        ...proxima,
        itens: [...pagina.itens, ...proxima.itens],
      });
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : "Nao foi possivel carregar mais treinos",
      );
    } finally {
      setCarregandoMais(false);
    }
  }

  function iniciarCorrecao(sessao: Sessao) {
    setErro(null);
    setEditandoId(sessao.id);
    setFimEdicao(sessao.endedAt ? isoParaDatetimeLocal(sessao.endedAt) : "");
    setMotivoEdicao("");
  }

  async function salvarCorrecao(id: string) {
    if (!token || !fimEdicao || motivoEdicao.trim().length < 3) return;
    setSalvando(true);
    setErro(null);

    try {
      await corrigirSessao(token, id, {
        endedAt: new Date(fimEdicao).toISOString(),
        reason: motivoEdicao.trim(),
      });
      setEditandoId(null);
      await carregar();
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : "Nao foi possivel corrigir o treino",
      );
    } finally {
      setSalvando(false);
    }
  }

  function renderCorrecao(sessao: Sessao) {
    return (
      <li key={sessao.id} className="linha-registro sessao-edicao">
        <label className="sessao-campo">
          Fim do treino
          <input
            type="datetime-local"
            value={fimEdicao}
            onChange={(e) => setFimEdicao(e.target.value)}
            disabled={salvando}
          />
        </label>
        <label className="sessao-campo">
          Motivo da correcao
          <input
            type="text"
            placeholder="Ex.: esqueci de finalizar"
            value={motivoEdicao}
            onChange={(e) => setMotivoEdicao(e.target.value)}
            minLength={3}
            maxLength={200}
            disabled={salvando}
          />
        </label>
        <span className="sessao-edicao-acoes">
          <button
            type="button"
            className="icon-btn"
            onClick={() => salvarCorrecao(sessao.id)}
            disabled={salvando || !fimEdicao || motivoEdicao.trim().length < 3}
            aria-label="Salvar correcao"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setEditandoId(null)}
            disabled={salvando}
            aria-label="Cancelar correcao"
          >
            <X size={16} />
          </button>
        </span>
      </li>
    );
  }

  function renderSessao(sessao: Sessao) {
    if (editandoId === sessao.id) return renderCorrecao(sessao);

    const aviso = motivoDeNaoContar(sessao, duracaoMinima);
    const podeCorrigir = sessao.status !== "OPEN";

    return (
      <li
        key={sessao.id}
        className={`linha-registro linha-sessao ${sessao.contavel ? "" : "linha-sessao--nao-conta"}`}
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
        </span>
        <span className="sessao-duracao">{descricaoDaDuracao(sessao)}</span>
        {podeCorrigir && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => iniciarCorrecao(sessao)}
            aria-label="Corrigir treino"
          >
            <Pencil size={14} />
          </button>
        )}
      </li>
    );
  }

  return (
    <main className="card">
      <div className="card-header">
        <div className="brand">
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="mascot"
            width={26}
            height={26}
          />
          <h1>GYM MONKEY</h1>
          <BotaoTema />
        </div>
        <div className="card-header-acoes">
          {onOpenAdmin && (
            <button type="button" className="link-btn" onClick={onOpenAdmin}>
              <ShieldCheck size={14} />
              Painel
            </button>
          )}
          <button type="button" className="link-btn" onClick={logout}>
            <LogOut size={14} />
            Sair ({primeiroNome(user?.name)})
          </button>
        </div>
      </div>

      <p className={`status ${emAndamento ? "status--in" : "status--out"}`}>
        {emAndamento
          ? `Treino em andamento desde ${formatarHorario(emAndamento.startedAt)}`
          : "Fora do treino"}
      </p>

      <div className="resumo-semanal">
        <div className="resumo-item">
          <Flame size={18} className="resumo-icone resumo-icone--streak" />
          <span className="resumo-valor">{resumo?.streak ?? 0}</span>
          <span className="resumo-label">
            {resumo?.streak === 1 ? "dia seguido" : "dias seguidos"}
          </span>
        </div>
        <div className="resumo-item">
          <Dumbbell size={18} className="resumo-icone" />
          <span className="resumo-valor">{resumo?.semana.treinos ?? 0}</span>
          <span className="resumo-label">
            {resumo?.semana.treinos === 1 ? "treino essa semana" : "treinos essa semana"}
          </span>
        </div>
        <div className="resumo-item">
          <Timer size={18} className="resumo-icone" />
          <span className="resumo-valor">{formatarMinutos(resumo?.semana.minutos ?? 0)}</span>
          <span className="resumo-label">essa semana</span>
        </div>
      </div>

      {erro && <p className="auth-erro">{erro}</p>}

      <button
        type="button"
        className={`btn ${emAndamento ? "btn--checkout" : "btn--checkin"}`}
        onClick={alternar}
        disabled={carregando || enviando}
      >
        {enviando ? "Registrando..." : emAndamento ? "Finalizar treino" : "Começar treino"}
      </button>

      <section className="secao">
        <h2 className="secao-titulo">Histórico</h2>

        {carregando && <p className="admin-vazio">Carregando...</p>}
        {!carregando && grupos.length === 0 && (
          <p className="admin-vazio">
            Nenhum treino ainda. Toque em "Começar treino" para registrar o primeiro.
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

        {pagina?.proximoCursor && (
          <button
            type="button"
            className="btn-mini"
            onClick={carregarMais}
            disabled={carregandoMais}
          >
            {carregandoMais ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </section>
    </main>
  );
}
