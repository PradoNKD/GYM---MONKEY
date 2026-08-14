import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { ApiError } from "./api";

export function AuthScreen() {
  const { login, cadastrar } = useAuth();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      if (modo === "login") {
        await login(email, password);
      } else {
        await cadastrar(name, email, password);
      }
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Nao foi possivel conectar ao servidor");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="card">
      <div className="brand">
        <img src="/icon-192.png" alt="" className="mascot" width={32} height={32} />
        <h1>GYN MONKEY</h1>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {modo === "cadastro" && (
          <input
            type="text"
            placeholder="Nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        )}

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={6}
          required
        />

        {erro && <p className="auth-erro">{erro}</p>}

        <button type="submit" className="btn btn--checkin" disabled={carregando}>
          {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <button
        type="button"
        className="link-btn"
        onClick={() => {
          setErro(null);
          setModo((atual) => (atual === "login" ? "cadastro" : "login"));
        }}
      >
        {modo === "login" ? "Nao tem conta? Cadastre-se" : "Ja tem conta? Entrar"}
      </button>
    </main>
  );
}
