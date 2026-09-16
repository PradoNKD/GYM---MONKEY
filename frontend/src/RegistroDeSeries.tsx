import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  buscarExercicios,
  buscarExerciciosDoTreino,
  buscarProgressao,
  buscarUltimaVez,
  removerExercicioDoTreino,
  salvarSeries,
} from "./api";
import { GraficoProgressao } from "./GraficoProgressao";
import { SeriesDoTreino } from "./SeriesDoTreino";
import type {
  Exercicio,
  ExercicioDoTreino,
  ProgressaoDeExercicio,
  Serie,
  UltimaVezDoExercicio,
} from "./types";

/**
 * O estado do registro de series, junto do resto da tela do treino.
 *
 * Container proprio, e nao mais oito props atravessando `TreinoScreen`, pelo
 * mesmo motivo de `AdminScreen`: quem precisa do token pega o token. Isso
 * mantem `PontoScreen` do tamanho que ja tem.
 *
 * **Nada aqui derruba a tela quando falha.** Serie e anotacao: se a leitura do
 * catalogo nao voltar, o treino continua funcionando e o check-out tambem. O
 * erro aparece na secao, e so.
 */
export function RegistroDeSeries({ sessionId }: { sessionId: string }) {
  const { token } = useAuth();

  const [exercicios, setExercicios] = useState<ExercicioDoTreino[]>([]);
  const [catalogo, setCatalogo] = useState<Exercicio[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progressao, setProgressao] = useState<ProgressaoDeExercicio | null>(null);

  // "O que fiz da ultima vez", por nome de exercicio. Fica em estado, e nao em
  // ref, porque a tela precisa redesenhar quando a resposta chega.
  const [ultimaVez, setUltimaVez] = useState<Record<string, UltimaVezDoExercicio>>({});

  const carregar = useCallback(async () => {
    if (!token) return;

    try {
      const [doTreino, cat] = await Promise.all([
        buscarExerciciosDoTreino(token, sessionId),
        buscarExercicios(token),
      ]);
      setExercicios(doTreino.exercicios);
      setCatalogo(cat.exercicios);
      setErro(null);
    } catch {
      setErro("Não foi possível carregar os exercícios");
    }
  }, [token, sessionId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Busca o que foi feito da ultima vez, ignorando o treino de agora -- sem
   * isso, assim que a primeira serie de hoje fosse salva, a sugestao viraria
   * um espelho do que acabou de ser digitado.
   */
  const pedirUltimaVez = useCallback(
    async (nome: string) => {
      if (!token || ultimaVez[nome]) return;

      const doCatalogo = catalogo.find(
        (e) => e.nome.toLowerCase() === nome.toLowerCase(),
      );
      // Exercicio estreando ainda nao esta no catalogo: nao ha ultima vez.
      if (!doCatalogo) return;

      try {
        const r = await buscarUltimaVez(token, doCatalogo.id, sessionId);
        setUltimaVez((atual) => ({ ...atual, [nome]: r }));
      } catch {
        // Sem "ultima vez" o editor so abre vazio. Nao vale avisar.
      }
    },
    [token, catalogo, sessionId, ultimaVez],
  );

  async function guardar(nome: string, series: Serie[]) {
    if (!token) return;

    setSalvando(true);
    setErro(null);
    try {
      const r = await salvarSeries(token, sessionId, nome, series);
      setExercicios(r.exercicios);
      // O catalogo pode ter ganhado um nome novo agora.
      void buscarExercicios(token).then((c) => setCatalogo(c.exercicios));
    } catch {
      setErro("Não foi possível salvar. O treino em si está registrado.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(exerciseId: string) {
    if (!token) return;

    try {
      const r = await removerExercicioDoTreino(token, sessionId, exerciseId);
      setExercicios(r.exercicios);
    } catch {
      setErro("Não foi possível remover");
    }
  }

  async function abrirProgressao(exerciseId: string) {
    if (!token) return;

    try {
      setProgressao(await buscarProgressao(token, exerciseId));
    } catch {
      setErro("Não foi possível carregar a progressão");
    }
  }

  return (
    <>
      {progressao && (
        <GraficoProgressao
          progressao={progressao}
          onFechar={() => setProgressao(null)}
        />
      )}

      <SeriesDoTreino
        exercicios={exercicios}
        catalogo={catalogo}
        ultimaVezDe={(nome) => ultimaVez[nome] ?? null}
        salvando={salvando}
        onAbrirEditor={(nome) => void pedirUltimaVez(nome)}
        onSalvar={(nome, series) => void guardar(nome, series)}
        onRemover={(id) => void remover(id)}
        onAbrirProgressao={(id) => void abrirProgressao(id)}
      />

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </>
  );
}
