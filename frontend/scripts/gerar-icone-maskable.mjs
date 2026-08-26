// Gera os icones "maskable" do Android a partir de public/icon-512.png.
//
// Por que existe: o Android monta a splash e o icone da tela inicial com o
// manifest. Sem um icone `purpose: "maskable"` ele encaixa o nosso icone numa
// placa branca; e a arte original e um quadrado arredondado cujos cantos de
// FORA sao brancos, o que reforcava a sensacao de "tudo branco".
//
// O que fazemos: a arte original tem uma faixa clara de ~37px SO no topo
// (medido em scripts/analisa-icone.mjs); recortamos essa faixa, reduzimos a
// arte para caber na "zona segura" que o Android garante (o launcher recorta
// as bordas) e compomos sobre o escuro da marca.
//
// Rodar: npm run gerar-icones
import sharp from 'sharp'

const ORIGEM = 'public/icon-512.png'
const FUNDO = '#191919' // escuro da marca; mesma cor do background_color do manifest
const LADO = 512
const ARTE = 400 // ~78% -> deixa margem pro recorte do launcher
const RAIO = 72 // arredondamento suave; o launcher aplica a mascara dele por cima
const MARGEM = Math.round((LADO - ARTE) / 2)
// Recorte da origem: pula a faixa clara do topo e tira o mesmo tanto dos lados
// pra sobrar um quadrado limpo.
const CORTE = { left: 20, top: 40, width: 472, height: 472 }

// Mascara: mantem so o que esta dentro do quadrado arredondado.
const mascara = Buffer.from(
  `<svg width="${ARTE}" height="${ARTE}"><rect width="${ARTE}" height="${ARTE}" rx="${RAIO}" ry="${RAIO}" fill="#fff"/></svg>`,
)

const arteRecortada = await sharp(ORIGEM)
  .extract(CORTE)
  .resize(ARTE, ARTE, { fit: 'cover' })
  .ensureAlpha()
  .composite([{ input: mascara, blend: 'dest-in' }])
  .png()
  .toBuffer()

await sharp({
  create: { width: LADO, height: LADO, channels: 4, background: FUNDO },
})
  .composite([{ input: arteRecortada, top: MARGEM, left: MARGEM }])
  .png()
  .toFile('public/icon-maskable-512.png')

await sharp('public/icon-maskable-512.png')
  .resize(192, 192)
  .png()
  .toFile('public/icon-maskable-192.png')

console.log(`gerado: icon-maskable-512.png e icon-maskable-192.png (arte ${ARTE}px, raio ${RAIO}, fundo ${FUNDO})`)
