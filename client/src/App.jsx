import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VaultProvider, useVault } from './contexts/VaultContext';
import { UIProvider } from './contexts/UIContext';
import AuthScreens from './components/AuthScreens';
import VaultDashboard from './components/VaultDashboard';
import './index.css';

function AppContent() {
  const { user } = useAuth();
  return user ? (
    <VaultProvider>
      <VaultDashboard />
    </VaultProvider>
  ) : <AuthScreens />;
}

function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </UIProvider>
  );
}

export default App;
