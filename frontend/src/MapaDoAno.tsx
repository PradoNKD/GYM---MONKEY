import { CalendarDays } from "lucide-react";
import { formatarMinutos } from "./calculos";
import {
  construirColunas,
  descricaoDaCelula,
  DIAS_DA_SEMANA,
  nivelDaCelula,
  rotulosDeMes,
} from "./mapa";
import type { MapaDoAno as Mapa } from "./types";

/**
 * A grade de dias treinados.
 *
 * Ausencia e FUNDO, nunca alerta: nada de vermelho em dia sem treino. A janela
 * comeca no primeiro treino da pessoa (o servidor decide isso), entao ninguem
 * abre a home e ve meses de vazio de antes de existir por aqui.
 */
export function MapaDoAno({ mapa }: { mapa: Mapa | null }) {
  if (!mapa) return null;

  const colunas = construirColunas(mapa);
  const meses = rotulosDeMes(colunas);

  return (
    <section className="mapa" aria-label="Dias treinados">
      <div className="mapa-topo">
        <span className="mapa-titulo">
          <CalendarDays size={15} />
          Dias treinados
        </span>
        <span className="mapa-total">
          {mapa.total.dias === 1 ? "1 dia" : `${mapa.total.dias} dias`} ·{" "}
          {formatarMinutos(mapa.total.minutos)}
        </span>
      </div>

      {/* A grade rola sozinha; a pagina nunca rola de lado. */}
      <div className="mapa-rolagem">
        <div className="mapa-grade">
          <div className="mapa-dias-semana" aria-hidden="true">
            {DIAS_DA_SEMANA.map((dia, i) => (
              // Só 2ª, 4ª e 6ª ganham rotulo: sete rotulos em 7 linhas de 11px
              // viram borrão no celular.
              <span key={dia} className="mapa-dia-semana">
                {i % 2 === 0 ? dia : ""}
              </span>
            ))}
          </div>

          <div className="mapa-colunas">
            <div className="mapa-meses" aria-hidden="true">
              {meses.map((mes, i) => (
                <span key={colunas[i].inicio} className="mapa-mes">
                  {mes ?? ""}
                </span>
              ))}
            </div>

            <div className="mapa-semanas">
              {colunas.map((coluna) => (
                <div key={coluna.inicio} className="mapa-semana">
                  {coluna.celulas.map((celula) =>
                    celula.futuro ? (
                      <span key={celula.dia} className="mapa-celula mapa-celula--futuro" />
                    ) : (
                      <span
                        key={celula.dia}
                        className={`mapa-celula mapa-celula--n${nivelDaCelula(celula)}`}
                        title={descricaoDaCelula(celula)}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mapa-legenda" aria-hidden="true">
        <span>menos</span>
        <span className="mapa-celula mapa-celula--n0" />
        <span className="mapa-celula mapa-celula--n1" />
        <span className="mapa-celula mapa-celula--n2" />
        <span>mais</span>
      </div>
    </section>
  );
}
