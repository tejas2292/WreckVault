// Maps the icon names in lib/itemTypes.js to lucide-react components.
import {
  Cloud, CreditCard, Database, FileText, Globe, KeyRound, Server, ShieldCheck, TerminalSquare,
  Ticket, User, Webhook, Wifi, File, Bot, Folder, Lock,
} from 'lucide-react';

export const ICONS = {
  Globe, KeyRound, TerminalSquare, Database, Server, ShieldCheck, Cloud, Webhook, CreditCard,
  FileText, User, Wifi, Ticket,
};

export function iconFor(name) {
  return ICONS[name] || File;
}

export function collectionIcon(c) {
  if (!c) return Folder;
  if (c.agentAccess || c.kind === 'alfred') return Bot;
  if (c.kind === 'personal') return Lock;
  return Folder;
}
