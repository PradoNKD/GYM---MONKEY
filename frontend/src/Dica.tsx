import { CircleHelp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { deslocamentoParaCaber } from "./dica-posicao";

/**
 * Um `?` que abre uma explicacao curta.
 *
 * **Por que nao usar `title`**: o atributo `title` do HTML so aparece no hover
 * do mouse. Em celular nao existe hover, entao a dica simplesmente nunca
 * aparece -- e celular e onde este app e usado. Por isso abre no TOQUE.
 *
 * Serve pra conceito, nao pra rotulo. Icone que precisa de `?` pra dizer o que
 * e deveria ter texto do lado; o que o `?` resolve e a pergunta seguinte --
 * "existe congelamento, mas o que ele faz?" -- que nao cabe na tela inteira e
 * nao deveria obrigar a abrir documentacao.
 *
 * A caixa sempre abre para a direita e depois e **medida** e puxada de volta se
 * passar da borda (ver dica-posicao.ts). A versao anterior tinha propriedade
 * pra escolher o lado a mao, e eu escolhi errado: no iPhone a explicacao das
 * "semanas seguidas" saiu pela borda esquerda com o texto cortado.
 */
export function Dica({
  texto,
  rotulo = "O que isso significa?",
}: {
  texto: string;
  rotulo?: string;
}) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLSpanElement>(null);
  const caixa = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberta) return;

    function aoApontarFora(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberta(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberta(false);
    }

    // `pointerdown` cobre toque, mouse e caneta com um ouvinte so. Fechar ao
    // tocar fora e o que faz duas dicas na mesma tela nao ficarem abertas
    // juntas, sem precisar de estado compartilhado entre elas.
    document.addEventListener("pointerdown", aoApontarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoApontarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta]);

  // `useLayoutEffect` e nao `useEffect`: o ajuste precisa valer antes de a tela
  // pintar, senao a dica aparece fora da borda e pula para o lugar na frente de
  // quem esta olhando.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!aberta || !elemento) return;

    // Mede sempre a partir da posicao natural, sem o deslocamento anterior.
    elemento.style.transform = "none";
    const area = elemento.getBoundingClientRect();

    // Sem layout de verdade (jsdom, ou ainda nao pintado) a medida nao diz
    // nada, e deslocar com base nela moveria a caixa para lugar nenhum.
    if (area.width === 0) return;

    const deslocamento = deslocamentoParaCaber(area, window.innerWidth);
    if (deslocamento !== 0) {
      elemento.style.transform = `translateX(${deslocamento}px)`;
    }
  }, [aberta]);

  return (
    <span className="dica" ref={raiz}>
      <button
        type="button"
        className="dica-botao"
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-describedby={aberta ? id : undefined}
        onClick={() => setAberta((v) => !v)}
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>

      {aberta && (
        <span className="dica-caixa" ref={caixa} id={id} role="tooltip">
          {texto}
        </span>
      )}
    </span>
  );
}
