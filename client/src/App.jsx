import { useState } from 'react';
import { SessionProvider, useSession } from './state/session.jsx';
import { VaultProvider } from './state/vault.jsx';
import { ToastProvider } from './ui/context/toast.jsx';
import { ConfirmProvider } from './ui/context/confirm.jsx';
import Splash from './ui/screens/Splash.jsx';
import AuthScreen from './ui/screens/AuthScreen.jsx';
import LockScreen from './ui/screens/LockScreen.jsx';
import UpgradeScreen from './ui/screens/UpgradeScreen.jsx';
import VaultApp from './ui/screens/VaultApp.jsx';

function Root() {
  const { status } = useSession();
  // Keeps the upgrade screen up after the session flips to unlocked, so its result can be read.
  const [upgrade, setUpgrade] = useState(null); // null | 'running' | result

  if (status === 'needsUpgrade' || (status === 'unlocked' && upgrade)) {
    return (
      <UpgradeScreen
        result={upgrade && upgrade !== 'running' ? upgrade : null}
        onStart={() => setUpgrade('running')}
        onResult={(res) => setUpgrade(res || null)}
        onFinish={() => setUpgrade(null)}
      />
    );
  }
  if (status === 'loading') return <Splash />;
  if (status === 'locked') return <LockScreen />;
  if (status === 'unlocked') {
    return (
      <VaultProvider>
        <VaultApp />
      </VaultProvider>
    );
  }
  return <AuthScreen />;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
