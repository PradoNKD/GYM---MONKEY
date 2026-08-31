import { Award, Sparkles, Trophy, X } from "lucide-react";
import type { ConquistaNova, ResumoDeConquistas } from "./types";

/**
 * Conquistas: marcos e recordes.
 *
 * Duas regras de tom valem em cada linha deste arquivo, e nao sao estilo:
 *
 * - Nada compara com outra pessoa. A conquista e sobre a propria historia.
 * - O que ainda NAO foi conquistado nunca aparece como divida. A barra do
 *   proximo marco mostra o quanto ja andou, e nao o quanto falta -- a mesma
 *   informacao, sem a leitura de cobranca.
 */

/** A festa. Aparece uma vez, e some quando a pessoa fecha. */
export function FestaDeConquistas({
  novas,
  onFechar,
}: {
  novas: ConquistaNova[];
  onFechar: () => void;
}) {
  if (novas.length === 0) return null;

  return (
    <div className="festa" role="status" aria-label="Conquista nova">
      <div className="festa-topo">
        <span className="festa-titulo">
          <Sparkles size={15} />
          {novas.length === 1 ? "Conquista nova" : `${novas.length} conquistas novas`}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={onFechar}
          aria-label="Fechar comemoração"
        >
          <X size={16} />
        </button>
      </div>

      <ul className="festa-lista">
        {novas.map((c) => (
          <li key={c.code} className="festa-item">
            {c.kind === "RECORDE" ? <Trophy size={16} /> : <Award size={16} />}
            <span className="festa-item-texto">
              <strong>{c.nome}</strong>
              {c.kind === "RECORDE" ? (
                <span className="festa-item-desc">
                  Nova marca: {c.valor} {c.unidade}
                </span>
              ) : (
                c.descricao && <span className="festa-item-desc">{c.descricao}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O contador discreto de marcos + o proximo degrau. */
export function ResumoConquistas({ conquistas }: { conquistas: ResumoDeConquistas }) {
  const { total, proximo } = conquistas;

  if (total === 0 && !proximo) return null;

  return (
    <div className="conquistas-resumo">
      <span className="conquistas-total">
        <Award size={14} />
        {total === 1 ? "1 marco" : `${total} marcos`}
      </span>

      {proximo && (
        <span className="conquistas-proximo">
          <span className="conquistas-proximo-nome">{proximo.nome}</span>
          <span
            className="conquistas-barra"
            role="img"
            aria-label={`${proximo.nome}: ${proximo.progresso} de ${proximo.alvo}`}
          >
            <span
              className="conquistas-barra-cheia"
              style={{ width: `${(proximo.progresso / proximo.alvo) * 100}%` }}
            />
          </span>
          <span className="conquistas-proximo-numero">
            {proximo.progresso}/{proximo.alvo}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * Convite de recomeco em marco temporal (1o do mes ou do ano).
 *
 * Base: o "fresh start effect" (Dai, Milkman & Riis, Management Science 2014) --
 * datas de virada separam a pessoa de quem ela era antes, e por isso e mais
 * facil comecar nelas. O texto NUNCA menciona o que ficou para tras.
 */
export function ConviteDeRecomeco({ tipo }: { tipo: "ANO" | "MES" | null }) {
  if (!tipo) return null;

  return (
    <p className="fresh-start" role="status">
      <Sparkles size={14} />
      {tipo === "ANO"
        ? "Ano novo. Boa hora para começar de novo — a contagem recomeça hoje."
        : "Mês novo. Boa hora para começar de novo — a contagem recomeça hoje."}
    </p>
  );
}
