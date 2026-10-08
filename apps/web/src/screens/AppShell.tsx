import type { AppShellProps, ThemeName } from '@certa/contract';
import type { ReactNode } from 'react';

export function AppShell(props: AppShellProps & { children: ReactNode }) {
  return (
    <div className="certa" data-testid="app-shell">
      <header>
        <strong>CERTA</strong> · <span data-testid="org-name">{props.organization.name}</span>
        {props.orgOptions.length > 1 && (
          <select aria-label="Organization" value={props.organization.id} onChange={(e) => props.onSwitchOrg(e.target.value)}>
            {props.orgOptions.map((o) => (
              <option key={o.orgId} value={o.orgId}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <span>
          {' '}
          {props.user.name} ({props.user.roleLabel})
        </span>
        <select aria-label="Theme" value={props.theme} onChange={(e) => props.onThemeChange(e.target.value as ThemeName)}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="sunlight">Sunlight</option>
        </select>
        <button type="button" onClick={props.onSignOut}>
          Sign out
        </button>
      </header>
      <nav aria-label="Main">
        <ul>
          {props.navigation.map((n) => (
            <li key={n.id}>
              <a
                href={props.basePath + n.href}
                aria-current={n.active ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  props.onNavigate(n.href);
                }}
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main>{props.children}</main>
      <footer>
        <small data-testid="compliance-notice">{props.complianceNotice}</small>
      </footer>
    </div>
  );
}
