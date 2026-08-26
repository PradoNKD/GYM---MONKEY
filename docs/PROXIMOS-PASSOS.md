# Próximos passos — v0.9 em diante

Atividades **em aberto**. Este documento existe pelo mesmo motivo do
[HANDOFF](HANDOFF.md): vive no repositório para que um `git clone` entregue o
contexto inteiro, sem depender de histórico de chat.

Última atualização: 2026-08-26.

Origem: análise de mercado de apps de academia (apps globais, mercado
brasileiro e evidência de gamificação) cruzada com auditoria do código.
Documento visual completo:
<https://claude.ai/code/artifact/41226593-1b31-44fc-91b5-e7f41f23d6b2>

---

## Estado atual

App **no ar** (ver [HANDOFF](HANDOFF.md)), com autenticação, papel de
supervisor, aprovação de contas, check-in/check-out, streak diária, resumo
semanal e PWA. Modelo de dados: `User` + `TimeEntry`. Nada da v0.9 foi
iniciado.

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

## v0.9 — Fundação (em aberto)

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
- [ ] **Backfill**: converter os `TimeEntry` existentes em sessões pareadas,
      preservando o histórico atual como registro de auditoria. **Fica em
      script testável, não na migration** (o pareamento e o `dayKey` no fuso
      certo pedem teste); logo, precisa ser rodado à mão em produção, como o
      `set-role`.
- [ ] **`SessionsService`** com as regras de integridade (tabela abaixo).
- [ ] **Timestamps gerados exclusivamente no servidor**, nunca aceitos do
      cliente. Persistir em UTC; agregar no fuso do usuário.
- [ ] **Auditoria imutável**: editar não muta o registro — cria uma correção
      vinculada, com autor e motivo.
- [ ] **`GET /sessions` paginado** (cursor), devolvendo streak, meta e resumo
      semanal já calculados no servidor.
- [ ] **Mover a lógica de `calculos.ts` para o backend**; reescrever os testes
      de `calculos.ts` como testes de service.
- [ ] Manter a suíte verde (216 testes hoje) e aplicar a migration em
      dev / test / CI / Neon.

### Regras de integridade da sessão

Sem esta camada, toda gamificação premia quem toca no botão duas vezes.

| Regra | Valor | Comportamento |
|---|---|---|
| `DURACAO_MIN` | 20 min | Sessão menor entra no histórico como "sessão curta" e **não** conta para meta, streak, pontos ou placar |
| `DURACAO_MAX` | 4 h | Sessão maior é **truncada** nos minutos e ainda conta como 1 treino (protege quem esqueceu o check-out) |
| Auto-encerramento | 6 h | Sessão aberta há mais de 6h fecha como `AUTO_FECHADA` e não é contável. Uma correção manual por mês, sujeita ao supervisor |
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

### 1. Modo claro e escuro na tela de marcar treino

Hoje o app é claro e fixo (`#f4f4f2`), com o escuro `#191919` só em textos, no
botão de finalizar e na splash do Android. O pedido é ter os dois temas na tela
de ponto.

Já previsto na **v1.1** ("design system + dark mode"). O pedido só o torna
prioritário dentro dela. Pontos de atenção quando chegar a vez:

- Vale respeitar `prefers-color-scheme` **e** deixar o usuário forçar um tema —
  quem treina de madrugada quer escuro independente do sistema.
- O `theme_color` do manifest (hoje vermelho) pinta a barra de status e
  precisaria acompanhar o tema.
- A splash é escura e o app é claro; com o tema escuro a abertura fica coesa,
  o que resolve de graça o "pulo" anotado em [TESTE-MOBILE](TESTE-MOBILE.md).
- Fazer via tokens CSS (custom properties) já é meio caminho do design system.

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
