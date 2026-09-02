import { useCallback, useEffect, useMemo, useState } from "react";
import {
  alterarMeta,
  alternarTreino,
  anotarSessao,
  ApiError,
  buscarMapa,
  buscarSessoes,
  corrigirSessao,
  marcarConquistasVistas,
} from "./api";
import { Abas } from "./Abas";
import { BotaoTema } from "./BotaoTema";
import { HistoricoScreen } from "./HistoricoScreen";
import { HojeScreen } from "./HojeScreen";
import { PerfilScreen } from "./PerfilScreen";
import { useAuth } from "./AuthContext";
import { useAba } from "./rota";
import {
  agruparSessoesPorDia,
  isoParaDatetimeLocal,
  mensagemDeSucesso,
} from "./calculos";
import type {
  MapaDoAno as Mapa,
  PaginaSessoes,
  RegistroTreinoEntrada,
  Sessao,
} from "./types";

/**
 * Container das tres abas.
 *
 * O estado dos dados vive **aqui**, nao em cada aba, por dois motivos: trocar
 * de aba nao pode refazer as requisicoes (o servidor calcula streak, semana e
 * conquistas, e refazer isso a cada toque seria caro e piscaria a tela), e
 * varias acoes tem efeito em mais de uma aba -- corrigir um treino no Historico
 * muda os numeros que a aba Hoje mostra. As abas em si sao de apresentacao.
 */
export function PontoScreen({ onOpenAdmin }: { onOpenAdmin?: () => void }) {
  const { token, user, logout } = useAuth();
  const { aba, irPara } = useAba();
  const [pagina, setPagina] = useState<PaginaSessoes | null>(null);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  // A festa vive so na tela: o servidor ja sabe o que foi conquistado, e o que
  // esta em jogo aqui e apenas se a comemoracao continua visivel.
  const [festaFechada, setFestaFechada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [salvandoMeta, setSalvandoMeta] = useState(false);

  // Registro do treino (Fase A). `registrandoNovo` distingue o formulario que
  // abriu sozinho depois do check-out do que a pessoa abriu pelo historico: o
  // primeiro aparece na aba Hoje, o segundo dentro da linha da lista.
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
      // Numa ida so: o mapa muda exatamente quando o historico muda.
      const [proxima, novoMapa] = await Promise.all([
        buscarSessoes(token),
        buscarMapa(token),
      ]);
      setPagina(proxima);
      setMapa(novoMapa);
      if (proxima.resumo.conquistas.novas.length > 0) setFestaFechada(false);
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

  // A barra de abas e fixa no rodape, entao o conteudo precisa de espaco embaixo
  // pra ultima linha nao ficar atras dela. Mesma ideia da dica de instalacao.
  useEffect(() => {
    document.body.classList.add("com-abas");
    return () => document.body.classList.remove("com-abas");
  }, []);

  const resumo = pagina?.resumo;
  const duracaoMinima = resumo?.regras.duracaoMinimaMin ?? 20;
  const conquistas = resumo?.conquistas;
  const novasConquistas = festaFechada ? [] : (conquistas?.novas ?? []);
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

  // A sessao recem-finalizada, para o registro que abre sozinho na aba Hoje.
  const sessaoRecemFinalizada = useMemo(
    () =>
      registrandoNovo && registrandoId
        ? (pagina?.itens.find((s) => s.id === registrandoId) ?? null)
        : null,
    [registrandoNovo, registrandoId, pagina?.itens],
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

  async function fecharFesta() {
    setFestaFechada(true);
    if (!token) return;

    try {
      await marcarConquistasVistas(token);
    } catch {
      // Se falhar, a festa reaparece na proxima visita. E o erro certo a
      // cometer: comemorar duas vezes incomoda menos que nunca comemorar.
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
      </div>

      {aba === "hoje" && (
        <HojeScreen
          resumo={resumo}
          carregando={carregando}
          enviando={enviando}
          onAlternar={alternar}
          onAlterarMeta={trocarMeta}
          salvandoMeta={salvandoMeta}
          novasConquistas={novasConquistas}
          onFecharFesta={fecharFesta}
          erro={erro}
          sucesso={sucesso}
          registro={
            sessaoRecemFinalizada
              ? {
                  sessao: sessaoRecemFinalizada,
                  limites: limitesRegistro,
                  salvando: salvandoRegistro,
                  erro: erroRegistro,
                  onSalvar: (dados) =>
                    salvarRegistro(sessaoRecemFinalizada.id, dados),
                  onCancelar: fecharRegistro,
                }
              : null
          }
        />
      )}

      {aba === "historico" && (
        <HistoricoScreen
          grupos={grupos}
          mapa={mapa}
          carregando={carregando}
          duracaoMinima={duracaoMinima}
          proximoCursor={pagina?.proximoCursor ?? null}
          carregandoMais={carregandoMais}
          onCarregarMais={carregarMais}
          erro={erro}
          sucesso={sucesso}
          correcao={{
            editandoId,
            fim: fimEdicao,
            motivo: motivoEdicao,
            salvando,
            erro: erroCorrecao,
            onIniciar: iniciarCorrecao,
            onMudarFim: setFimEdicao,
            onMudarMotivo: setMotivoEdicao,
            onSalvar: salvarCorrecao,
            onCancelar: () => setEditandoId(null),
          }}
          registro={{
            abertoId: registrandoNovo ? null : registrandoId,
            limites: limitesRegistro,
            salvando: salvandoRegistro,
            erro: erroRegistro,
            onAbrir: abrirRegistro,
            onSalvar: salvarRegistro,
            onCancelar: fecharRegistro,
          }}
        />
      )}

      {aba === "perfil" && (
        <PerfilScreen user={user} onOpenAdmin={onOpenAdmin} onLogout={logout} />
      )}

      <Abas ativa={aba} onTrocar={irPara} />
    </main>
  );
}
