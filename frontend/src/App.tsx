import { useState } from "react";
import type { Registro } from "./types";
import "./App.css";

function formatarHorario(data: Date): string {
  return data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function App() {
  const [historico, setHistorico] = useState<Registro[]>([]);

  const checkedIn = historico[0]?.tipo === "check-in";
  const ultimoRegistro = historico[0];

  function registrarPonto() {
    const registro: Registro = {
      tipo: checkedIn ? "check-out" : "check-in",
      horario: new Date(),
    };
    setHistorico((historicoAtual) => [registro, ...historicoAtual]);
  }

  return (
    <main className="card">
      <h1>Registro de Ponto</h1>

      <p className={`status ${checkedIn ? "status--in" : "status--out"}`}>
        {ultimoRegistro
          ? `${checkedIn ? "Em expediente" : "Fora do expediente"} desde ${formatarHorario(ultimoRegistro.horario)}`
          : "Fora do expediente"}
      </p>

      <button
        type="button"
        className={`btn ${checkedIn ? "btn--checkout" : "btn--checkin"}`}
        onClick={registrarPonto}
      >
        {checkedIn ? "Check-out" : "Check-in"}
      </button>

      <ul className="historico">
        {historico.map((registro) => (
          <li key={registro.horario.getTime()}>
            <span className={registro.tipo === "check-in" ? "tipo--in" : "tipo--out"}>
              {registro.tipo === "check-in" ? "Check-in" : "Check-out"}
            </span>
            <span>{formatarHorario(registro.horario)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
