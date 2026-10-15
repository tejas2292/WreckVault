import { Menu } from 'lucide-react';
import Icon from '../components/Icon.jsx';

// Sticky top bar for full-width pages (Health, Generator, Settings).
export default function PageTop({ icon, title, onMenu, children }) {
  return (
    <div className="d-top">
      <button type="button" className="ib only-narrow" onClick={onMenu} aria-label="Open navigation">
        <Icon icon={Menu} />
      </button>
      <span className="crumb">
        <Icon icon={icon} />
        <span>{title}</span>
      </span>
      <span className="sp" />
      {children}
    </div>
  );
}
