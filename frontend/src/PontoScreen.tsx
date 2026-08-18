import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Dumbbell,
  Flame,
  LogOut,
  Pencil,
  Play,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { alternarPonto, ApiError, buscarHistorico, editarRegistro, excluirRegistro } from "./api";
import { useAuth } from "./AuthContext";
import type { Registro } from "./types";

interface Sessao {
  inicio: Registro;
  fim: Registro;
}

function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatarMinutos(totalMinutos: number): string {
  const horas = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;

  if (horas === 0) return `${minutosRestantes}min`;
  return `${horas}h ${minutosRestantes}min`;
}

function duracaoEmMinutos(inicioIso: string, fimIso: string): number {
  return Math.max(0, Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000));
}

function isoParaDatetimeLocal(iso: string): string {
  const data = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

function ordenarPorHorarioDesc(registros: Registro[]): Registro[] {
  return [...registros].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function calcularSessoesCompletas(historico: Registro[]): Sessao[] {
  const sessoes: Sessao[] = [];

  for (let i = 0; i < historico.length; i++) {
    const fim = historico[i];
    if (fim.type !== "CHECK_OUT") continue;

    const inicio = historico[i + 1];
    if (inicio?.type === "CHECK_IN") {
      sessoes.push({ inicio, fim });
    }
  }

  return sessoes;
}

function chaveDoDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

function calcularStreak(historico: Registro[]): number {
  const diasComRegistro = new Set(historico.map((registro) => chaveDoDia(new Date(registro.timestamp))));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!diasComRegistro.has(chaveDoDia(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (diasComRegistro.has(chaveDoDia(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function inicioDaSemana(): Date {
  const dia = new Date();
  dia.setHours(0, 0, 0, 0);
  const diaDaSemana = dia.getDay();
  const diasDesdeSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  dia.setDate(dia.getDate() - diasDesdeSegunda);
  return dia;
}

function calcularResumoSemanal(sessoes: Sessao[]): { treinos: number; minutos: number } {
  const inicio = inicioDaSemana();
  const sessoesDaSemana = sessoes.filter((sessao) => new Date(sessao.fim.timestamp) >= inicio);
  const minutos = sessoesDaSemana.reduce(
    (total, sessao) => total + duracaoEmMinutos(sessao.inicio.timestamp, sessao.fim.timestamp),
    0,
  );

  return { treinos: sessoesDaSemana.length, minutos };
}

export function PontoScreen() {
  const { token, user, logout } = useAuth();
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const ultimoRegistro = historico[0];
  const checkedIn = ultimoRegistro?.type === "CHECK_IN";

  const sessoesCompletas = useMemo(() => calcularSessoesCompletas(historico), [historico]);
  const duracaoPorRegistroId = useMemo(() => {
    const mapa = new Map<string, string>();
    sessoesCompletas.forEach(({ inicio, fim }) => {
      mapa.set(fim.id, formatarMinutos(duracaoEmMinutos(inicio.timestamp, fim.timestamp)));
    });
    return mapa;
  }, [sessoesCompletas]);

  const streak = useMemo(() => calcularStreak(historico), [historico]);
  const resumoSemanal = useMemo(() => calcularResumoSemanal(sessoesCompletas), [sessoesCompletas]);

  useEffect(() => {
    if (!token) return;

    buscarHistorico(token)
      .then(setHistorico)
      .catch((error) => {
        setErro(error instanceof ApiError ? error.message : "Nao foi possivel carregar o historico");
      })
      .finally(() => setCarregando(false));
  }, [token]);

  async function registrarPonto() {
    if (!token) return;
    setErro(null);
    setEnviando(true);

    try {
      const registro = await alternarPonto(token);
      setHistorico((historicoAtual) => [registro, ...historicoAtual]);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Nao foi possivel registrar o ponto");
    } finally {
      setEnviando(false);
    }
  }

  function iniciarEdicao(registro: Registro) {
    setErro(null);
    setEditandoId(registro.id);
    setValorEdicao(isoParaDatetimeLocal(registro.timestamp));
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(id: string) {
    if (!token || !valorEdicao) return;
    setSalvandoEdicao(true);
    setErro(null);

    try {
      const atualizado = await editarRegistro(token, id, new Date(valorEdicao).toISOString());
      setHistorico((atual) =>
        ordenarPorHorarioDesc(atual.map((registro) => (registro.id === id ? atualizado : registro))),
      );
      setEditandoId(null);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Nao foi possivel corrigir o registro");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirEntrada(id: string) {
    if (!token) return;
    if (!window.confirm("Excluir este registro do historico?")) return;

    setErro(null);
    try {
      await excluirRegistro(token, id);
      setHistorico((atual) => atual.filter((registro) => registro.id !== id));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Nao foi possivel excluir o registro");
    }
  }

  function renderLinhaRegistro(registro: Registro) {
    const emEdicao = editandoId === registro.id;

    if (emEdicao) {
      return (
        <li key={registro.id} className="linha-registro">
          <span className="historico-edicao">
            <input
              type="datetime-local"
              value={valorEdicao}
              onChange={(event) => setValorEdicao(event.target.value)}
              disabled={salvandoEdicao}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => salvarEdicao(registro.id)}
              disabled={salvandoEdicao}
              aria-label="Salvar correcao"
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={cancelarEdicao}
              disabled={salvandoEdicao}
              aria-label="Cancelar edicao"
            >
              <X size={16} />
            </button>
          </span>
        </li>
      );
    }

    const duracao = duracaoPorRegistroId.get(registro.id) ?? null;
    const Icone = registro.type === "CHECK_IN" ? Play : CheckCircle2;

    return (
      <Fragment key={registro.id}>
        <li className="linha-registro">
          <span className={`linha-tipo ${registro.type === "CHECK_IN" ? "tipo--in" : "tipo--out"}`}>
            <Icone size={16} />
            {registro.type === "CHECK_IN" ? "Início do treino" : "Fim do treino"}
          </span>
          <span className="historico-horario">{formatarHorario(registro.timestamp)}</span>
          <span className="historico-acoes">
            <button
              type="button"
              className="icon-btn"
              onClick={() => iniciarEdicao(registro)}
              aria-label="Corrigir registro"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--perigo"
              onClick={() => excluirEntrada(registro.id)}
              aria-label="Excluir registro"
            >
              <Trash2 size={14} />
            </button>
          </span>
        </li>
        {duracao && (
          <li className="linha-registro linha-duracao">
            <span className="linha-tipo">
              <Timer size={16} />
              Duração
            </span>
            <span className="historico-horario">{duracao}</span>
          </li>
        )}
      </Fragment>
    );
  }

  const sessaoAnterior = sessoesCompletas[0];

  return (
    <main className="card">
      <div className="card-header">
        <div className="brand">
          <img src="/icon-192.png" alt="" className="mascot" width={26} height={26} />
          <h1>GYM MONKEY</h1>
        </div>
        <button type="button" className="link-btn" onClick={logout}>
          <LogOut size={14} />
          Sair ({user?.name})
        </button>
      </div>

      <p className={`status ${checkedIn ? "status--in" : "status--out"}`}>
        {ultimoRegistro
          ? `${checkedIn ? "Treino em andamento" : "Fora do treino"} desde ${formatarHorario(ultimoRegistro.timestamp)}`
          : "Fora do treino"}
      </p>

      <div className="resumo-semanal">
        <div className="resumo-item">
          <Flame size={18} className="resumo-icone resumo-icone--streak" />
          <span className="resumo-valor">{streak}</span>
          <span className="resumo-label">{streak === 1 ? "dia seguido" : "dias seguidos"}</span>
        </div>
        <div className="resumo-item">
          <Dumbbell size={18} className="resumo-icone" />
          <span className="resumo-valor">{resumoSemanal.treinos}</span>
          <span className="resumo-label">{resumoSemanal.treinos === 1 ? "treino essa semana" : "treinos essa semana"}</span>
        </div>
        <div className="resumo-item">
          <Timer size={18} className="resumo-icone" />
          <span className="resumo-valor">{formatarMinutos(resumoSemanal.minutos)}</span>
          <span className="resumo-label">essa semana</span>
        </div>
      </div>

      {erro && <p className="auth-erro">{erro}</p>}

      <button
        type="button"
        className={`btn ${checkedIn ? "btn--checkout" : "btn--checkin"}`}
        onClick={registrarPonto}
        disabled={carregando || enviando}
      >
        {enviando ? "Registrando..." : checkedIn ? "Finalizar treino" : "Começar treino"}
      </button>

      {sessaoAnterior && (
        <section className="secao">
          <h2 className="secao-titulo">Treino Anterior</h2>
          <ul className="lista-registros">
            {renderLinhaRegistro(sessaoAnterior.fim)}
            {renderLinhaRegistro(sessaoAnterior.inicio)}
          </ul>
        </section>
      )}

      <section className="secao">
        <h2 className="secao-titulo">Histórico</h2>
        <ul className="lista-registros lista-registros--historico">
          {historico.map((registro) => renderLinhaRegistro(registro))}
        </ul>
      </section>
    </main>
  );
}
