import { useState } from "react";
import "./App.css";
import { AdminScreen } from "./AdminScreen";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { InstallPrompt } from "./InstallPrompt";
import { PontoScreen } from "./PontoScreen";

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
