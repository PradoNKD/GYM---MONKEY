# Próximos passos — v0.9 em diante

Atividades **em aberto**. Este documento existe pelo mesmo motivo do
[HANDOFF](HANDOFF.md): vive no repositório para que um `git clone` entregue o
contexto inteiro, sem depender de histórico de chat.

Última atualização: 2026-08-27.

Origem: análise de mercado de apps de academia (apps globais, mercado
brasileiro e evidência de gamificação) cruzada com auditoria do código.
Documento visual completo:
<https://claude.ai/code/artifact/41226593-1b31-44fc-91b5-e7f41f23d6b2>

---

## Estado atual — onde paramos (2026-08-27)

App **no ar** (ver [HANDOFF](HANDOFF.md)). A **v0.9 está entregue e em
produção**: a tela roda sobre `WorkoutSession` (`/sessions`), com `Group` +
`Membership`, `User.timezone`, auditoria `SessionCorrection`, streak e resumo
semanal calculados no servidor. O backfill já rodou no Neon. Além do escopo da
v0.9, no mesmo dia entraram tema claro/escuro, polimento mobile, a auditoria de
segurança e a trava de correção de datas.

Commits que subiram em 2026-08-27, em ordem:

| Commit | O que entrou |
|---|---|
| `9b419fe` | v0.9: cutover da tela para `/sessions` |
| `0afdffe` | v1.1 antecipado: tema claro/escuro e polimento mobile |
| `8015b33` | Auditoria de segurança: fecha a escrita em `/time-entries`, conserta o rate limit do login |
| `eb0cc06` | Trava a correção de datas, tema simplificado para dois estados |
| `988f64f` | Fecha o furo do +4h na correção e dá retorno na tela (erro, loading, sucesso) |
| `c54308c` | Ferramenta para desfazer as correções feitas antes da trava |

Suíte ao fim do dia: **200 no backend** (62 unitários + 138 e2e) e **148 no
frontend**, verdes. Build e lint limpos, com o aviso antigo de
`react(only-export-components)` em `frontend/src/AuthContext.tsx:87`.

### O que ficou pendente para a pessoa fazer (não é código)

1. **Rotar a senha do Neon.** A connection string foi colada em chat e depois
   reutilizada nos comandos de manutenção. Trocar no painel do Neon e atualizar
   a `DATABASE_URL` do Render.
2. **Reverter a sessão de 240 min do Flávio.** Foi um treino de teste que pegou
   o bug do +4h. Com a `DATABASE_URL` do Neon no shell:
   `npm run reverter-correcao -- --listar`, depois
   `npm run reverter-correcao -- <sessionId>` (simula) e
   `--confirmar` para aplicar. **Antes de aplicar, conferir a lista**: pode
   haver correções legítimas de outras pessoas, e essas não devem ser
   revertidas. Volta para o original de 1 min / `SHORT`.
3. **Confirmar o teto de +1h em produção.** Não foi possível provar daqui: a
   trava não vale para supervisor, e o `/health` não expõe versão. Pedir para o
   Flávio repetir o +4h e olhar se aparece "A correcao pode aumentar o treino em
   no maximo 60 min".
4. **Avisar o grupo** das mudanças visíveis: tema claro/escuro, uma correção por
   treino e só o horário de fim, e um possível erro de uma vez só em PWA com
   cache velho.

### Próximo passo de código

**v1.0 — meta semanal, streak de semanas e congelamento.** A especificação está
pronta na seção [Meta semanal, streak de semanas e
congelamento](#meta-semanal-streak-de-semanas-e-congelamento-v10) deste
documento. Ainda precisa de migration e de um job agendado.

## Decisões já tomadas (não re-discutir)

| Decisão | Escolha |
|---|---|
| Público | Grupo fechado agora; expandir depois via **verificação por e-mail** (aprovação manual pelo supervisor é só o mecanismo inicial) |
| Multi-tenant | **Modelar `Group` + `Membership` já na primeira migration**, mesmo com um grupo só — evita migration dolorosa depois, com dados em produção |
| Ordem | **Fundação técnica primeiro** (v0.9), antes de UI, engajamento e painel do supervisor |
| Registro de treino | **Duas fases**: Fase A leve; Fase B completa (séries/cargas/PRs) só se a Fase A mostrar adesão real |
| Ambição (pessoal / portfólio / SaaS) | **Em aberto de propósito.** Não trava nada até a v1.3, quando passa a decidir arquitetura (cobrança, isolamento entre grupos) |

## Diagnóstico que motiva a v0.9

1. **Não existe entidade "sessão de treino".** `time-entries.service.ts` infere
   o próximo tipo a partir do último registro: esquecer o check-out faz o botão
   abrir escrito "Finalizar treino" no dia seguinte e pareia um treino de 18h.
   Sem sessão, não há onde pendurar séries e cargas.
2. **Histórico editável e deletável pelo próprio usuário, sem rastro.**
   Inviabiliza qualquer placar ou relatório: dá pra fabricar 30 dias de streak
   em dois minutos.
3. **Supervisor não vê frequência.** `GET /users` devolve nome, e-mail, papel e
   status; o painel aprova conta e nada mais.
4. **Streak diária pune o descanso.** `calcularStreak` conta qualquer registro,
   inclusive um check-in solto de 40 segundos, e não tem dia de folga.
5. **Inteligência toda no cliente, sem fuso e sem paginação.** Streak, sessões
   e semana são calculados em `calculos.ts` com o fuso do dispositivo, e
   `GET /time-entries` devolve o histórico inteiro. No iOS o cache do PWA
   expira após ~7 dias de inatividade — estado de streak no cliente é bug
   garantido.

---

## v0.9 — Fundação — ENTREGUE (2026-08-27)

Estimativa: ~5 a 7 dias de trabalho focado. Nada aqui aparece na tela, e é
justamente por isso que vem primeiro: as demais versões dependem desta camada.

### Checklist

- [x] **Migration**: entidade `WorkoutSession` — `startedAt`, `endedAt`,
      `durationMin`, `status`, `source`, mais `dayKey` (o dia já resolvido no
      fuso do usuário, para a regra de "1 contável por dia" virar `group by`).
- [x] **Migration**: `Group` + `Membership` (mesmo com um grupo só). A migration
      já cria o grupo `gym-monkey` e vincula todos os usuários existentes.
- [x] **Migration**: `User.timezone`, default `America/Sao_Paulo`. A trava de
      "só o supervisor altera" fica na camada de serviço (ainda a fazer).
- [x] **Garantia de banco**: índice único parcial impedindo **duas sessões
      abertas** para a mesma pessoa (`WHERE status = 'OPEN'`). Não dá para furar
      nem com dois cliques simultâneos — não depende da regra de serviço.
- [x] **Auditoria**: tabela `SessionCorrection` (somente-append) com autor,
      motivo e o antes/depois. `authorId` é nulável com `ON DELETE SET NULL`:
      excluir a conta apaga de verdade (LGPD) sem destruir o rastro nem ser
      bloqueado por ele.
- [x] **Backfill**: `npm run backfill-sessoes` converte os `TimeEntry` em
      sessões pareadas, preservando o histórico como auditoria. A lógica vive em
      `src/sessions/backfill.ts` (testada, 12 casos); o script é só a casca.
      Idempotente por usuário, e aceita `userIds` para reprocessar uma pessoa
      só. **Precisa ser rodado à mão em produção**, como o `set-role`.
- [x] **`SessionsService`** com as regras de integridade (tabela abaixo):
      duração mínima, truncamento no máximo, auto-encerramento, cooldown e
      "1 contável por dia". Streak e resumo semanal calculados no servidor, no
      fuso do usuário (`Intl`, sem biblioteca nova). Ainda **sem controller** —
      os endpoints vêm no passo seguinte.
- [x] **Timestamps gerados exclusivamente no servidor**, nunca aceitos do
      cliente (persiste em UTC, agrega no fuso do usuário). A única porta que
      aceita horário do cliente é a correção — e justamente por isso ela é
      auditada e revalidada. O `PATCH /time-entries/:id` antigo continua no ar
      até o cutover da tela.
- [x] **Auditoria imutável**: `PATCH /sessions/:id` exige motivo e grava o
      antes/depois com o autor **na mesma transação** da alteração — não existe
      mudança sem rastro. A correção passa pelas mesmas regras de duração, então
      não é atalho para burlar o mínimo. `GET /sessions/:id/corrections` expõe a
      trilha. Dono corrige o próprio treino; supervisor corrige de qualquer um.
- [x] **`GET /sessions` paginado** (cursor), devolvendo streak e resumo semanal
      já calculados no servidor, e um campo `contavel` por sessão para a tela
      não reimplementar a regra. Cursor em vez de offset porque a lista cresce
      pelo topo. `POST /sessions/toggle` não aceita horário do cliente.
- [~] **Mover a lógica de `calculos.ts` para o backend**: streak e resumo
      semanal já existem no `SessionsService`, com testes próprios. O
      `calculos.ts` do frontend continua no ar até o cutover da tela — por ora
      as duas implementações coexistem de propósito.
- [x] Manter a suíte verde e aplicar as migrations em dev / test / CI / Neon.
      Ao fechar a v0.9: **180 no backend** (66 unitários + 114 e2e) e 134 no
      frontend, todos verdes. Migrations aplicadas em dev, test, CI e **Neon** (2026-08-26), e o
      backfill rodado em produção: 11 sessões criadas a partir de 19 `TimeEntry`,
      todas vinculadas ao grupo, nenhuma `OPEN`. Rodar de novo é seguro
      (idempotência confirmada no próprio Neon).

### Cutover da tela — FEITO

O frontend fala com `/sessions`. As rotas `/time-entries` seguem no ar como
auditoria, mas a tela não as usa mais (há teste garantindo que as funções
antigas não voltem ao `api.ts`).

O que mudou para quem usa:

1. **O botão "excluir registro" saiu.** Histórico apagável pelo próprio usuário
   é o que inviabiliza qualquer placar, então a API de sessões **não tem
   `DELETE`**. Corrigir é o caminho — com motivo obrigatório e com rastro.
2. **O histórico mostra sessões, não check-ins soltos**: uma linha por treino,
   com início, fim e duração.
3. **Sessão que não conta aparece apagada e explicada** ("Abaixo de 20 min: nao
   conta na semana"), para o número da semana ser explicável olhando a lista.
4. **Streak e resumo vêm do servidor**; `calculos.ts` ficou só com formatação e
   agrupamento.
5. **Paginação por cursor** com "Carregar mais".

Dois cuidados que só apareceram ao olhar a tela renderizada, ambos sobre
`AUTO_CLOSED` (fim sintético = início + 6h): a duração mostra **"nao
finalizado"** em vez de "6h", e o **horário de fim não é exibido** — mostrar
"18:00 - 00:00" sugeriria treino até meia-noite.

O teto de correções foi resolvido em 2026-08-27, junto com a trava de datas —
ver "Correção de treino" abaixo.
**Os números da semana caem para quem inflou.** Medido em produção antes de
   rodar o backfill (simulação) e confirmado depois, com resultado idêntico:

   | Pessoa | Treinos/semana antes | Depois | Por quê |
   |---|---|---|---|
   | Gabrielly | 4 | **0** | 10 registros viraram 5 sessões de 0 min |
   | Flavio | 1 | **0** | sessão abaixo de 20 min |
   | Nicolas | 1 | 1 (95 min intactos) | treino real, não muda |

   **Ninguém perdeu streak** — todas já estavam em 0. O que cai são contagens
   que nunca corresponderam a treino de verdade.

### Correção de treino (revisto em 2026-08-27)

A auditoria de segurança olhou de novo a correção e achou o furo mais grave até
agora: a correção era o caminho para **fabricar treino**. Medido no ambiente de
dev, com um usuário comum:

| Passo | Efeito |
|---|---|
| Sessão de **3 min** de hoje, reescrita como 62 min num dia 9 dias atrás | virou `COMPLETED`, contável, e o `dayKey` **mudou** |
| Segunda correção na mesma sessão, movendo para ontem | **streak foi de 1 para 3**; semana de 2 para 3 treinos, 107 → 169 min |

A auditoria registrava as duas correções fielmente. E não impedia nada — o que
mostra a diferença entre *rastrear* e *restringir*.

Três travas, todas com o caso legítimo ("esqueci de finalizar") preservado:

| Trava | Usuário comum | Supervisor |
|---|---|---|
| **O início não se mexe** — é o único dado de onde sai o `dayKey`, ou seja, em que dia o treino conta | `startedAt` recusado (400) | pode, auditado |
| **Uma correção por sessão** — o golpe precisou de duas | 2ª recusada (400) | sem limite |
| **O fim cabe na janela de 6h do início** | vale | **vale também** |

A janela de 6h substitui a ideia de "tem de ser no mesmo dia" de propósito: quem
treina 23:30 e termina 00:30 atravessa a meia-noite legitimamente, e uma regra de
mesmo-dia barraria justo esse caso. Sem a janela, pôr o fim dias depois fazia a
duração ser truncada no teto de 4h e a sessão virar `COMPLETED` — qualquer toque
de 1 segundo virava treino contável de 4 horas.

#### Quarta trava: teto de aumento (2026-08-27, relatado em produção)

As três acima **não bastaram**, e quem achou foi o Flávio, usando o app: ele
iniciou um treino e pôs o fim 4h à frente. Reproduzido: sessão de **1 min → 240
min contáveis**, semana de 0 para 240 min.

O motivo de a janela de 6h não pegar: **4h cabe dentro de 6h**, e 4h é exatamente
o `DURACAO_MAX_MIN`. O abuso vivia na folga entre as duas regras — eu tinha
fechado o teto e o piso, e deixado o meio aberto.

A trava: a correção pode **reduzir a duração à vontade**, mas só pode
**aumentá-la em até 60 min** (`AUMENTO_MAX_CORRECAO_MIN`) para usuário comum.
Reduzir não infla número nenhum; aumentar é a única direção abusável. Supervisor
não tem teto.

Dois detalhes que só apareceram implementando:

- **O aumento é medido na duração bruta, não na classificada.** `classificar`
  trunca em 240 min, então medir na duração já truncada deixaria esticar uma
  sessão de 200 min para 300 (aumento real de 100) parecendo aumento de 40.
- **Em `AUTO_CLOSED` a base é zero, não o `durationMin` gravado.** Ali os 360 min
  são o *teto* de auto-encerramento, não uma medida: a pessoa nunca tocou em
  finalizar. Se fossem a base, corrigir de 360 para 360 seria "aumento zero" e
  entregaria uma sessão contável de 4h de graça.

Medido depois, usuário comum com sessão de 1 min: **+4h → 400**, **+2h → 400**,
**+55min → 200** (55 min, contável). Semana ficou 55 min em vez de 240.

#### Como consertar o que já passou

A trava impede correções novas — **não desfaz** a que já foi feita. Para isso há
`npm run reverter-correcao`, no mesmo padrão do `set-role` e do `backfill`
(lógica em `src/sessions/reverter-correcao.ts`, testada; o script é só a casca).

O valor original **não precisa ser adivinhado**: a linha de `SessionCorrection`
guarda o `startedAtBefore` / `endedAtBefore` / `statusBefore`. É exatamente para
isto que a auditoria existe.

```bash
cd backend
npm run reverter-correcao -- --listar                 # o que foi corrigido, atual vs original
npm run reverter-correcao -- <sessionId>              # SIMULA
npm run reverter-correcao -- <sessionId> --confirmar  # aplica
```

Em produção: `DATABASE_URL` apontando pro Neon. **Simula por padrão** — escrita
exige `--confirmar`, como o backfill.

A reversão **entra na trilha** como uma correção nova, em vez de apagar o que
houve: a auditoria é somente-append, então desfazer também deixa rastro. Senão o
histórico passaria a mentir na direção oposta.

Dois cuidados que os testes cobrem:

- **`AUTO_CLOSED` não vira `COMPLETED` de 4h na volta.** Ali os 360 min gravados
  são o teto do auto-encerramento; passá-los por `classificar` devolveria 240 min
  contáveis — a reversão criaria um treino que nunca existiu.
- **Reverte para a PRIMEIRA correção**, não a última: as seguintes partem de um
  valor já corrigido.

Ensaiado ponta a ponta no ambiente de dev, com o estado corrompido criado pela
API real (linha de auditoria genuína): sessão de 240 min → 1 min `SHORT`, semana
de 240 min → 0, e a trilha ficou com as duas linhas, nada apagado.

> Depois da reversão a sessão fica com duas correções, então o dono **não** pode
> mais corrigi-la (é uma por sessão). Se a pessoa realmente treinou, quem ajusta
> é o supervisor, que não tem esse limite.

#### Retorno na tela (mesmo relato)

A correção não dava nenhum sinal de que funcionou, e o erro aparecia no topo do
card — em celular, muitas vezes fora da tela de quem estava digitando. Agora:

- O **erro aparece dentro do formulário**, e o formulário **fica aberto** com o
  que foi digitado (o erro quase sempre é sobre o horário escolhido; fechar
  obrigaria a redigitar).
- O botão mostra **"Salvando..."** e os campos travam durante o envio. O
  recarregamento acontece **antes** de fechar o formulário, senão a lista velha
  aparecia por um instante como se nada tivesse ocorrido.
- **Confirmação que diz o resultado**, não só "salvo": corrigir para 5 min é
  aceito e a sessão continua não contando — sem essa frase, a pessoa olharia o
  número da semana parado e concluiria que o app errou. A mensagem some sozinha
  depois de alguns segundos.

A resposta da API passou a trazer **`corrigivel`** por sessão, na mesma ideia do
`contavel`: a tela esconde o lápis sem reimplementar a regra.

Medido depois, com usuário comum: mover o dia → 400; fim +10h → 400; **fim +55min
→ 200** (`COMPLETED`, 55 min, contável); segunda correção → 400. O `dayKey` ficou
onde estava.

> Cuidado ao testar: uma conta **supervisor** pode mexer no início por decisão de
> projeto. Testar a trava com conta de supervisor dá falso negativo — foi o que
> aconteceu na primeira tentativa de validação.

### Regras de integridade da sessão

Sem esta camada, toda gamificação premia quem toca no botão duas vezes.

| Regra | Valor | Comportamento |
|---|---|---|
| `DURACAO_MIN` | 20 min | Sessão menor entra no histórico como "sessão curta" e **não** conta para meta, streak, pontos ou placar |
| `DURACAO_MAX` | 4 h | Sessão maior é **truncada** nos minutos e ainda conta como 1 treino (protege quem esqueceu o check-out) |
| Auto-encerramento | 6 h | Sessão aberta há mais de 6h fecha como `AUTO_FECHADA` e não é contável |
| Aumento máximo na correção | 60 min | Reduzir é livre; aumentar além disso exige supervisor |
| Treinos contáveis por dia | 1 | Havendo várias sessões válidas no mesmo dia, conta a mais longa; a soma de minutos do dia continua sendo exibida |
| Cooldown | 30 min | Novo check-in só é aceito 30 min após o último check-out |

---

## Especificações prontas (para quando chegar a vez)

Ficam aqui porque a decisão é sutil e errar custa caro. O resto do roadmap é
trabalho conhecido.

### Meta semanal, streak de semanas e congelamento (v1.0)

`semana` = ISO week, segunda 00:00 a domingo 23:59:59, **no fuso do usuário**.
Job de fechamento na segunda 00:05, idempotente por `(user_id, iso_week)`.

```
treinos = dias distintos com treino contável na semana

se treinos >= meta:
    streak_semanas += 1
    status = CUMPRIDA

senão se tokens_congelamento > 0:
    tokens_congelamento -= 1
    status = CONGELADA          # não avança, mas NÃO zera

senão:
    streak_anterior = streak_semanas   # guardar para o reparo
    streak_semanas = 0
    status = PERDIDA
```

- `meta` = 3 a 6, default **3**. Alteração só vale a partir da semana seguinte
  (impede mudar a meta no domingo para forjar sucesso).
- **Tokens de congelamento**: máximo 2 acumuláveis; novo usuário começa com 2;
  ganha +1 a cada 4 semanas consecutivas `CUMPRIDA`. Aplicação é **automática e
  silenciosa** — o usuário descobre depois, vendo o floco de neve na semana.
- **Reparo**: após uma semana `PERDIDA`, atingir `meta + 1` na semana seguinte
  restaura `streak_anterior + 1`. Um reparo por trimestre.
- **Ausência longa**: 4 semanas ou mais sem sessão válida zera a streak e ativa
  o modo "recomeço", sem nenhuma mensagem de culpa.
- A streak diária continua **exibida como recorde histórico**, nunca punitiva.
  O contador principal da home passa a ser a semana.

Base: 4 ou mais sessões por semana durante 6 semanas é o limiar de formação de
hábito (Kaushal & Rhodes, *J Behav Med* 2015). Os parâmetros de congelamento
seguem o que o Duolingo mediu em teste A/B.

### Pontos e níveis (v1.3)

Replicação do desenho do ensaio **STEP UP** (*JAMA Internal Medicine* 2019,
n=602, 24 semanas), traduzido de "passos/dia" para "treinos/semana". É a
especificação com melhor respaldo causal do plano: estes parâmetros exatos
produziram +920 passos/dia no braço de competição, com +569 mantidos 12 semanas
após o fim da intervenção.

- **Reset toda segunda**: saldo volta para **70 pontos**; não acumula entre
  semanas — o reset é parte do efeito.
- **Perda de 10 pontos**: no fim de cada dia, se
  `dias_restantes < meta − treinos_até_agora`. Quem treina no começo da semana
  nunca perde ponto; quem procrastina começa a sangrar na quinta.
- **Cinco níveis**: azul, bronze, **prata**, ouro, platina. Todo usuário novo
  entra em **prata**, deliberadamente: dá algo a perder desde o dia 1.
- **Fim de semana**: 40 pontos ou mais sobe um nível; abaixo de 40 desce um.
- Nível é **privado** por default — só o usuário e o supervisor veem.

### Placar de grupo, com salvaguardas obrigatórias (v1.3)

- **Top 5 nomeado + a sua própria linha.** Nunca renderizar a lista completa
  ordenada de baixo para cima, nunca destacar o último.
- Quem está abaixo da mediana vê distância, não posição ("falta 1 treino para
  o 5º lugar", não "você é o 27º de 30").
- **Placar de melhoria em paralelo** (quem mais subiu vs. a própria média das 4
  semanas anteriores) — dá vitória possível a iniciantes.
- **Opt-out sem penalidade**; continua ganhando streak, pontos e marcos, e o
  supervisor não é notificado do opt-out.
- Teto anti-inflação: 1 treino por dia conta, logo o máximo semanal é 7.

Motivo: em ambientes só-leaderboard, 31,3% relataram efeito psicológico
negativo da comparação de posição. O próprio Strava criou o *Local Legend*
(premia frequência, não velocidade) porque um ranking único desmotiva a
maioria.

---

## Pedidos novos (2026-08-26)

Anotados a pedido do dono do produto, **sem implementar agora**. Cada um já tem
um lugar natural no roadmap; onde há conflito com algo já decidido, o conflito
está explícito.

### 1. Modo claro e escuro na tela de marcar treino — FEITO (2026-08-27)

Entregue antecipado da v1.1, junto com o polimento mobile. Detalhes de
implementação e o que checar no aparelho estão em
[TESTE-MOBILE](TESTE-MOBILE.md); o resumo:

- Três estados no botão ao lado do nome GYM MONKEY: **automático → claro →
  escuro**. Automático segue `prefers-color-scheme` e continua seguindo em tempo
  real, porque em automático o `<html>` fica **sem** `data-tema` e quem decide é
  o CSS.
- A paleta virou **23 tokens CSS** num só lugar — meio caminho do design system
  da v1.1 já andado.
- A tela de login é **escura sempre** (vai receber fundo com o logo), via um
  atributo separado que não sobrescreve a escolha do usuário.
- `color-scheme` acompanha, então o seletor de data/hora da correção também
  escurece.

Fica **em aberto** um ponto do manifest: o `theme_color` é fixo (`#ff4d3d`) e
manifest não aceita media query, então no app instalado a barra de status pode
continuar vermelha no tema escuro, dependendo da versão do Chrome. A saída, se
incomodar, é fixar `#191919` — barra escura sempre, coerente com a splash.

### 2. Segunda tela: a pessoa monta o treino dela

Referências visuais trazidas pelo dono do produto (3 telas de apps de treino):

| Referência | O que ela mostra | O que aproveitar |
|---|---|---|
| Tela escura, acento verde-neon | Título "Chest, January 20"; barra de progresso "1/4 weekly workouts done"; cards de exercício com miniatura, nome e etiqueta (COMPOUND / ISOLATION); CTA grande "START WORKOUT"; **barra de abas embaixo** com 4 ícones | O layout mais próximo do que queremos: abas (v1.1), progresso semanal (v1.0) e lista de exercícios (v2.0 Fase B) |
| Amarelo e preto, com mascote | Tela de abertura: mascote grande, chamada e botão Start | Nosso macaco tem a mesma energia; serve pra onboarding e pra splash |
| Clara/lilás, "Select a challenge" | Busca, abas *My Workouts / All Workouts / Challenges*, cards de desafio com selo de dificuldade e "Daily challenge" | Desafios e níveis de dificuldade (v1.3) |

Encaixe no roadmap: a tela em si é a **v2.0 Fase B** (catálogo de exercícios,
séries, cargas), e a navegação por abas que ela pressupõe é a **v1.1**. A
decisão já tomada de fazer o registro **em duas fases** continua valendo: a
Fase A (tipo de treino + nota + esforço 1–5 no check-out) vem primeiro e só
passamos pra Fase B se houver adesão real.

Duas ressalvas que não são estilo:

- **CREF**: o usuário montar o **próprio** treino é livre — é exatamente o
  pedido, então está ok. O que não pode é o supervisor **prescrever** ficha pra
  outra pessoa (ver Restrições permanentes).
- **"Daily challenge" briga com o modelo escolhido.** Desafio diário empurra
  streak diária, e a v1.0 move o contador principal justamente pra semana, com
  dia de folga e congelamento. Se entrar, tem que ser como desafio **semanal**
  ou como algo cosmético que não alimente streak/pontos — senão volta a punir
  descanso, que é o que estamos evitando.

### 3. Vários check-ins no mesmo dia inflam o contador semanal

Relato do dono do produto: dá pra abrir e fechar treinos de 1 segundo e ganhar
streak várias vezes no mesmo dia.

**Medido nas funções reais** (5 sessões de 1 segundo no mesmo dia):

| Métrica | Resultado | Leitura |
|---|---|---|
| `calcularStreak` | **1** | A streak **não** multiplica no mesmo dia: ela conta *dias distintos* com registro (`Set` de chaves de dia) |
| `calcularResumoSemanal().treinos` | **5** | O contador semanal **infla 1:1** com as sessões, sem limite por dia |
| `calcularResumoSemanal().minutos` | **0** | Fica o par absurdo "5 treinos essa semana / 0min" |

Então o furo relatado existe, mas mira o **contador semanal**, não a streak. O
que a streak tem de frágil é outra coisa: **1 segundo de treino vale um dia
inteiro** de streak (não há duração mínima), então ela é forjável com um toque
por dia — e não perdoa nenhum dia de folga.

Isso é mais grave do que parece porque a v1.0 promove justamente o número
semanal a **contador principal da home**. O furo está exatamente na métrica que
está prestes a virar a mais visível do app.

Agrava tudo o fato de esses números serem calculados no **cliente**
(`calculos.ts`), sobre o histórico cru, que o próprio usuário pode editar e
apagar.

**Este item já está especificado na v0.9** e é justamente o motivo de ela vir
antes de UI e gamificação. As regras da tabela "Regras de integridade da sessão"
resolvem o caso relatado, combinadas:

| Regra | Valor | Como mata o caso |
|---|---|---|
| `DURACAO_MIN` | 20 min | Sessão de 1 segundo entra como "sessão curta" e **não** conta pra meta, streak nem placar |
| Cooldown | 30 min | Novo check-in só é aceito 30 min depois do último check-out, o que corta a repetição em rajada |
| Treinos contáveis por dia | 1 | Várias sessões válidas no mesmo dia contam **uma** (a mais longa) — é esta que fecha o furo do contador semanal |

Faltam ainda, no mesmo pacote: **timestamps gerados só no servidor**, **streak
calculada no servidor** e **auditoria imutável** (editar cria correção
vinculada, não muta o registro) — sem isso as regras acima seriam contornáveis
pelo cliente.

Nada a decidir aqui, então: é executar a v0.9. O relato só confirma a ordem já
escolhida.

## Auditoria de segurança (2026-08-27)

Levantamento pedido pelo dono do produto antes de um deploy. Cada item foi
**verificado no código e depois atacado** no backend local, não só lido.

### Já resolvido

| Tema | Prova |
|---|---|
| Hash de senha | bcrypt, 10 rounds |
| Rate limit | 30/min global; **5/min** em login e cadastro (8 erros seguidos → `401, 429, 429…`) |
| Queries parametrizadas | Prisma em tudo; a única query crua é `` $queryRaw`SELECT 1` ``, literal. Zero `$queryRawUnsafe` |
| Mass assignment | `whitelist + forbidNonWhitelisted` global. Forçar `status`, `durationMin`, `contavel`, `userId` e `source` na correção → **400 nas 5** |
| Promoção a admin | guard de supervisor na rota; usuário comum → **403** |
| Vazamento entre usuários | `select` explícito (sem `passwordHash`); corrigir treino alheio → **403**; conta nova vê 0 sessões |
| Secrets no Git | varredura de **todos** os commits: `backend/.env` nunca existiu na árvore |

Duas decisões que sustentam o resto: **o papel não vai no token** (o JWT carrega
só `exp/iat/sub`; o papel é lido do banco a cada requisição, então desativar
alguém corta o acesso na requisição seguinte, e token roubado não carrega papel
falso — testado com `sub` trocado, assinatura falsa e `alg=none`: 401 nos três);
e **o login não revela quais e-mails existem**, porque a senha é checada antes
de verificar a aprovação.

### Não se aplica a esta arquitetura

- **Public key do banco / RLS**: vêm do modelo Supabase, onde o navegador fala
  direto com o banco. Aqui só o backend tem `DATABASE_URL`. A "RLS" é a camada
  de serviço, e o isolamento foi provado. RLS só ajudaria contra um backend já
  comprometido — que teria a credencial de todo jeito.
- **Esconder a API**: impossível num SPA (a URL vai no bundle). O que importa é
  tudo exigir token, e só `/health` e `/auth/*` são abertos.
- **Cookie httpOnly**: não usamos cookies. E aqui seria **pior**: front em
  `github.io` e API em `render.com` são origens diferentes, o cookie seria de
  terceiros (`SameSite=None`) — justo o que os navegadores estão desligando. A
  mitigação real é não ter XSS (zero `dangerouslySetInnerHTML`/`eval`) e
  expiração curta (12h, já em vigor).
- **Criptografia por campo**: o Neon já faz TLS e criptografia em repouso, e o
  roadmap proíbe guardar dado sensível. Nome e e-mail não justificam.

### Achados

1. **Rotas de escrita de `/time-entries` ainda no ar.** O cutover tirou da tela,
   não da API. Com um token comum: `POST /time-entries/toggle` → 201;
   `PATCH /time-entries/<id>` aceitou timestamp de 2020 vindo do cliente, sem
   motivo e sem auditoria; `DELETE /time-entries/<id>` → 204, sem rastro. **Não
   afeta os números** (sessões são outra tabela — streak e semana conferidos
   intactos), mas destrói a trilha de `TimeEntry` que o backfill preservou de
   propósito, e é a única porta que ainda aceita horário do cliente sem exigir
   motivo.

   **Corrigido**: `/time-entries` ficou **somente leitura**. `POST /toggle`,
   `PATCH /:id` e `DELETE /:id` foram removidos — 404 para qualquer um,
   inclusive supervisor (não é permissão, a rota não existe). O `GET` continua,
   porque a pessoa tem direito de ver os próprios dados e o histórico antigo é
   auditoria. Há uma trava de regressão no teste unitário: o `TimeEntriesService`
   só pode expor `findAllForUser` — reintroduzir escrita ali quebra a suíte.
2. **Enumeração de e-mail no cadastro**: o 409 revela quem tem conta. Fica para
   a **v1.2**, quando entra verificação por e-mail e o fluxo muda de todo jeito.
3. **Rate limit do login por IP podia trancar o grupo**: eram 5/min por IP e na
   academia todos saem pelo mesmo IP, então quem errasse a senha travava o login
   dos outros — rate limit virando negação de serviço contra o próprio grupo.

   **Corrigido**: o login passou a contar por **(IP + e-mail)**, num throttler
   `por-conta` que só vale nas rotas marcadas com `@LimitePorConta()`. O teto
   por IP continua existindo (o throttler `default`, 30/min nesta rota), então um
   único IP não pode rodar e-mails diferentes à vontade. O e-mail é normalizado
   como no `AuthService`, senão alternar maiúsculas daria cota nova a cada
   variação.

   Medido depois da mudança, duas contas do mesmo IP: Ana errando 7x →
   `401, 401, 401, 401, 401, 429, 429`; Bruno, no mesmo IP, → `401` (passou).
   Ana com o e-mail em caixa alta → `429` (sem cota nova).
4. **Rotar a senha do Neon** — pendência do dono (ela passou por chat).

## Roadmap resumido (v1.0 → v2.x)

| Versão | Foco | Itens principais |
|---|---|---|
| **v1.0** | Hábito honesto | Meta semanal, streak de semanas, congelamento, recorde pessoal + prêmio na quebra, ~15 marcos curados, heatmap do ano, *fresh start* na segunda e no dia 1º |
| **v1.1** | Front melhor | Router e abas (Hoje/Histórico/Grupo/Perfil), **offline-first com fila de sync**, design system + **dark mode (pedido explícito)**, onboarding de instalação PWA, comprovante compartilhável |
| **v1.2** | Supervisor | Painel "quem sumiu", **aprovação por e-mail**, fila de sessões suspeitas, padrinho/accountability, export CSV/PDF, melhor horário do grupo |
| **v1.3** | Social | Multi-grupo com convite por link, placar semanal com salvaguardas, pontos STEP UP, duelo 1x1 de 7 dias, kudos, retrospectiva mensal/anual |
| **v1.4** | Notificações | Recap semanal **por e-mail primeiro** (100% da base), Web Push Android-first com agendamento no servidor, teto duro de 3 por semana |
| **v2.0** | Registro de treino | Fase A: tipo de treino + nota + esforço 1 a 5 no check-out (~1–2 dias). Fase B: catálogo de exercícios, séries, cargas, PRs, gráficos — **só se a Fase A mostrar adesão** |
| **v2.x** | Condicional | Geofence / QR de validação de local — **só contra fraude observada**, não imaginada |

**Ponto de decisão na v1.3**: é onde a ambição (pessoal / portfólio / SaaS)
passa a decidir arquitetura. Até lá, não é preciso responder.

---

## Restrições permanentes do produto

Valem para todas as versões. Não são preferência de estilo.

1. **Nunca notificar terceiros sobre a inatividade de alguém.** O placar mostra
   quem **fez**, jamais quem faltou. Em grupo fechado onde todos se conhecem, o
   risco não é comparação abstrata — é vergonha.
2. **Não somos registrador de ponto eletrônico.** A Portaria MTP 671/2021 exige
   do REP-P registro de programa no INPI, arquivos AFD e AEJ assinados,
   comprovante ao trabalhador, espelho mensal e retenção por 5 anos.
   Consequências práticas: tirar "ponto", "jornada" e "hora extra" de todo
   texto visível; Termos de Uso vedando expressamente o uso para controle de
   jornada; e o export da v1.2 chamado **"Relatório de frequência de atividade
   física"**, com aviso no cabeçalho. Antes de vender para RH, validar com
   advogado trabalhista.
3. **Zero biometria e zero dado clínico** (LGPD art. 5º, II e art. 11) — sem
   foto, peso, medida, lesão ou bioimpedância. Se houver geofence, gravar
   apenas `validado: true/false` e o id do local, **descartando as
   coordenadas**. O supervisor vê frequência, nunca as anotações pessoais do
   usuário. Retenção declarada e exclusão de conta que realmente apaga.
4. **CREF (Lei 9.696/1998)**: o usuário registrar o próprio treino é livre; o
   supervisor **prescrever** ficha para outra pessoa é atividade privativa de
   profissional registrado. Foi por isso que "supervisor monta o treino" ficou
   fora deste roadmap.

## Armadilhas descartadas de propósito

IA que monta treino (nosso modelo de dados — dois timestamps — não contém
informação para prescrever nada); integração com wearables (HealthKit exige app
nativo e somos PWA); biblioteca de vídeos e aulas (o Nike Training Club é
inteiramente grátis); ranking global entre estranhos; gamificação paga (foi o
ponto mais atacado do Garmin Connect+); liga com rebaixamento (inviável em
grupo de 20 pessoas que se conhecem); financeiro e integração com catraca (core
dos ERPs, guerra perdida); avaliação física e bioimpedância (dado sensível).

## Pendências em aberto

- **Ambição do projeto** — pessoal, portfólio ou SaaS. Decidir até a v1.3.
- **Cold start do Render.** No plano free o backend dorme após 15 min e o
  primeiro acesso leva 30–60s. Isso briga diretamente com engajamento: o app
  que se quer abrir na porta da academia é o que mais sofre. Resolver antes da
  v1.4.
- **Provedor de e-mail transacional** — necessário na v1.2.
- **Renomear "registro de ponto"?** Está no README, no `TimeEntry` e na
  descrição do pacote. A troca é barata hoje e fica mais cara a cada versão.
