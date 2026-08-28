import { useState } from "react";
import { Check, X } from "lucide-react";
import { ROTULO_DO_ESFORCO, ROTULO_DO_TIPO, TIPOS } from "./rotulos";
import type { LimitesDoRegistro } from "./rotulos";
import type { RegistroTreinoEntrada, Sessao, TipoTreino } from "./types";

/**
 * Registro do treino (Fase A): o que treinou, o quanto puxou e uma nota curta.
 *
 * Tudo opcional, e nao e descuido: o check-out e a acao que sustenta streak,
 * meta e placar. Exigir preenchimento ali arriscaria a metrica que ja funciona
 * para ganhar uma que ainda nao existe. Por isso o formulario tem "Agora nao"
 * com o mesmo peso visual do "Salvar", e salvar vazio e permitido.
 */

export function RegistroTreino({
  sessao,
  limites,
  onSalvar,
  onCancelar,
  salvando = false,
  erro = null,
  destacado = false,
}: {
  sessao: Sessao;
  limites: LimitesDoRegistro;
  onSalvar: (dados: RegistroTreinoEntrada) => void;
  onCancelar: () => void;
  salvando?: boolean;
  erro?: string | null;
  destacado?: boolean;
}) {
  const [tipos, setTipos] = useState<TipoTreino[]>(sessao.workoutTypes);
  const [esforco, setEsforco] = useState<number | null>(sessao.effort);
  const [nota, setNota] = useState(sessao.note ?? "");

  const niveis = Array.from(
    { length: limites.esforcoMax - limites.esforcoMin + 1 },
    (_, i) => limites.esforcoMin + i,
  );
  const noTeto = tipos.length >= limites.tiposMax;

  function alternarTipo(tipo: TipoTreino) {
    setTipos((atuais) => {
      if (atuais.includes(tipo)) return atuais.filter((t) => t !== tipo);
      // Silenciosamente ignorar o clique seria pior que desabilitar: a pessoa
      // acha que marcou. Por isso o botao vem disabled ao chegar no teto.
      if (atuais.length >= limites.tiposMax) return atuais;
      return [...atuais, tipo];
    });
  }

  function salvar() {
    // Manda os tres sempre: e uma edicao do registro inteiro, entao desmarcar
    // tudo precisa mesmo limpar. O "ausente nao mexe" do servidor serve para
    // outros clientes, nao para este formulario.
    onSalvar({
      workoutTypes: tipos,
      effort: esforco,
      note: nota.trim() === "" ? null : nota.trim(),
    });
  }

  return (
    <form
      className={`registro ${destacado ? "registro--novo" : ""}`}
      aria-label="Registrar o treino"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <p className="registro-titulo">
        O que você treinou? <span className="registro-opcional">opcional</span>
      </p>

      <div className="registro-chips" role="group" aria-label="Tipo de treino">
        {TIPOS.map((tipo) => {
          const marcado = tipos.includes(tipo);
          return (
            <button
              key={tipo}
              type="button"
              className={`chip ${marcado ? "chip--on" : ""}`}
              aria-pressed={marcado}
              disabled={salvando || (!marcado && noTeto)}
              onClick={() => alternarTipo(tipo)}
            >
              {ROTULO_DO_TIPO[tipo]}
            </button>
          );
        })}
      </div>

      <div className="registro-campo">
        <span className="registro-rotulo">Esforço</span>
        <div className="registro-esforco" role="group" aria-label="Esforço percebido">
          {niveis.map((nivel) => (
            <button
              key={nivel}
              type="button"
              className={`esforco-btn ${esforco === nivel ? "esforco-btn--on" : ""}`}
              aria-pressed={esforco === nivel}
              aria-label={`${nivel} - ${ROTULO_DO_ESFORCO[nivel]}`}
              disabled={salvando}
              // Clicar no que ja esta marcado desmarca: sem isso nao haveria
              // como voltar atras depois de tocar sem querer.
              onClick={() => setEsforco((atual) => (atual === nivel ? null : nivel))}
            >
              {nivel}
            </button>
          ))}
        </div>
        {esforco !== null && (
          <span className="registro-esforco-rotulo">{ROTULO_DO_ESFORCO[esforco]}</span>
        )}
      </div>

      <div className="registro-campo">
        <label className="registro-rotulo" htmlFor={`nota-${sessao.id}`}>
          Anotação
        </label>
        <textarea
          id={`nota-${sessao.id}`}
          className="registro-nota"
          rows={2}
          maxLength={limites.notaMax}
          disabled={salvando}
          placeholder="Ex.: supino 4x10 com 40kg, agachamento 3x12"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <span className="registro-contador">
          {nota.length}/{limites.notaMax}
        </span>
      </div>

      {erro && <p className="auth-erro">{erro}</p>}

      <div className="registro-acoes">
        <button type="submit" className="btn-mini btn-mini--ok" disabled={salvando}>
          <Check size={14} />
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          className="btn-mini"
          disabled={salvando}
          onClick={onCancelar}
        >
          <X size={14} />
          Agora não
        </button>
      </div>
    </form>
  );
}

/** O registro como ele aparece no historico, sem formulario. */
export function ResumoDoRegistro({ sessao }: { sessao: Sessao }) {
  const temAlgo =
    sessao.workoutTypes.length > 0 || sessao.effort !== null || sessao.note !== null;
  if (!temAlgo) return null;

  return (
    <div className="registro-resumo">
      {sessao.workoutTypes.map((tipo) => (
        <span key={tipo} className="chip chip--leitura">
          {ROTULO_DO_TIPO[tipo]}
        </span>
      ))}
      {sessao.effort !== null && (
        <span className="registro-resumo-esforco">
          Esforço {sessao.effort} · {ROTULO_DO_ESFORCO[sessao.effort]}
        </span>
      )}
      {sessao.note && <p className="registro-resumo-nota">{sessao.note}</p>}
    </div>
  );
}
