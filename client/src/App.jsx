import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VaultProvider } from './contexts/VaultContext';
import AuthScreens from './components/AuthScreens';
import VaultDashboard from './components/VaultDashboard';

// Wrapper to handle conditional rendering based on auth state
const AppContent = () => {
  const { user, masterPassword } = useAuth();

  if (!user || !masterPassword) {
    return <AuthScreens />;
  }

  return (
    <VaultProvider>
      <VaultDashboard />
    </VaultProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
