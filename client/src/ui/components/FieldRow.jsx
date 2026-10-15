import { Copy, ExternalLink, Eye, EyeOff, Lock } from 'lucide-react';
import Icon from './Icon.jsx';
import StrengthBar from './StrengthBar.jsx';
import Totp from './Totp.jsx';
import { daysUntil, displayUrl, fmtDay, fmtDaysRelative, isPasswordField, safeHref } from '../lib/format.js';
import { safeTotp } from '../lib/otp.js';
import { useCopy } from '../lib/hooks.js';

const MASK = '•'.repeat(12);

// One row in the item detail's Fields box.
export default function FieldRow({ field, revealed, onToggleReveal }) {
  const copy = useCopy();
  const { label, kind, value } = field;
  const name = label || 'Field';

  const copyBtn = (text = value) => (
    <button type="button" className="ib" onClick={() => copy(text, name)} aria-label={`Copy ${name}`} title={`Copy ${name}`}>
      <Icon icon={Copy} />
    </button>
  );
  const revealBtn = (
    <button
      type="button"
      className="ib"
      onClick={onToggleReveal}
      aria-label={`${revealed ? 'Hide' : 'Show'} ${name}`}
      aria-pressed={revealed}
      title={revealed ? 'Hide' : 'Show'}
    >
      <Icon icon={revealed ? EyeOff : Eye} />
    </button>
  );

  let body;
  let actions;
  let tag = null;

  if (kind === 'secret' || kind === 'multi') {
    tag = (
      <span className="lock" title="Secret: masked until you reveal it">
        <Icon icon={Lock} label="Secret" />
      </span>
    );
    if (revealed) {
      body = <span className={`mono ${kind === 'multi' ? 'multi' : ''}`}>{value}</span>;
    } else {
      body = <span className="mono masked">{MASK}</span>;
    }
    if (isPasswordField(field)) body = <>{body}<StrengthBar password={value} /></>;
    actions = <>{revealBtn}{copyBtn()}</>;
  } else if (kind === 'url') {
    const href = safeHref(value);
    body = href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {displayUrl(value)}
      </a>
    ) : (
      <span>{value}</span>
    );
    actions = (
      <>
        {href && (
          <a className="ib" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in a new tab`} title="Open">
            <Icon icon={ExternalLink} />
          </a>
        )}
        {copyBtn()}
      </>
    );
  } else if (kind === 'totp') {
    body = <Totp secret={value} />;
    actions = (
      <button
        type="button"
        className="ib"
        onClick={() => {
          const code = safeTotp(value);
          if (code) copy(code, name);
        }}
        aria-label={`Copy ${name}`}
        title={`Copy ${name}`}
      >
        <Icon icon={Copy} />
      </button>
    );
  } else if (kind === 'date') {
    const n = daysUntil(value);
    const tone = n === null ? 'c-mute' : n < 0 ? 'c-bad' : n <= 30 ? 'c-warn' : 'c-mute';
    body = (
      <span className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="num">{fmtDay(value)}</span>
        {n !== null && <span className={`chip ${tone}`}>{fmtDaysRelative(n)}</span>}
      </span>
    );
    actions = copyBtn();
  } else {
    if (kind === 'ref') {
      tag = (
        <span className="chip c-info" title="Identifier, not a secret">
          ID
        </span>
      );
    }
    body = <span className={kind === 'mono' || kind === 'ref' ? 'mono' : ''}>{value}</span>;
    actions = copyBtn();
  }

  return (
    <div className="f">
      <div className="f-l">
        <span>{name}</span>
        {tag}
      </div>
      <div className="f-v">{body}</div>
      <div className="f-a">{actions}</div>
    </div>
  );
}
