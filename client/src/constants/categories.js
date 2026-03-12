import {
  Globe,
  Server,
  Database,
  Wifi,
  Mail,
  Code,
  Box,
  Cloud,
  Monitor,
  CreditCard,
  Share2,
  FolderOpen,
} from 'lucide-react';

const CATEGORIES = [
  { key: 'login',         label: 'Login',          icon: Globe,       color: '#6c5ce7' },
  { key: 'server',        label: 'Server',         icon: Server,      color: '#00b894' },
  { key: 'database',      label: 'Database',       icon: Database,    color: '#0984e3' },
  { key: 'network',       label: 'Network',        icon: Wifi,        color: '#fdcb6e' },
  { key: 'email',         label: 'Email',          icon: Mail,        color: '#e17055' },
  { key: 'development',   label: 'Development',    icon: Code,        color: '#00cec9' },
  { key: 'devops',        label: 'DevOps',         icon: Box,         color: '#a29bfe' },
  { key: 'cloud',         label: 'Cloud',          icon: Cloud,       color: '#74b9ff' },
  { key: 'remote_access', label: 'Remote Access',  icon: Monitor,     color: '#fd79a8' },
  { key: 'finance',       label: 'Finance',        icon: CreditCard,  color: '#55efc4' },
  { key: 'social',        label: 'Social',         icon: Share2,      color: '#fab1a0' },
  { key: 'other',         label: 'Other',          icon: FolderOpen,  color: '#636e72' },
];

export const getCategoryByKey = (key) =>
  CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

export default CATEGORIES;
