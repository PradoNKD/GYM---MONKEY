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

**Login no `dev:mobile`**: por padrão o front aponta pra API de produção, e o
CORS de lá só libera o origin do GitHub Pages — então o **login não funciona**
a partir do origin da rede local. Pra testar o fluxo com login no aparelho, use
o cenário 2. (Se um dia precisar de login no `dev:mobile`, seria preciso subir o
backend local em HTTPS e liberar o origin da LAN no CORS — não vale a pena por
enquanto.)

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

> Nota de design: a splash agora é escura e o app é claro (`#f4f4f2`), então há
> um "pulo" de claro/escuro na abertura. Se incomodar, as saídas são deixar a
> splash clara de novo ou escurecer a primeira tela do app.

**Como validar de verdade**: splash e ícone só aparecem com o app **instalado**,
e nenhum navegador de desktop reproduz isso — nem o navegador embutido, que não
instala PWA. Confirme no Android real: Chrome → menu → *Instalar app* /
*Adicionar à tela inicial*, e feche e abra pelo ícone. Depois de trocar o
manifest, **desinstale e reinstale**: o Android guarda a splash e o ícone de
quando o app foi instalado.
