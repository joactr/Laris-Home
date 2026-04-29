import type { ReactNode } from 'react';

export type AppNavItem = {
  path: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
};

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    path: '/',
    label: 'nav.dashboard',
    shortLabel: 'Inicio',
    icon: (
      <svg {...iconProps}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M6.5 10.5V20h11V10.5" />
      </svg>
    ),
  },
  {
    path: '/shopping',
    label: 'nav.shopping',
    shortLabel: 'Compra',
    icon: (
      <svg {...iconProps}>
        <path d="M6 6h15l-1.4 8.4a2 2 0 0 1-2 1.6H9.2A2 2 0 0 1 7.2 14L6 3H3" />
        <circle cx="10" cy="20" r="1.2" />
        <circle cx="18" cy="20" r="1.2" />
      </svg>
    ),
  },
  {
    path: '/calendar',
    label: 'nav.calendar',
    shortLabel: 'Agenda',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
    ),
  },
  {
    path: '/meals',
    label: 'nav.meals',
    shortLabel: 'Comidas',
    icon: (
      <svg {...iconProps}>
        <path d="M8 3v8M5 3v8M11 3v8" />
        <path d="M8 11v10" />
        <path d="M16 3c2.2 0 4 1.8 4 4v2c0 2.2-1.8 4-4 4V3Z" />
        <path d="M16 13v8" />
      </svg>
    ),
  },
  {
    path: '/recipes',
    label: 'nav.recipes',
    shortLabel: 'Recetas',
    icon: (
      <svg {...iconProps}>
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2h2" />
        <path d="M8 8h8M8 12h8" />
      </svg>
    ),
  },
  {
    path: '/projects',
    label: 'nav.projects',
    shortLabel: 'Proyectos',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="7" height="7" rx="1.5" />
        <rect x="14" y="4" width="7" height="7" rx="1.5" />
        <rect x="14" y="15" width="7" height="6" rx="1.5" />
        <path d="M10 7.5h4M17.5 11v4" />
      </svg>
    ),
  },
];
