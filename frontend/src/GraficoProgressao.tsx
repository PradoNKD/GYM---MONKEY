import { useState } from "react";
import { Table, Trophy, X } from "lucide-react";
import {
  ALTURA,
  LARGURA,
  MARGEM,
  caminho,
  diaCurto,
  diaPorExtenso,
  escalar,
  variacao,
} from "./grafico";
import { formatarPeso, formatarVolume } from "./pesos";
import type { ProgressaoDeExercicio } from "./types";

/**
 * Progressao de um exercicio: carga maxima por dia.
 *
 * **Uma serie so**, de proposito. O volume aparece como numero ao lado, nunca
 * como segunda linha: duas medidas de escalas diferentes no mesmo desenho
 * pediriam dois eixos verticais, e ai "cruzou" ou "descolou" vira artefato de
 * onde cada eixo foi ancorado, e nao fato sobre o treino.
 *
 * Como ha uma serie so, nao existe legenda -- o titulo nomeia o que a linha e.
 *
 * O detalhe que so aparece no aparelho: **em celular nao existe hover**. O
 * tooltip abre no TOQUE, e o alvo de toque e bem maior que o ponto desenhado.
 */
export function GraficoProgressao({
  progressao,
  onFechar,
}: {
  progressao: ProgressaoDeExercicio;
  onFechar: () => void;
}) {
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);

  const { exercicio, pontos, recorde } = progressao;
  const escala = escalar(pontos);
  const delta = variacao(pontos);

  return (
    <section className="grafico" aria-label={`Progressão de ${exercicio.nome}`}>
      <div className="grafico-topo">
        <div>
          <h2 className="grafico-titulo">{exercicio.nome}</h2>
          <p className="grafico-sub">Carga máxima por dia</p>
        </div>
        <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      {!escala && (
        <p className="grafico-vazio">
          {pontos.length === 0
            ? "Ainda não há treino registrado com este exercício."
            : "Este exercício só tem série com o peso do corpo — não há carga para desenhar."}
        </p>
      )}

      {escala && (
        <>
          {recorde && (
            <p className="grafico-recorde">
              <Trophy size={14} />
              <strong>{formatarPeso(recorde.pesoG)}</strong>
              <span>em {diaPorExtenso(recorde.dia)}</span>
            </p>
          )}

          {!tabela && (
            <svg
              className="grafico-svg"
              viewBox={`0 0 ${LARGURA} ${ALTURA}`}
              // Proporcao preservada: com `none` o SVG estica na largura e os
              // pontos redondos viram elipses.
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Carga máxima de ${exercicio.nome} em ${escala.pontos.length} dias, de ${formatarPeso(escala.minG)} a ${formatarPeso(escala.maxG)}`}
            >
              {/* Grade recessiva: duas linhas, so para dar referencia de altura. */}
              <line
                x1={MARGEM.esquerda}
                x2={LARGURA - MARGEM.direita}
                y1={MARGEM.topo}
                y2={MARGEM.topo}
                className="grafico-grade"
              />
              <line
                x1={MARGEM.esquerda}
                x2={LARGURA - MARGEM.direita}
                y1={ALTURA - MARGEM.baixo}
                y2={ALTURA - MARGEM.baixo}
                className="grafico-grade"
              />

              <path d={caminho(escala.pontos)} className="grafico-linha" />

              {escala.pontos.map((p, i) => {
                const ehRecorde = recorde?.dia === p.ponto.dia;
                const ativo = selecionado === i;

                return (
                  <g key={p.ponto.dia}>
                    {/* Alvo de toque generoso, invisivel: o ponto desenhado tem
                        8px, o dedo precisa de bem mais que isso. */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={16}
                      className="grafico-alvo"
                      onClick={() => setSelecionado(ativo ? null : i)}
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={ehRecorde || ativo ? 5 : 4}
                      className={`grafico-ponto ${ehRecorde ? "grafico-ponto--recorde" : ""}`}
                    />
                  </g>
                );
              })}

              {/* Rotulo direto SO no recorde. Numero em todo ponto viraria
                  ruido e esconderia justamente o que importa. */}
              {escala.pontos.map((p, i) =>
                recorde?.dia === p.ponto.dia && selecionado === null ? (
                  <text
                    key={`r-${p.ponto.dia}`}
                    x={p.x}
                    y={p.y - 9}
                    className="grafico-rotulo"
                    textAnchor={i === escala.pontos.length - 1 ? "end" : "middle"}
                  >
                    {formatarPeso(p.ponto.cargaMaxG)}
                  </text>
                ) : null,
              )}

              {selecionado !== null && escala.pontos[selecionado] && (
                <text
                  x={escala.pontos[selecionado].x}
                  y={escala.pontos[selecionado].y - 9}
                  className="grafico-rotulo grafico-rotulo--ativo"
                  textAnchor={
                    selecionado === escala.pontos.length - 1
                      ? "end"
                      : selecionado === 0
                        ? "start"
                        : "middle"
                  }
                >
                  {formatarPeso(escala.pontos[selecionado].ponto.cargaMaxG)}
                </text>
              )}

              <text
                x={MARGEM.esquerda}
                y={ALTURA - 5}
                className="grafico-eixo"
                textAnchor="start"
              >
                {diaCurto(escala.pontos[0].ponto.dia)}
              </text>
              {escala.pontos.length > 1 && (
                <text
                  x={LARGURA - MARGEM.direita}
                  y={ALTURA - 5}
                  className="grafico-eixo"
                  textAnchor="end"
                >
                  {diaCurto(escala.pontos[escala.pontos.length - 1].ponto.dia)}
                </text>
              )}
            </svg>
          )}

          {selecionado !== null && escala.pontos[selecionado] && (
            <p className="grafico-detalhe" role="status">
              <strong>{diaPorExtenso(escala.pontos[selecionado].ponto.dia)}</strong>
              {" · "}
              {escala.pontos[selecionado].ponto.series} série
              {escala.pontos[selecionado].ponto.series === 1 ? "" : "s"}
              {" · volume "}
              {formatarVolume(escala.pontos[selecionado].ponto.volumeG / 1000)}
            </p>
          )}

          {delta !== null && (
            <p className="grafico-variacao">
              {delta > 0 ? "+" : ""}
              {formatarPeso(Math.abs(delta)).replace("peso do corpo", "0 kg")}
              {delta >= 0 ? " desde o começo" : " a menos que no começo"}
            </p>
          )}

          {/* Uma tabela existe sempre: e o que torna o dado legivel sem
              depender de enxergar a linha. */}
          <button
            type="button"
            className="btn-fantasma grafico-tabela-btn"
            onClick={() => setTabela(!tabela)}
            aria-expanded={tabela}
          >
            <Table size={14} />
            {tabela ? "Ver gráfico" : "Ver números"}
          </button>

          {tabela && (
            <table className="grafico-tabela">
              <thead>
                <tr>
                  <th scope="col">Dia</th>
                  <th scope="col">Carga máx.</th>
                  <th scope="col">Séries</th>
                  <th scope="col">Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...pontos].reverse().map((p) => (
                  <tr key={p.dia}>
                    <td>{diaCurto(p.dia)}</td>
                    <td>{formatarPeso(p.cargaMaxG)}</td>
                    <td>{p.series}</td>
                    <td>{formatarVolume(p.volumeG / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
