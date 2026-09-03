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
import { TreinoScreen } from "./TreinoScreen";
import { PerfilScreen } from "./PerfilScreen";
import { useAuth } from "./AuthContext";
import { useAba } from "./rota";
import {
  agruparSessoesPorDia,
  isoParaDatetimeLocal,
  mensagemDeFalhaNaLeitura,
  mensagemDeSucesso,
  toggleFoiAplicado,
} from "./calculos";
import { AVISO_DEMORA_MS, comRetentativa, ehRetentavel } from "./rede";
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
 * muda os numeros que a aba Treino mostra. As abas em si sao de apresentacao.
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
  // primeiro aparece na aba Treino, o segundo dentro da linha da lista.
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
  // O backend dorme no plano free do Render e leva 30 a 60s para acordar. Sem
  // dizer isso, um "Carregando..." de um minuto parece app travado.
  const [acordando, setAcordando] = useState(false);
  // Guarda que o ultimo toque no botao de treino nao chegou a valer, para
  // oferecer "tentar de novo" em vez de so mostrar um erro e deixar a pessoa
  // sem saber se o treino comecou.
  const [toqueNaoAplicado, setToqueNaoAplicado] = useState(false);
  // A leitura falhou e a tela ficou sem dado nenhum. Guardado separado do texto
  // do erro porque o que importa e habilitar uma SAIDA: sem isso a unica opcao
  // era recarregar a pagina na mao, o que ninguem descobre sozinho.
  const [falhaAoCarregar, setFalhaAoCarregar] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    let avisoDeDemora: ReturnType<typeof setTimeout> | undefined;

    // O veredito da tentativa ANTERIOR sai da tela antes de a nova comecar.
    // Sem isto, tocar em "tentar de novo" deixava "o servidor nao respondeu a
    // tempo" no ar junto do aviso de que ele estava acordando -- duas frases que
    // se contradizem, e a segunda tentativa parecia nao ter acontecido.
    setErro(null);
    // E marcar que ha busca em curso: e o que da resposta imediata ao toque e o
    // que impede um segundo toque disparar duas buscas ao mesmo tempo.
    setCarregando(true);

    try {
      // Leitura pode ser repetida a vontade: repetir um GET nao muda nada no
      // servidor. E o que faz o cold start do Render deixar de ser um erro na
      // cara da pessoa e virar uma espera explicada.
      const [proxima, novoMapa] = await comRetentativa(
        () => Promise.all([buscarSessoes(token), buscarMapa(token)]),
        {
          aoDemorar: () => {
            // Espera antes de avisar: numa rede boa a segunda tentativa resolve
            // em milissegundos, e piscar "acordando o servidor" nesse caso
            // assusta sem motivo.
            avisoDeDemora = setTimeout(() => setAcordando(true), AVISO_DEMORA_MS);
          },
        },
      );

      setPagina(proxima);
      setMapa(novoMapa);
      // Deu certo: limpa o estrago da tentativa anterior. Sem isto o erro de uma
      // falha antiga ficaria na tela junto dos dados novos, contradizendo eles.
      setErro(null);
      setFalhaAoCarregar(false);
      if (proxima.resumo.conquistas.novas.length > 0) setFestaFechada(false);
      return proxima;
    } catch (error) {
      setErro(mensagemDeFalhaNaLeitura(error, navigator.onLine !== false));
      setFalhaAoCarregar(true);
    } finally {
      clearTimeout(avisoDeDemora);
      setAcordando(false);
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

  // A sessao recem-finalizada, para o registro que abre sozinho na aba Treino.
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
    setToqueNaoAplicado(false);
    setEnviando(true);

    // Guardado ANTES da chamada: se ela falhar sem dizer onde, este e o unico
    // jeito de descobrir se o toque valeu -- comparando com o que o servidor
    // disser depois.
    const haviaTreinoAberto = (resumo?.emAndamento ?? null) !== null;

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
      // A escrita falhou, e NAO se sabe onde: pode nao ter saido do celular, ou
      // pode ter sido processada e a resposta ter se perdido. Repetir seria
      // perigoso -- inverteria o estado no segundo caso, finalizando o treino
      // que acabou de abrir. Entao a gente PERGUNTA como ficou.
      const paginaAtual = await carregar();

      if (paginaAtual === undefined) {
        // Nem a verificacao passou: sem saber como ficou, a unica coisa honesta
        // e dizer isso. O botao de tentar de novo ja esta na tela, ligado por
        // `falhaAoCarregar` dentro do `carregar` -- e ele repete a LEITURA, que
        // e exatamente o que falta aqui: descobrir como o treino ficou.
        setErro(
          "Nao deu para falar com o servidor, e o app nao sabe se o treino mudou. Toque em tentar de novo para ver como ficou.",
        );
        setEnviando(false);
        return;
      }

      const aplicado = toggleFoiAplicado(
        haviaTreinoAberto,
        (paginaAtual.resumo.emAndamento ?? null) !== null,
      );

      if (aplicado) {
        // Valeu, apesar do erro. Mostrar erro aqui seria mentir sobre o que
        // aconteceu, e faria a pessoa tocar de novo -- desfazendo.
        setErro(null);
        setSucesso(
          paginaAtual.resumo.emAndamento
            ? "Treino iniciado."
            : "Treino finalizado.",
        );
      } else {
        // O convite de tentar de novo so cabe quando repetir tem chance de
        // mudar o resultado: nao houve resposta, ou o proxy ainda estava
        // subindo a aplicacao. Num veredito pensado do servidor ("aguarde 12
        // min para iniciar outro treino") o botao mentiria -- prometeria
        // resolver e devolveria a mesma recusa. E a mesma regra do retry
        // automatico, reusada de proposito: a pergunta e identica.
        setToqueNaoAplicado(ehRetentavel(error));
        setErro(
          error instanceof ApiError
            ? error.message
            : "Nao deu para registrar agora. O treino NAO foi alterado.",
        );
      }
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

      {aba === "treino" && (
        <TreinoScreen
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
          acordando={acordando}
          podeTentarDeNovo={toqueNaoAplicado}
          podeRecarregar={falhaAoCarregar}
          onRecarregar={() => void carregar()}
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
