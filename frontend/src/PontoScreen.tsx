import { useEffect, useState } from "react";
import { alternarPonto, ApiError, buscarHistorico } from "./api";
import { useAuth } from "./AuthContext";
import type { Registro } from "./types";

function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PontoScreen() {
  const { token, user, logout } = useAuth();
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

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

  return (
    <main className="card">
      <div className="card-header">
        <h1>Registro de Ponto</h1>
        <button type="button" className="link-btn" onClick={logout}>
          Sair ({user?.name})
        </button>
      </div>

      <p className={`status ${checkedIn ? "status--in" : "status--out"}`}>
        {ultimoRegistro
          ? `${checkedIn ? "Em expediente" : "Fora do expediente"} desde ${formatarHorario(ultimoRegistro.timestamp)}`
          : "Fora do expediente"}
      </p>

      {erro && <p className="auth-erro">{erro}</p>}

      <button
        type="button"
        className={`btn ${checkedIn ? "btn--checkout" : "btn--checkin"}`}
        onClick={registrarPonto}
        disabled={carregando || enviando}
      >
        {enviando ? "Registrando..." : checkedIn ? "Check-out" : "Check-in"}
      </button>

      <ul className="historico">
        {historico.map((registro) => (
          <li key={registro.id}>
            <span className={registro.type === "CHECK_IN" ? "tipo--in" : "tipo--out"}>
              {registro.type === "CHECK_IN" ? "Check-in" : "Check-out"}
            </span>
            <span>{formatarHorario(registro.timestamp)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
