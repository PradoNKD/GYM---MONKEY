# Manter o backend acordado

O backend roda no plano free do Render, que **derruba o serviço depois de ~15
minutos sem tráfego**. Acordar custa caro: medido em 2026-09-10, com o serviço
dormindo havia 7 dias, a primeira chamada levou **73 segundos** até o primeiro
byte. Já acordado, a mesma chamada leva **0,86 s**.

Esperar mais de um minuto na porta da academia é o que faz desistir de usar o
app. Por isso alguém precisa manter o serviço acordado.

---

## Por que não é um workflow do GitHub Actions

Foi a primeira tentativa (10/09) e **não funcionou**. O workflow
`manter-acordado.yml` pedia um ping de 5 em 5 minutos. Medido em 16/09, sobre
142 horas de operação:

| | |
|---|---|
| Intervalo pedido | 5 min |
| Intervalo **mediano real** | **139 min** |
| Menor intervalo observado | **92 min** |
| Maior | 589 min (~10 h) |
| Intervalos acima dos 15 min de sono | **29 de 29 — 100 %** |

O GitHub disparou **40 vezes onde caberiam ~1.368** — 3 % do combinado. O menor
intervalo que chegou a acontecer já era **seis vezes** o limite de sono. Ou
seja, o serviço dormia entre cada par de pings, sem exceção: o ping não estava
atrasado, ele era inútil.

O agendador do Actions não tem hora certa e descarta execuções sob carga —
especialmente cron de alta frequência em repositório público. O workflow foi
removido em 16/09.

**O modo de falha é o que ensina.** O workflow tinha tratamento de erro para
"ping que erra em silêncio": se `/health` não devolvesse 200, ele falhava alto.
Mas os pings **não erravam** — as 40 execuções passaram. Eles simplesmente não
eram chamados. Nenhuma verificação *dentro* de uma tarefa agendada consegue ver
que a tarefa não rodou; só medir de fora revela isso. Vale para qualquer coisa
agendada daqui em diante: **verificar que o trabalho aconteceu é diferente de
verificar que ele deu certo.**

---

## O que usar: cron-job.org

Gratuito, e dispara de verdade. A escolha dele em vez do UptimeRobot tem um
motivo concreto: **ele permite restringir horários**, e isso decide se a conta
do Render estoura ou não.

### A restrição de horário não é detalhe

O plano free do Render dá **750 horas de instância por mês**. Acordado o mês
inteiro consome **~744** — cabe, mas sem folga nenhuma, e **estoura se houver
qualquer outro serviço free na mesma conta**. Pingando só das 5h às 24h o
consumo cai para **~590 h/mês**, com margem. Ninguém faz check-in de treino às
3 da manhã.

### Configuração

1. Criar conta em <https://cron-job.org> e confirmar o e-mail.
2. **Create cronjob**, com:

   | Campo | Valor |
   |---|---|
   | Title | `GYM MONKEY - manter acordado` |
   | URL | `https://gym-monkey-api.onrender.com/health` |
   | Method | `GET` |
   | Timezone | **`America/Sao_Paulo`** |
   | Schedule | *Every 5 minutes*, restrito às **horas 5 a 23** |
   | Notificação de falha | ligada (e-mail) |

   O fuso é o que permite escrever as horas direto em horário de Brasília, sem
   converter para UTC.

3. Salvar e usar **Test run** para conferir que responde `200`.

### O primeiro disparo pode aparecer como falha — e está certo

Se o serviço estiver dormindo, a primeira chamada leva ~73 s e o cron-job.org
provavelmente vai marcar **timeout**. **Ela acordou o servidor mesmo assim**: a
requisição chegou ao Render e ele começou a subir a instância; o cliente ter
desistido não interrompe isso. A partir daí os pings são regulares, o serviço
não dorme mais e as respostas voltam em menos de 1 s.

Ou seja: **um timeout isolado no começo é esperado. Timeouts repetidos, não** —
aí é sinal de que o serviço está caindo por outro motivo.

---

## A rede de segurança continua no cliente

O monitor externo reduz o problema, não elimina o risco: conta pode expirar,
serviço de terceiro pode cair, e o Render reinicia por conta própria em deploy.
Por isso a **janela de nova tentativa de 90 s** em
[`frontend/src/rede.ts`](../frontend/src/rede.ts) **fica onde está**. Ela é o
que garante que o app funciona mesmo quando o monitor falhar — só que devagar.

Se um dia a medição do cold start subir acima dos 73 s conhecidos, o número
certo é **o medido**, não o que a documentação do fornecedor promete. Foi
exatamente esse erro que fez a primeira janela ser de 27 s.

---

## Como saber se está funcionando

```bash
curl -s -o /dev/null -w 'primeiro byte: %{time_starttransfer}s\n' \
  https://gym-monkey-api.onrender.com/health
```

- **< 2 s** → acordado, o monitor está cumprindo o papel.
- **> 30 s** → estava dormindo. Conferir o histórico no painel do cron-job.org.

Vale medir fora da janela de ping (de madrugada) para confirmar que o serviço
**dorme quando deve** — se ele estiver acordado às 3h, a restrição de horário
não está valendo e o consumo vai para ~744 h/mês.
