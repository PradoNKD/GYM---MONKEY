import { Flame, Snowflake, Target, Timer, Trophy } from "lucide-react";
import { Dica } from "./Dica";
import { dataDaChave, formatarMinutos } from "./calculos";
import type { MetaSemanal } from "./types";

/**
 * O bloco principal da home a partir da v1.0.
 *
 * Antes o destaque era a streak DIARIA, que pune o descanso: para nao ve-la
 * cair, a pessoa precisa treinar todo santo dia. Aqui o numero que manda e a
 * semana -- ela comporta folga -- e a sequencia de dias vira recorde, que
 * comemora o que ja foi feito em vez de cobrar o de hoje.
 *
 * Nenhum calculo acontece aqui: meta, faltam, streak e congelamentos vem
 * prontos do servidor, no fuso da pessoa. A tela so escolhe as palavras.
 */
export function MetaSemana({
  meta,
  recordeDiario,
  minutosNaSemana,
  onAlterarMeta,
  salvandoMeta = false,
}: {
  meta: MetaSemanal | undefined;
  recordeDiario: number;
  minutosNaSemana: number;
  onAlterarMeta: (meta: number) => void;
  salvandoMeta?: boolean;
}) {
  if (!meta) return null;

  const { metaMin, metaMax } = meta.limites;
  const opcoes = Array.from({ length: metaMax - metaMin + 1 }, (_, i) => metaMin + i);
  // O seletor mostra a meta que a pessoa escolheu, mesmo que ela so entre em
  // vigor na semana que vem -- senao a escolha parece nao ter sido salva.
  const metaEscolhida = meta.metaAgendada?.meta ?? meta.meta;

  const plural = (n: number, singular: string, muitos: string) =>
    n === 1 ? singular : muitos;

  function frasePrincipal(): string {
    if (meta!.recomeco) {
      return "Bom te ver de volta. Essa semana comeca uma sequencia nova.";
    }
    if (meta!.cumprida) {
      return "Meta da semana batida. O que vier a mais e lucro.";
    }
    if (meta!.treinos === 0) {
      return `${meta!.meta} treinos essa semana fecham a meta.`;
    }
    return `Falta${meta!.faltam === 1 ? "" : "m"} ${meta!.faltam} ${plural(
      meta!.faltam,
      "treino",
      "treinos",
    )} para fechar a semana.`;
  }

  return (
    <section className="meta-semana" aria-label="Meta da semana">
      <div className="meta-topo">
        <span className="meta-titulo">
          <Target size={15} />
          Meta da semana
          <Dica
            rotulo="O que e a meta da semana?"
            texto="Quantos treinos voce quer fazer por semana, de 3 a 6. A semana vai de segunda a domingo. Mudar a meta vale a partir da PROXIMA semana -- a atual continua com a meta que comecou, para a troca nao apagar nem facilitar o que ja esta em andamento."
          />
        </span>

        <label className="meta-seletor">
          <span className="visualmente-oculto">Treinos por semana</span>
          <select
            value={metaEscolhida}
            disabled={salvandoMeta}
            onChange={(e) => onAlterarMeta(Number(e.target.value))}
          >
            {opcoes.map((n) => (
              <option key={n} value={n}>
                {n}x
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Um ponto por treino da meta: da para ler de relance, sem contar. */}
      <div
        className="meta-progresso"
        role="img"
        aria-label={`${meta.treinos} de ${meta.meta} treinos nesta semana`}
      >
        {Array.from({ length: meta.meta }, (_, i) => (
          <span
            key={i}
            data-feito={i < meta.treinos}
            className={`meta-ponto ${i < meta.treinos ? "meta-ponto--feito" : ""}`}
          />
        ))}
        {/* Treino acima da meta nao cabe nos pontos, mas merece aparecer. */}
        {meta.treinos > meta.meta && (
          <span className="meta-extra">+{meta.treinos - meta.meta}</span>
        )}
      </div>

      <p className="meta-frase">{frasePrincipal()}</p>

      <div className="meta-numeros">
        <span className="meta-numero">
          <Flame size={15} className="meta-icone meta-icone--streak" />
          <strong>{meta.streakSemanas}</strong>
          {plural(meta.streakSemanas, "semana seguida", "semanas seguidas")}
          <Dica
            rotulo="O que sao semanas seguidas?"
            texto="Semanas em sequencia em que voce bateu a meta. Conta por SEMANA, nao por dia: descansar nao quebra nada, desde que a meta da semana feche."
          />
        </span>
        <span className="meta-numero">
          <Snowflake size={15} className="meta-icone" />
          <strong>{meta.tokens}</strong>
          {plural(meta.tokens, "congelamento", "congelamentos")}
          <Dica
            rotulo="O que e um congelamento?"
            texto="Se voce nao bater a meta numa semana, um congelamento e gasto sozinho e a sua sequencia NAO quebra -- ela fica parada, sem subir. Voce comeca com 2, ganha mais 1 a cada 4 semanas cumpridas seguidas e pode guardar no maximo 2. Nao gasta se nao houver sequencia a proteger."
          />
        </span>
        <span className="meta-numero">
          <Timer size={15} className="meta-icone" />
          <strong>{formatarMinutos(minutosNaSemana)}</strong>
          essa semana
        </span>
      </div>

      {/* Oferece o conserto em vez de so anunciar a perda. */}
      {meta.reparo && (
        <p className="meta-aviso meta-aviso--reparo" role="status">
          Faca {meta.reparo.exige} treinos essa semana e voce recupera a sequencia de{" "}
          {meta.reparo.streakSalva}{" "}
          {plural(meta.reparo.streakSalva, "semana", "semanas")}.
        </p>
      )}

      {meta.metaAgendada && (
        <p className="meta-aviso">
          A meta de {meta.metaAgendada.meta}x por semana vale a partir de{" "}
          {dataDaChave(meta.metaAgendada.validaDe).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          })}
          .
        </p>
      )}

      {recordeDiario > 0 && (
        <p className="meta-recorde">
          <Trophy size={13} />
          Recorde: {recordeDiario} {plural(recordeDiario, "dia seguido", "dias seguidos")}
        </p>
      )}
    </section>
  );
}
