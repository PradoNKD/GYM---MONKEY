import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ShieldCheck, User as UserIcon, X } from "lucide-react";
import { ApiError, atualizarUsuario, listarUsuarios } from "./api";
import { BotaoTema } from "./BotaoTema";
import { useAuth } from "./AuthContext";
import type { UsuarioAdmin } from "./types";

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const { token, user } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!token) return;
    listarUsuarios(token)
      .then(setUsuarios)
      .catch((e) =>
        setErro(e instanceof ApiError ? e.message : "Nao foi possivel carregar os usuarios"),
      )
      .finally(() => setCarregando(false));
  }, [token]);

  useEffect(() => carregar(), [carregar]);

  async function aplicar(id: string, data: { active?: boolean; role?: "USER" | "SUPERVISOR" }) {
    if (!token) return;
    setSalvandoId(id);
    setErro(null);
    try {
      const atualizado = await atualizarUsuario(token, id, data);
      setUsuarios((atual) => atual.map((u) => (u.id === id ? atualizado : u)));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Nao foi possivel atualizar o usuario");
    } finally {
      setSalvandoId(null);
    }
  }

  const pendentes = usuarios.filter((u) => !u.active);
  const ativos = usuarios.filter((u) => u.active);

  function renderUsuario(u: UsuarioAdmin) {
    const ehEuMesmo = u.id === user?.id;
    const salvando = salvandoId === u.id;

    return (
      <li key={u.id} className="linha-registro admin-linha">
        <div className="admin-usuario">
          <span className="admin-nome">
            {u.role === "SUPERVISOR" ? <ShieldCheck size={15} /> : <UserIcon size={15} />}
            {u.name}
            {ehEuMesmo && <span className="admin-voce">voce</span>}
          </span>
          <span className="admin-email">{u.email}</span>
        </div>

        <div className="admin-acoes">
          {u.active ? (
            <button
              type="button"
              className="btn-mini btn-mini--perigo"
              disabled={salvando || ehEuMesmo}
              title={ehEuMesmo ? "Voce nao pode se desativar" : "Desativar"}
              onClick={() => aplicar(u.id, { active: false })}
            >
              <X size={14} /> Desativar
            </button>
          ) : (
            <button
              type="button"
              className="btn-mini btn-mini--ok"
              disabled={salvando}
              onClick={() => aplicar(u.id, { active: true })}
            >
              <Check size={14} /> Aprovar
            </button>
          )}

          {u.role === "SUPERVISOR" ? (
            <button
              type="button"
              className="btn-mini"
              disabled={salvando || ehEuMesmo}
              title={ehEuMesmo ? "Voce nao pode se rebaixar" : "Tornar usuario comum"}
              onClick={() => aplicar(u.id, { role: "USER" })}
            >
              Tornar usuario
            </button>
          ) : (
            <button
              type="button"
              className="btn-mini"
              disabled={salvando}
              onClick={() => aplicar(u.id, { role: "SUPERVISOR" })}
            >
              Tornar supervisor
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <main className="card">
      <div className="card-header">
        <button type="button" className="link-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <h1>Painel</h1>
        <BotaoTema />
      </div>

      {erro && <p className="auth-erro">{erro}</p>}
      {carregando && <p className="admin-vazio">Carregando...</p>}

      {!carregando && (
        <>
          <section className="secao">
            <h2 className="secao-titulo">
              Aguardando aprovacao {pendentes.length > 0 && `(${pendentes.length})`}
            </h2>
            {pendentes.length === 0 ? (
              <p className="admin-vazio">Ninguem pendente.</p>
            ) : (
              <ul className="lista-registros">{pendentes.map(renderUsuario)}</ul>
            )}
          </section>

          <section className="secao">
            <h2 className="secao-titulo">Ativos ({ativos.length})</h2>
            <ul className="lista-registros">{ativos.map(renderUsuario)}</ul>
          </section>
        </>
      )}
    </main>
  );
}
