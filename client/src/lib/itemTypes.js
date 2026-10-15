// Item types and field kinds for the v2 vault. Shared by the data layer and the UI.
// `icon` is a lucide-react component name; the UI maps it to the component.

export const FIELD_KINDS = {
  text:   { label: 'Text' },
  secret: { label: 'Secret' },              // masked, copyable, revealed on demand
  mono:   { label: 'Code or host' },        // shown in monospace, not masked
  url:    { label: 'URL' },
  date:   { label: 'Date' },                // ISO yyyy-mm-dd; drives expiry warnings
  totp:   { label: 'One-time code' },       // value = base32 TOTP secret (or otpauth:// URI)
  multi:  { label: 'Long text' },           // multi-line, masked like a secret
  ref:    { label: 'Identifier (not secret)' },
};

// Field labels whose `date` value counts as an expiry / rotation deadline.
export const EXPIRY_LABELS = ['Expires', 'Rotate by', 'Expiry date'];

export const ITEM_TYPES = {
  login: {
    label: 'Login', icon: 'Globe', blurb: 'Website or app sign-in, with 2FA code',
    template: [['Username', 'text'], ['Password', 'secret'], ['Website', 'url'], ['One-time code', 'totp']],
  },
  api_key: {
    label: 'API key', icon: 'KeyRound', blurb: 'Token or key pair with scope and expiry',
    template: [['Key', 'secret'], ['Scope', 'text'], ['Environment', 'text'], ['Issued by', 'text'], ['Expires', 'date']],
  },
  ssh_host: {
    label: 'SSH host', icon: 'TerminalSquare', blurb: 'Host, user, key file, jump route',
    template: [['Host', 'mono'], ['Port', 'mono'], ['User', 'mono'], ['Password', 'secret'], ['Jump host', 'mono']],
  },
  database: {
    label: 'Database', icon: 'Database', blurb: 'Engine, host, user, connection string',
    template: [['Engine', 'text'], ['Host', 'mono'], ['Port', 'mono'], ['Database', 'mono'], ['User', 'mono'], ['Password', 'secret'], ['Connection string', 'secret']],
  },
  server: {
    label: 'Server', icon: 'Server', blurb: 'A machine and what runs on it',
    template: [['Hostname', 'mono'], ['LAN address', 'mono'], ['OS', 'text'], ['Admin user', 'mono'], ['Admin password', 'secret']],
  },
  vpn: {
    label: 'VPN', icon: 'ShieldCheck', blurb: 'Gateway, protocol, user and profile',
    template: [['Gateway', 'mono'], ['Protocol', 'text'], ['Username', 'text'], ['Password', 'secret']],
  },
  cloud_credential: {
    label: 'Cloud credential', icon: 'Cloud', blurb: 'Access key ID plus secret, endpoint',
    template: [['Access key ID', 'ref'], ['Secret access key', 'secret'], ['Endpoint', 'url'], ['Rotate by', 'date']],
  },
  webhook: {
    label: 'Webhook', icon: 'Webhook', blurb: 'URL that carries its own secret',
    template: [['Webhook URL', 'secret'], ['Posts to', 'text']],
  },
  card: {
    label: 'Card', icon: 'CreditCard', blurb: 'Card number, expiry, CVV, PIN',
    template: [['Cardholder', 'text'], ['Number', 'secret'], ['Expiry', 'mono'], ['CVV', 'secret'], ['PIN', 'secret'], ['Card type', 'text']],
  },
  secure_note: {
    label: 'Secure note', icon: 'FileText', blurb: 'Free text, encrypted',
    template: [['Content', 'multi']],
  },
  identity: {
    label: 'Identity', icon: 'User', blurb: 'Name, contact details, ID numbers',
    template: [['Full name', 'text'], ['Email', 'text'], ['Phone', 'mono'], ['ID number', 'secret']],
  },
  wifi: {
    label: 'Wi-Fi', icon: 'Wifi', blurb: 'Network name and password',
    template: [['Network', 'text'], ['Password', 'secret'], ['Security', 'text']],
  },
  license: {
    label: 'Licence', icon: 'Ticket', blurb: 'Product key and seat details',
    template: [['Product', 'text'], ['Licence key', 'secret'], ['Licensed to', 'text'], ['Expires', 'date']],
  },
};

export const TYPE_KEYS = Object.keys(ITEM_TYPES);

export const ITEM_STATUSES = ['active', 'superseded', 'revoked'];

// Collections created for every account. `alfred` is the one Claude Code may read later
// through the local MCP connector; nothing reads it yet.
export const DEFAULT_COLLECTIONS = [
  { kind: 'personal', name: 'Personal', agentAccess: false },
  { kind: 'alfred', name: 'ALFRED', agentAccess: true },
];
