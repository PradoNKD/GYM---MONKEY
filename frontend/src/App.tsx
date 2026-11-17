import { useState } from "react";
import "./App.css";
import { AdminScreen } from "./screens/AdminScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthScreen } from "./screens/AuthScreen";
import { InstallPrompt } from "./components/InstallPrompt";
import { PontoScreen } from "./screens/PontoScreen";

function AppContent() {
  const { token, user } = useAuth();
  const [view, setView] = useState<"ponto" | "admin">("ponto");

  if (!token) return <AuthScreen />;

  const ehSupervisor = user?.role === "SUPERVISOR";

  if (view === "admin" && ehSupervisor) {
    return <AdminScreen onBack={() => setView("ponto")} />;
  }

  return (
    <PontoScreen onOpenAdmin={ehSupervisor ? () => setView("admin") : undefined} />
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <InstallPrompt />
    </AuthProvider>
  );
}

export default App;
