import { LogOut, ShieldCheck } from "lucide-react";
import type { Usuario } from "./types";

/**
 * Aba **Perfil**: quem esta logado e o que sai do caminho do dia a dia.
 *
 * Antes das abas, "Painel" e "Sair" moravam no cabecalho, ao lado do nome do
 * app. Sair e uma acao rara e irreversivel na pratica (obriga a logar de novo),
 * e ficava a um toque de distancia do botao de treino -- num alvo pequeno, no
 * topo, em celular. Aqui ela custa dois toques, o que e o preco certo.
 *
 * O botao de tema **nao** vem pra ca: ele fica ao lado do nome GYM MONKEY por
 * pedido explicito do dono do produto, e trocar tema e algo que se faz olhando
 * a tela que se quer ver mudar.
 */
export function PerfilScreen({
  user,
  onOpenAdmin,
  onLogout,
}: {
  user: Usuario | null | undefined;
  onOpenAdmin?: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="secao">
      <h2 className="secao-titulo">Perfil</h2>

      <div className="perfil-identidade">
        <p className="perfil-nome">{user?.name ?? "—"}</p>
        {user?.email && <p className="perfil-email">{user.email}</p>}
        {user?.role === "SUPERVISOR" && (
          <p className="perfil-papel">
            <ShieldCheck size={13} />
            Supervisor
          </p>
        )}
      </div>

      <div className="perfil-acoes">
        {onOpenAdmin && (
          <button type="button" className="btn-mini" onClick={onOpenAdmin}>
            <ShieldCheck size={14} />
            Painel do supervisor
          </button>
        )}
        <button type="button" className="btn-mini" onClick={onLogout}>
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </section>
  );
}
