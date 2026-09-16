import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Plus, Trash2, X } from "lucide-react";
import { lerPeso, pesoParaCampo, resumoDasSeries } from "./pesos";
import type { Exercicio, ExercicioDoTreino, Serie } from "./types";

/**
 * Registro de exercicios e series -- a Fase B.
 *
 * O contexto manda em cada decisao daqui: a pessoa esta **na academia, entre
 * duas series, com a mao suada e o celular numa mao so**. Se registrar uma
 * serie custar mais que alguns toques, o diario e abandonado em duas semanas.
 * Por isso:
 *
 * - Aparece com o treino **aberto**, e nao no check-out. Ninguem lembra cinco
 *   exercicios com quatro series de memoria ao sair da academia.
 * - **Repetir e a norma.** Quase todo treino refaz o anterior com a mesma carga
 *   ou perto dela, entao existe um botao que traz tudo de uma vez.
 * - Serie nova **nasce com os valores da anterior**: 4x10 com 40kg e digitar
 *   uma vez e tocar "+" tres vezes.
 * - Campo de carga vazio e **peso do corpo**, nao erro -- barra fixa e agachamento
 *   livre precisam existir sem inventar um numero.
 */

/** O degrau minimo para o Safari do iOS nao dar zoom ao focar o campo. */
const CLASSE_CAMPO = "serie-campo";

/**
 * Serie com identidade propria, so enquanto se edita.
 *
 * Existe para a linha ser chaveada por algo estavel. Com `key={indice}`, remover
 * a segunda de tres series faz o React reaproveitar os componentes e o campo de
 * carga passa a mostrar o texto do vizinho -- o id resolve isso na raiz, em vez
 * de exigir um efeito corrigindo depois.
 */
type SerieLocal = Serie & { _id: string };

let sequencia = 0;
const novoId = () => `s${++sequencia}`;
const comId = (series: Serie[]): SerieLocal[] =>
  series.map((s) => ({ ...s, _id: novoId() }));

/** Tira a identidade local: o servidor nao tem o que fazer com ela. */
const semId = (series: SerieLocal[]): Serie[] =>
  series.map((s) => ({ reps: s.reps, pesoG: s.pesoG }));

function LinhaDaSerie({
  indice,
  serie,
  onMudar,
  onRemover,
  autoFoco,
}: {
  indice: number;
  serie: Serie;
  onMudar: (s: Serie) => void;
  onRemover: () => void;
  autoFoco: boolean;
}) {
  // O texto e a fonte enquanto se digita: guardar so o numero faria "42,"
  // virar "42" no meio da digitacao, apagando a virgula sob os dedos.
  //
  // Nao ha efeito sincronizando isto com a prop, e nao precisa haver: cada
  // serie tem id proprio e a linha e chaveada por ele, entao trocar a lista
  // (o "repetir") monta componentes novos em vez de reaproveitar os antigos
  // com texto velho dentro. Chavear por indice era o que exigia a sincronia --
  // e o que fazia o campo mostrar o valor do vizinho ao remover uma serie.
  const [peso, setPeso] = useState(() => pesoParaCampo(serie.pesoG));
  const campoReps = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFoco) campoReps.current?.focus();
  }, [autoFoco]);

  const pesoInvalido = lerPeso(peso) === undefined;

  return (
    <li className="serie-linha">
      <span className="serie-numero" aria-hidden="true">
        {indice + 1}
      </span>

      <label className="serie-campo-rotulo">
        <span className="sr-only">Repetições da série {indice + 1}</span>
        <input
          ref={campoReps}
          className={CLASSE_CAMPO}
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          value={serie.reps || ""}
          onChange={(e) => onMudar({ ...serie, reps: Number(e.target.value) })}
          aria-label={`Repetições da série ${indice + 1}`}
        />
      </label>

      <span className="serie-x" aria-hidden="true">
        ×
      </span>

      <label className="serie-campo-rotulo">
        <span className="sr-only">Carga da série {indice + 1}, em quilos</span>
        <input
          className={`${CLASSE_CAMPO} ${pesoInvalido ? "serie-campo--erro" : ""}`}
          // `text` e nao `number`: com `number` o teclado do iOS nao oferece
          // virgula, e e assim que se digita 42,5 em portugues.
          type="text"
          inputMode="decimal"
          placeholder="peso"
          value={peso}
          onChange={(e) => {
            setPeso(e.target.value);
            const g = lerPeso(e.target.value);
            if (g !== undefined) onMudar({ ...serie, pesoG: g });
          }}
          aria-label={`Carga da série ${indice + 1}, em quilos`}
          aria-invalid={pesoInvalido}
        />
      </label>

      <span className="serie-unidade" aria-hidden="true">
        kg
      </span>

      <button
        type="button"
        className="icon-btn serie-remover"
        onClick={onRemover}
        aria-label={`Remover série ${indice + 1}`}
      >
        <X size={15} />
      </button>
    </li>
  );
}

export function EditorDeExercicio({
  nome,
  series,
  ultimaVez,
  salvando,
  onSalvar,
  onCancelar,
}: {
  nome: string;
  series: Serie[];
  ultimaVez: { dia: string | null; series: Serie[] } | null;
  salvando: boolean;
  onSalvar: (series: Serie[]) => void;
  onCancelar: () => void;
}) {
  const [lista, setLista] = useState<SerieLocal[]>(() =>
    comId(series.length > 0 ? series : [{ reps: 10, pesoG: null }]),
  );
  const [focarUltima, setFocarUltima] = useState(false);

  // Serie nova herda a anterior: 4x10 com 40kg vira digitar uma vez e tocar +.
  function acrescentar() {
    const ultima = lista[lista.length - 1];
    setLista([
      ...lista,
      { ...(ultima ?? { reps: 10, pesoG: null }), _id: novoId() },
    ]);
    setFocarUltima(true);
  }

  const podeRepetir = (ultimaVez?.series.length ?? 0) > 0;

  return (
    <div className="exercicio-editor">
      <div className="exercicio-editor-topo">
        <strong className="exercicio-editor-nome">{nome}</strong>
        <button
          type="button"
          className="icon-btn"
          onClick={onCancelar}
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>

      {podeRepetir && (
        <button
          type="button"
          className="btn-fantasma exercicio-repetir"
          onClick={() => setLista(comId(ultimaVez!.series))}
        >
          <Copy size={14} />
          Repetir {resumoDasSeries(ultimaVez!.series)}
        </button>
      )}

      <ul className="serie-lista">
        {lista.map((s, i) => (
          <LinhaDaSerie
            key={s._id}
            indice={i}
            serie={s}
            autoFoco={focarUltima && i === lista.length - 1}
            onMudar={(nova) =>
              setLista(lista.map((v, j) => (j === i ? { ...nova, _id: v._id } : v)))
            }
            onRemover={() => setLista(lista.filter((_, j) => j !== i))}
          />
        ))}
      </ul>

      <button type="button" className="btn-fantasma serie-add" onClick={acrescentar}>
        <Plus size={15} />
        Série
      </button>

      <p className="exercicio-dica">
        Carga em branco é peso do corpo.
      </p>

      <button
        type="button"
        className="btn btn--pequeno"
        disabled={salvando || lista.some((s) => !s.reps)}
        onClick={() => onSalvar(semId(lista))}
      >
        <Check size={16} />
        {salvando ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}

export function SeletorDeExercicio({
  catalogo,
  onEscolher,
  onCancelar,
}: {
  catalogo: Exercicio[];
  onEscolher: (nome: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  // Sugestao vem do proprio historico: e o que faz o nome digitado uma vez
  // nunca mais precisar ser digitado inteiro -- e o que mantem o dado
  // consistente, porque escolher da lista nao cria variacao de escrita.
  const sugestoes = useMemo(() => {
    const busca = texto.trim().toLowerCase();
    if (!busca) return catalogo.slice(0, 8);

    return catalogo.filter((e) => e.nome.toLowerCase().includes(busca)).slice(0, 8);
  }, [catalogo, texto]);

  const nomeNovo = texto.trim();
  const jaExiste = catalogo.some((e) => e.nome.toLowerCase() === nomeNovo.toLowerCase());

  return (
    <div className="exercicio-seletor">
      <div className="exercicio-editor-topo">
        <input
          ref={campo}
          className="serie-campo exercicio-busca"
          type="text"
          placeholder="Qual exercício?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nomeNovo) onEscolher(nomeNovo);
          }}
          aria-label="Nome do exercício"
        />
        <button type="button" className="icon-btn" onClick={onCancelar} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      {sugestoes.length > 0 && (
        <ul className="exercicio-sugestoes">
          {sugestoes.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onEscolher(e.nome)}>
                {e.nome}
              </button>
            </li>
          ))}
        </ul>
      )}

      {nomeNovo && !jaExiste && (
        <button
          type="button"
          className="btn-fantasma exercicio-criar"
          onClick={() => onEscolher(nomeNovo)}
        >
          <Plus size={14} />
          Usar &ldquo;{nomeNovo}&rdquo;
        </button>
      )}
    </div>
  );
}

export function SeriesDoTreino({
  exercicios,
  catalogo,
  ultimaVezDe,
  salvando,
  onAbrirEditor,
  onSalvar,
  onRemover,
  onAbrirProgressao,
}: {
  exercicios: ExercicioDoTreino[];
  catalogo: Exercicio[];
  ultimaVezDe: (nome: string) => { dia: string | null; series: Serie[] } | null;
  salvando: boolean;
  /** Avisa que o editor abriu, para o container buscar "a ultima vez". */
  onAbrirEditor: (nome: string) => void;
  onSalvar: (nome: string, series: Serie[]) => void;
  onRemover: (exerciseId: string) => void;
  onAbrirProgressao: (exerciseId: string) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);

  // Buscar "a ultima vez" e efeito colateral: sai daqui, do EVENTO de abrir,
  // e nunca do render do editor -- efeito em render o React nao garante.
  function abrirEditor(nome: string) {
    setEditando(nome);
    onAbrirEditor(nome);
  }

  const emEdicao = editando
    ? exercicios.find((e) => e.nome === editando)
    : undefined;

  return (
    <section className="series-secao" aria-label="Exercícios do treino">
      <h2 className="series-titulo">Exercícios</h2>

      {exercicios.length === 0 && !escolhendo && !editando && (
        <p className="series-vazio">
          Nada registrado ainda. Anotar é opcional — o treino conta do mesmo
          jeito.
        </p>
      )}

      <ul className="exercicio-lista">
        {exercicios.map((e) => (
          <li key={e.id} className="exercicio-item">
            <button
              type="button"
              className="exercicio-abrir"
              onClick={() => abrirEditor(e.nome)}
            >
              <span className="exercicio-nome">{e.nome}</span>
              <span className="exercicio-resumo">{resumoDasSeries(e.series)}</span>
            </button>

            <button
              type="button"
              className="icon-btn"
              onClick={() => onAbrirProgressao(e.id)}
              aria-label={`Ver progressão de ${e.nome}`}
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              className="icon-btn"
              onClick={() => onRemover(e.id)}
              aria-label={`Remover ${e.nome} do treino`}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      {editando && (
        <EditorDeExercicio
          nome={editando}
          series={emEdicao?.series ?? []}
          ultimaVez={ultimaVezDe(editando)}
          salvando={salvando}
          onSalvar={(series) => {
            onSalvar(editando, series);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {escolhendo && !editando && (
        <SeletorDeExercicio
          catalogo={catalogo}
          onEscolher={(nome) => {
            setEscolhendo(false);
            abrirEditor(nome);
          }}
          onCancelar={() => setEscolhendo(false)}
        />
      )}

      {!escolhendo && !editando && (
        <button
          type="button"
          className="btn-fantasma exercicio-add"
          onClick={() => setEscolhendo(true)}
        >
          <Plus size={15} />
          Exercício
        </button>
      )}
    </section>
  );
}
