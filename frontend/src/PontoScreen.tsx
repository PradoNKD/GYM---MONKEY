import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ListPlus,
  LogOut,
  Pencil,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  alterarMeta,
  alternarTreino,
  anotarSessao,
  ApiError,
  buscarSessoes,
  corrigirSessao,
} from "./api";
import { RegistroTreino, ResumoDoRegistro } from "./RegistroTreino";
import { BotaoTema } from "./BotaoTema";
import { MetaSemana } from "./MetaSemana";
import { useAuth } from "./AuthContext";
import {
  agruparSessoesPorDia,
  descricaoDaDuracao,
  formatarHorario,
  isoParaDatetimeLocal,
  mensagemDeSucesso,
  motivoDeNaoContar,
  rotuloDoDia,
  temFimConfiavel,
} from "./calculos";
import type { PaginaSessoes, RegistroTreinoEntrada, Sessao } from "./types";

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
  const [salvandoMeta, setSalvandoMeta] = useState(false);

  // Registro do treino (Fase A). `registrandoNovo` distingue o formulario que
  // abriu sozinho depois do check-out do que a pessoa abriu pelo historico:
  // so o primeiro merece destaque.
  const [registrandoId, setRegistrandoId] = useState<string | null>(null);
  const [registrandoNovo, setRegistrandoNovo] = useState(false);
  const [salvandoRegistro, setSalvandoRegistro] = useState(false);
  const [erroRegistro, setErroRegistro] = useState<string | null>(null);

  // Correcao em andamento (uma por vez).
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [fimEdicao, setFimEdicao] = useState("");
  const [motivoEdicao, setMotivoEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Erro da correcao fica separado do erro geral: ele aparece DENTRO do
  // formulario, junto dos campos. Antes ia pro topo do card, longe do lugar
  // onde a pessoa estava digitando -- em celular, muitas vezes fora da tela.
  const [erroCorrecao, setErroCorrecao] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

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

  // A confirmacao some sozinha: aviso de sucesso que fica pra sempre na tela
  // vira ruido e, pior, faz duvidar se e da acao de agora ou da anterior.
  useEffect(() => {
    if (!sucesso) return;
    const t = setTimeout(() => setSucesso(null), 6000);
    return () => clearTimeout(t);
  }, [sucesso]);

  const resumo = pagina?.resumo;
  const emAndamento = resumo?.emAndamento ?? null;
  const duracaoMinima = resumo?.regras.duracaoMinimaMin ?? 20;
  const limitesRegistro = resumo?.regras.registro ?? {
    tiposMax: 3,
    esforcoMin: 1,
    esforcoMax: 5,
    notaMax: 280,
  };
  const grupos = useMemo(
    () => agruparSessoesPorDia(pagina?.itens ?? []),
    [pagina?.itens],
  );

  async function alternar() {
    if (!token) return;
    setErro(null);
    setSucesso(null);
    setEnviando(true);

    try {
      const sessao = await alternarTreino(token);
      // Recarrega em vez de remendar o estado local: streak e resumo da semana
      // sao calculados no servidor, entao so ele sabe os numeros novos.
      await carregar();

      // Acabou de FINALIZAR um treino: abre o registro sozinho. E o momento de
      // maior intencao -- pedir depois, numa tela separada, e pedir para uma
      // pessoa que ja guardou o celular.
      if (sessao.endedAt) {
        setErroRegistro(null);
        setRegistrandoId(sessao.id);
        setRegistrandoNovo(true);
      }
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : "Nao foi possivel registrar o treino",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function trocarMeta(nova: number) {
    if (!token) return;
    setErro(null);
    setSalvandoMeta(true);

    try {
      await alterarMeta(token, nova);
      // Recarrega em vez de remendar: so o servidor sabe a partir de qual
      // semana a meta nova passa a valer.
      await carregar();
    } catch (error) {
      setErro(
        error instanceof ApiError ? error.message : "Nao foi possivel mudar a meta",
      );
    } finally {
      setSalvandoMeta(false);
    }
  }

  async function salvarRegistro(id: string, dados: RegistroTreinoEntrada) {
    if (!token) return;
    setErroRegistro(null);
    setSalvandoRegistro(true);

    try {
      await anotarSessao(token, id, dados);
      await carregar();
      setRegistrandoId(null);
      setRegistrandoNovo(false);
    } catch (error) {
      setErroRegistro(
        error instanceof ApiError ? error.message : "Nao foi possivel salvar o registro",
      );
    } finally {
      setSalvandoRegistro(false);
    }
  }

  function abrirRegistro(sessao: Sessao) {
    setErroRegistro(null);
    setEditandoId(null);
    setRegistrandoId(sessao.id);
    setRegistrandoNovo(false);
  }

  function fecharRegistro() {
    setRegistrandoId(null);
    setRegistrandoNovo(false);
    setErroRegistro(null);
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
    setErroCorrecao(null);
    setSucesso(null);
    setEditandoId(sessao.id);
    setFimEdicao(sessao.endedAt ? isoParaDatetimeLocal(sessao.endedAt) : "");
    setMotivoEdicao("");
  }

  async function salvarCorrecao(id: string) {
    if (!token || !fimEdicao || motivoEdicao.trim().length < 3) return;
    setSalvando(true);
    setErroCorrecao(null);
    setSucesso(null);

    try {
      const corrigida = await corrigirSessao(token, id, {
        endedAt: new Date(fimEdicao).toISOString(),
        reason: motivoEdicao.trim(),
      });

      // Recarrega ANTES de fechar o formulario: assim o "Salvando..." fica na
      // tela até os números novos chegarem, em vez de a lista velha aparecer
      // por um instante como se nada tivesse acontecido.
      await carregar();
      setEditandoId(null);
      setSucesso(mensagemDeSucesso(corrigida, duracaoMinima));
    } catch (error) {
      // O formulario FICA ABERTO com o que foi digitado: o erro quase sempre é
      // sobre o horário escolhido, e fechar obrigaria a redigitar tudo.
      setErroCorrecao(
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel corrigir o treino. Verifique a conexao e tente de novo.",
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
          Motivo da correcao (uma correcao por treino)
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
        {erroCorrecao && (
          <p className="sessao-edicao-erro" role="alert">
            <TriangleAlert size={13} />
            {erroCorrecao}
          </p>
        )}

        <span className="sessao-edicao-acoes">
          <button
            type="button"
            className="btn-mini btn-mini--ok"
            onClick={() => salvarCorrecao(sessao.id)}
            disabled={salvando || !fimEdicao || motivoEdicao.trim().length < 3}
            aria-label="Salvar correcao"
          >
            <Check size={14} />
            {salvando ? "Salvando..." : "Salvar"}
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
    const registrando = registrandoId === sessao.id;

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
        {/* Anotar e corrigir sao coisas diferentes, e a tela nao pode
            confundi-las: corrigir mexe no que CONTA e e auditado; anotar e
            rotulo, livre e ilimitado. Por isso dois botoes, nao um menu. */}
        {sessao.status !== "OPEN" && !registrando && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => abrirRegistro(sessao)}
            aria-label="Registrar o treino"
          >
            <ListPlus size={14} />
          </button>
        )}
        {sessao.corrigivel && !registrando && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => iniciarCorrecao(sessao)}
            aria-label="Corrigir treino"
          >
            <Pencil size={14} />
          </button>
        )}
        {registrando && (
          <RegistroTreino
            sessao={sessao}
            limites={limitesRegistro}
            salvando={salvandoRegistro}
            erro={erroRegistro}
            destacado={registrandoNovo}
            onSalvar={(dados) => salvarRegistro(sessao.id, dados)}
            onCancelar={fecharRegistro}
          />
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

      <MetaSemana
        meta={resumo?.meta}
        recordeDiario={resumo?.recordeDiario ?? 0}
        minutosNaSemana={resumo?.semana.minutos ?? 0}
        onAlterarMeta={trocarMeta}
        salvandoMeta={salvandoMeta}
      />

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
