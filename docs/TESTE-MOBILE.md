# Testar no celular (iPhone/Android)

Como validar o app em um dispositivo real — o ponto mais importante do produto.
Há dois cenários; use o que couber.

## 1. Iterar rápido na interface e na instalação (dev via HTTPS na rede local)

Serve pra mexer no layout e na dica de instalação e ver no aparelho na hora. O
PWA (service worker) só registra em HTTPS fora do `localhost`, por isso o dev
sobe com um certificado autoassinado.

```bash
cd frontend
npm run dev:mobile
```

O Vite imprime as URLs de rede, por exemplo:

```
➜  Network: https://192.168.8.34:5173/
```

No **iPhone**, na **mesma rede Wi-Fi**:

1. Abra essa URL de rede **no Safari** (não no Chrome — no iOS só o Safari
   instala PWA).
2. O Safari vai avisar que o certificado não é confiável (é autoassinado):
   toque em **Mostrar detalhes → Visitar este site**.
3. Para instalar: **Compartilhar** (ícone de caixa com seta) → **Adicionar à
   Tela de Início**. Dica: esse item **não aparece em aba privada**.

> Limitação: com certificado autoassinado o iOS às vezes se recusa a registrar
> o service worker. Se a instalação não colar por causa disso, use o cenário 2
> (produção) pra validar a instalação de verdade — o `dev:mobile` ainda vale
> pra ajustar layout e a dica na tela.

**Login no `dev:mobile` — funciona** (mudou em 2026-08-27). Antes não dava: a
página é servida em HTTPS (pro service worker registrar) e o backend local é
HTTP, e o navegador bloqueia essa mistura. Apontar pra API de produção também
não resolvia, porque o CORS de lá só libera o origin do GitHub Pages.

A solução foi o **proxy do próprio dev server**: `.env.mobile` aponta
`VITE_API_URL=/api`, e o `vite.config.ts` encaminha `/api` pra
`http://localhost:3000`. O celular fala só HTTPS com o Vite, que repassa em HTTP
dentro do PC. Como tudo fica na mesma origem, **não há CORS pra configurar**.

Ou seja: suba os dois e teste o fluxo completo na rede local.

```bash
cd backend  && npm run start:dev    # porta 3000
cd frontend && npm run dev:mobile   # porta 5173, HTTPS, escutando na rede
```

## 2. Validar o fluxo completo, com login (produção)

Pra testar de ponta a ponta no aparelho (login, check-in, painel, instalação
com certificado real), use o ambiente que já está no ar:

- **URL**: <https://pradonkd.github.io/GYM---MONKEY/>
- Abra no **Safari** do iPhone e instale como acima (passo 3).
- Certificado é válido (GitHub Pages), então o service worker registra normal e
  a instalação funciona de verdade.

Lembrete: o backend no Render (plano free) **dorme após ~15 min**; o primeiro
acesso depois de parado leva ~30–60s (cold start). Se a tela demorar, é isso —
espere e recarregue.

## O que já está no app pra ajudar na instalação

- Metatags de iOS (`apple-mobile-web-app-*`) pra abrir em tela cheia quando
  instalado.
- `InstallPrompt`: aviso dispensável que aparece só quando faz sentido — no
  iPhone/Safari fora do modo instalado, ensina o caminho do Compartilhar; em
  outro navegador do iOS, manda abrir no Safari; no Android/desktop com suporte
  nativo, mostra o botão **Instalar**.

## Android: splash e ícone

No Android o Chrome monta a splash **apenas** com três campos do manifest:
`background_color` + o ícone de 512 + `name`. O `theme_color` **não** entra na
splash — ele só pinta a barra de status. Confundir os dois é o erro comum.

Duas correções já aplicadas (a splash antes saía toda branca):

1. **`background_color` = `#191919`** (era `#f4f4f2`, um branco-gelo — era essa
   a "splash branca").
2. **Ícones `purpose: "maskable"`**. Sem eles o Android encaixa o ícone dentro
   de uma placa branca. A arte original tinha ainda uma faixa clara de ~37px
   **só no topo**, que aparecia como uma tarja branca; o gerador recorta essa
   faixa, reduz a arte para a zona segura (80% do lado, porque o launcher
   recorta as bordas) e compõe sobre o `#191919`.

Para regerar os ícones maskable depois de trocar a arte:

```bash
cd frontend
npm run gerar-icones
```

O script é `scripts/gerar-icone-maskable.mjs` (usa `sharp`, devDependency). Ele
lê `public/icon-512.png` e escreve `public/icon-maskable-{192,512}.png`.

> Nota de design: **resolvido em parte pelo tema escuro** (ver a seção abaixo).
> No tema escuro a abertura ficou contínua, porque a splash já era `#191919`. No
> tema claro o "pulo" continua — e a tela de login agora é sempre escura, o que
> encurta o salto.

**Como validar de verdade**: splash e ícone só aparecem com o app **instalado**,
e nenhum navegador de desktop reproduz isso — nem o navegador embutido, que não
instala PWA. Confirme no Android real: Chrome → menu → *Instalar app* /
*Adicionar à tela inicial*, e feche e abra pelo ícone. Depois de trocar o
manifest, **desinstale e reinstale**: o Android guarda a splash e o ícone de
quando o app foi instalado.

## Tema claro/escuro

**Dois** estados no botão ao lado do nome GYM MONKEY: ele mostra o ícone do tema
que o toque vai aplicar.

Não existe um terceiro estado "automático" na tela, e não precisa. Seguir o
celular (`prefers-color-scheme`) é o comportamento de **quem nunca tocou no
botão** — ninguém escolhe isso, é o ponto de partida. E o botão só grava uma
escolha quando ela **difere** do aparelho: voltar para o tema que o celular já
pede apaga a escolha e devolve o automático. Assim um botão de dois estados
nunca tranca ninguém fora do modo automático.

Como está montado:

- A paleta são **tokens CSS** no `index.css` (`--fundo`, `--texto`, `--marca`…).
  Nenhuma regra do `App.css` escreve cor crua. Trocar de tema é redefinir os
  tokens, não duplicar regra de layout.
- Sem escolha explícita, o `<html>` fica **sem** `data-tema`, de propósito: assim
  quem decide é o `@media (prefers-color-scheme: dark)`, que o navegador reavalia
  sozinho. Gravar o tema resolvido ali prenderia o app num tema.
- O tema é aplicado no `main.tsx`, **antes** do React montar — a tela de login
  já abre no tema certo e não pisca claro antes de escurecer.
- A **tela de login é escura sempre** (vai receber um fundo com o logo). Ela usa
  um atributo separado (`data-tela`), com prioridade maior no CSS, pra não
  sobrescrever a escolha do usuário.
- `color-scheme` acompanha o tema. Sem isso, o seletor de data/hora da correção
  abriria um calendário branco no meio do app escuro.

### O que checar no Android

A barra de status é o ponto de atenção. No navegador ela acompanha o tema (é o
`<meta name="theme-color">`, atualizado por JS). Já no app **instalado**, o
Android lê o `theme_color` do manifest ao abrir — e **manifest não aceita media
query**, o valor é fixo (`#ff4d3d`). O Chrome novo acompanha a troca do meta,
mas isso varia com a versão.

Se no seu aparelho a barra ficar vermelha com o app escuro, o ajuste é trocar o
`theme_color` do manifest para `#191919`. Aí ela fica escura sempre, inclusive
no tema claro — coerente com a splash, que já é escura.

Em **Android 9 ou anterior** não existe tema escuro do sistema (chegou no
Android 10), então "automático" fica sempre claro nesses aparelhos. Claro e
escuro forçados funcionam normalmente.

## Polimento de toque e área segura

Corrigido em 2026-08-27, tudo achado auditando a tela num iPhone SE:

| Problema | Correção |
|---|---|
| `min-height: 100vh` | `100dvh` — o fim da tela não fica atrás da barra do navegador |
| `viewport-fit=cover` sem `env()` | `padding` do `body` respeita as áreas seguras (notch, barra de gestos) |
| Dica de instalação cobria o fim do card | ela põe uma classe no `<body>` que reserva a própria altura |
| Alvos de toque de 22–23px | `min-height`/`min-width` de **44px** em `.icon-btn`, `.link-btn` e `.btn-mini` |
| Rolagem dentro de rolagem no histórico | abaixo de 480px a lista cresce e quem rola é a página |
| Flash azul do WebKit ao tocar | `-webkit-tap-highlight-color: transparent` + `:active` próprio |
| `Sair (Nome Sobrenome)` estourava o header | só o primeiro nome |

O card também deixou de centralizar com `align-items: center` e passou a usar
`margin: auto`. Parece igual e não é: com `align-items`, conteúdo mais alto que
a tela é cortado no topo **sem** como rolar até ele.
