import { AlertTriangle } from 'lucide-react';
import { ITEM_TYPES } from '../../lib/itemTypes.js';
import { iconFor } from '../lib/icons.js';
import Icon from './Icon.jsx';

export function TypeIcon({ type, size = 16 }) {
  return <Icon icon={iconFor(ITEM_TYPES[type]?.icon)} size={size} />;
}

// Square item tile: logins show their first letter, everything else its type icon.
export default function Tile({ item, lg = false }) {
  if (item.decryptError) {
    return (
      <span className={`tile bad ${lg ? 'lg' : ''}`}>
        <Icon icon={AlertTriangle} />
      </span>
    );
  }
  const letter = item.type === 'login' && item.title ? item.title.trim()[0]?.toUpperCase() : '';
  return (
    <span className={`tile ${lg ? 'lg' : ''}`} aria-hidden="true">
      {letter || <TypeIcon type={item.type} />}
    </span>
  );
}
