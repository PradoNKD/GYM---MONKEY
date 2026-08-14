import { useEffect, useState } from "react";
import { alternarPonto, ApiError, buscarHistorico, editarRegistro, excluirRegistro } from "./api";
import { useAuth } from "./AuthContext";
import type { Registro } from "./types";

function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatarDuracao(inicioIso: string, fimIso: string): string {
  const minutos = Math.max(
    0,
    Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000),
  );
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  if (horas === 0) return `${minutosRestantes}min`;
  return `${horas}h ${minutosRestantes}min`;
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

  return (
    <main className="card">
      <div className="card-header">
        <div className="brand">
          <img src="/icon-192.png" alt="" className="mascot" width={26} height={26} />
          <h1>GYN MONKEY</h1>
        </div>
        <button type="button" className="link-btn" onClick={logout}>
          Sair ({user?.name})
        </button>
      </div>

      <p className={`status ${checkedIn ? "status--in" : "status--out"}`}>
        {ultimoRegistro
          ? `${checkedIn ? "Treino em andamento" : "Fora do treino"} desde ${formatarHorario(ultimoRegistro.timestamp)}`
          : "Fora do treino"}
      </p>

      {erro && <p className="auth-erro">{erro}</p>}

      <button
        type="button"
        className={`btn ${checkedIn ? "btn--checkout" : "btn--checkin"}`}
        onClick={registrarPonto}
        disabled={carregando || enviando}
      >
        {enviando ? "Registrando..." : checkedIn ? "Finalizar treino" : "Começar treino"}
      </button>

      <ul className="historico">
        {historico.map((registro, index) => {
          const checkInCorrespondente =
            registro.type === "CHECK_OUT" ? historico[index + 1] : undefined;
          const duracao =
            checkInCorrespondente?.type === "CHECK_IN"
              ? formatarDuracao(checkInCorrespondente.timestamp, registro.timestamp)
              : null;

          const emEdicao = editandoId === registro.id;

          return (
            <li key={registro.id}>
              <span className={registro.type === "CHECK_IN" ? "tipo--in" : "tipo--out"}>
                {registro.type === "CHECK_IN" ? "Início do treino" : "Fim do treino"}
              </span>

              {emEdicao ? (
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
                    ✓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={cancelarEdicao}
                    disabled={salvandoEdicao}
                    aria-label="Cancelar edicao"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <span className="historico-horario">
                  {formatarHorario(registro.timestamp)}
                  {duracao && <span className="historico-duracao">{duracao}</span>}
                  <span className="historico-acoes">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => iniciarEdicao(registro)}
                      aria-label="Corrigir registro"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => excluirEntrada(registro.id)}
                      aria-label="Excluir registro"
                    >
                      🗑
                    </button>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
