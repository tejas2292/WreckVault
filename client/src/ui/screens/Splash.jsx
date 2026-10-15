import { Loader2 } from 'lucide-react';
import Icon from '../components/Icon.jsx';
import VaultMark from '../components/VaultMark.jsx';

export default function Splash() {
  return (
    <main className="gate" aria-busy="true">
      <div className="gate-head">
        <span className="mark lg">
          <VaultMark size={26} />
        </span>
        <p className="busy-note">
          <Icon icon={Loader2} className="spin" /> Opening WreckVault…
        </p>
      </div>
    </main>
  );
}
