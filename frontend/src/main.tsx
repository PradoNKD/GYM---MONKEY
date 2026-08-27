import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { aplicarTema, lerTemaSalvo } from './tema'

// Antes de montar o React, e nao dentro de um componente: assim a tela de
// login ja abre no tema escolhido (o botao de tema so existe depois de
// entrar) e ninguem ve o app piscar claro antes de escurecer.
aplicarTema(lerTemaSalvo())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
