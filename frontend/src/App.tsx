import "./App.css";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { PontoScreen } from "./PontoScreen";

function AppContent() {
  const { token } = useAuth();
  return token ? <PontoScreen /> : <AuthScreen />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
