import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from './theme';
import { UpdateBanner } from '../components/UpdateBanner';
import { ReloadPrompt } from '../components/ReloadPrompt';
import {
  IconDashboard,
  IconDevices,
  IconConfig,
  IconApps,
  IconEnroll,
  IconSettings,
  IconSignOut,
  IconMenu,
  IconSun,
  IconMoon,
} from './icons';

interface NavEntry {
  to: string;
  label: string;
  Icon: (p: { className?: string }) => ReactNode;
}

const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Resumen', Icon: IconDashboard },
  { to: '/devices', label: 'Equipos', Icon: IconDevices },
  { to: '/configs', label: 'Configuraciones', Icon: IconConfig },
  { to: '/apps', label: 'Apps', Icon: IconApps },
  { to: '/enroll', label: 'Alta', Icon: IconEnroll },
  { to: '/settings', label: 'Ajustes', Icon: IconSettings },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return 'U';
  const a = parts[0][0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (a + b).toUpperCase() || 'U';
}

export function AppShell({
  title,
  children,
}: {
  /** Page label, shown only in the mobile top bar. */
  title?: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const userName = user?.login || user?.name || 'admin';

  return (
    <div className="shell">
      <div
        className={`scrim ${open ? 'show' : ''}`}
        onClick={close}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        {/* Header de marca — pastilla estilo BackOffice (tile + nombre). */}
        <div className="sb-header">
          <div className="sb-brand">
            <span className="sb-tile">
              <img className="sb-deer" src="/reno-deer.png" alt="" aria-hidden="true" />
            </span>
            <span className="sb-brand-text">
              <span className="sb-brand-name">RENO MDM</span>
              <span className="sb-brand-sub">Consola de flotilla</span>
            </span>
          </div>
        </div>

        <nav className="sb-nav">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}
              onClick={close}
            >
              <span className="sb-mark" aria-hidden="true" />
              <Icon className="sb-ico" />
              <span className="sb-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sb-footer">
          <div className="sb-user">
            <span className="sb-avatar">{initialsOf(userName)}</span>
            <span className="sb-user-text">
              <span className="sb-user-name">{userName}</span>
              <span className="sb-user-role">Administrador</span>
            </span>
          </div>
          <div className="sb-actions">
            <button
              className="sb-btn"
              onClick={toggleTheme}
              aria-label={`Cambiar a tema ${theme === 'dark' ? 'claro' : 'oscuro'}`}
            >
              {theme === 'dark' ? <IconSun className="sb-ico" /> : <IconMoon className="sb-ico" />}
              <span>{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
            </button>
            <button className="sb-btn" onClick={() => void signOut()}>
              <IconSignOut className="sb-ico" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="rail-mobilebar">
          <button
            className="btn btn-ghost menu-btn"
            onClick={() => setOpen((v) => !v)}
            aria-label="Alternar navegación"
          >
            <IconMenu />
          </button>
          <span style={{ fontWeight: 600 }}>{title ?? 'Reno MDM'}</span>
        </div>
        <main className="content route-enter"><ReloadPrompt /><UpdateBanner />{children}</main>
      </div>
    </div>
  );
}
