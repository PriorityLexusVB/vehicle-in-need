import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppUser } from '../types';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { LogoutIcon } from './icons/LogoutIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import VersionBadge from './VersionBadge';

/*
 * App shell navigation, Sales Tracker family look (2026-11-28).
 * One element, two layouts: a light top bar below 1120px and a fixed left
 * sidebar (w-60) at 1120px and up. App.tsx pads <main> by the same width.
 * Reference: sales-tracker north-star (claude-sync screenshots
 * st-showroom-command-center-2026-07-07/00-north-star-reference.png).
 */

interface HeaderProps {
  user: AppUser;
  totalOrders: number;
  onLogout: () => void;
  currentPath?: string;
}

interface HeaderLinkProps {
  to: string;
  active: boolean;
  children: React.ReactNode;
  testId?: string;
  ariaLabel?: string;
  onClick?: () => void;
}

const navItemClass = (active: boolean) =>
  [
    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
    active
      ? "bg-white font-semibold text-stone-950 shadow-card ring-1 ring-stone-200"
      : "font-medium text-stone-600 hover:bg-white/70 hover:text-stone-950",
  ].join(" ");

const HeaderLink: React.FC<HeaderLinkProps> = ({ to, active, children, testId, ariaLabel, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={navItemClass(active)}
    data-testid={testId}
    aria-label={ariaLabel}
    aria-current={active ? 'page' : undefined}
  >
    {children}
  </Link>
);

const iconClass = "h-5 w-5 shrink-0";

/* Heroicons outline paths, same family as the existing icons in ./icons. */
const DashboardIcon = () => (
  <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
  </svg>
);
const ExchangeIcon = () => (
  <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
  </svg>
);

const initialsFor = (user: AppUser) => {
  const source = (user.displayName || user.email || '?').trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
};

const Header: React.FC<HeaderProps> = ({ user, totalOrders, onLogout, currentPath }) => {
  const isNonManager = !user.isManager;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const links = (onClick?: () => void) => (
    <>
      {user.isManager && (
        <HeaderLink to="/" active={currentPath === '/'} testId={onClick ? undefined : 'dashboard-nav-link'} onClick={onClick}>
          <DashboardIcon />
          Dashboard
        </HeaderLink>
      )}
      <HeaderLink
        to="/allocation"
        active={currentPath === '/allocation'}
        testId={onClick ? undefined : 'allocation-nav-link'}
        ariaLabel={onClick ? undefined : 'Allocation Board'}
        onClick={onClick}
      >
        <BriefcaseIcon className={iconClass} aria-hidden="true" />
        Allocation Board
      </HeaderLink>
      {user.isManager && (
        <HeaderLink
          to="/dealer-exchange"
          active={currentPath === '/dealer-exchange'}
          testId={onClick ? 'mobile-dx-nav-link' : 'dx-nav-link'}
          onClick={onClick}
        >
          <ExchangeIcon />
          Dealer Exchange
        </HeaderLink>
      )}
      {isNonManager && (
        <HeaderLink
          to="/requests"
          active={currentPath === '/requests'}
          testId={onClick ? undefined : 'requests-nav-link'}
          ariaLabel={onClick ? undefined : 'Requests'}
          onClick={onClick}
        >
          <DocumentTextIcon className={iconClass} aria-hidden="true" />
          Requests
        </HeaderLink>
      )}
      {user.isManager && (
        <HeaderLink to="/admin" active={currentPath === '/admin'} testId={onClick ? undefined : 'admin-nav-link'} onClick={onClick}>
          <SettingsIcon className={iconClass} aria-hidden="true" />
          User Management
        </HeaderLink>
      )}
    </>
  );

  return (
    <header
      className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur min-[1120px]:fixed min-[1120px]:inset-y-0 min-[1120px]:left-0 min-[1120px]:w-60 min-[1120px]:border-b-0 min-[1120px]:border-r min-[1120px]:bg-stone-50"
      data-testid="app-shell-nav"
    >
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 min-[1120px]:h-full min-[1120px]:flex-col min-[1120px]:items-stretch min-[1120px]:justify-start min-[1120px]:gap-0 min-[1120px]:px-4 min-[1120px]:py-6">
        {/* Wordmark */}
        <div className="min-w-0 min-[1120px]:px-2">
          <Link to="/" className="group block">
            <h1 className="text-[15px] font-extrabold uppercase leading-tight tracking-[0.14em] text-stone-950 transition-colors group-hover:text-stone-600 min-[1120px]:text-base">
              <span className="min-[1120px]:block">Vehicle Order</span>{" "}
              <span className="min-[1120px]:block">Tracker</span>
            </h1>
          </Link>
          <p className="mt-1.5 hidden text-[10px] font-semibold uppercase leading-snug tracking-[0.16em] text-stone-500 sm:block">
            Priority Lexus Virginia Beach
          </p>
          <div className="-ml-2 hidden sm:block"><VersionBadge /></div>
        </div>

        {/* Desktop sidebar navigation */}
        <nav className="mt-8 hidden flex-col gap-1 min-[1120px]:flex" data-testid="main-nav">
          {links()}
        </nav>

        {user.isManager && (
          <div className="mt-4 hidden px-3 min-[1120px]:block">
            <p className="text-xs text-stone-500">
              <span className="font-semibold tabular-nums text-stone-900">{totalOrders}</span> active orders
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 min-[1120px]:mt-auto min-[1120px]:border-t min-[1120px]:border-stone-200 min-[1120px]:pt-4">
          <div className="hidden min-w-0 flex-1 items-center gap-3 min-[1120px]:flex">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-xs font-bold text-white" aria-hidden="true">
              {initialsFor(user)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-stone-950">{user.displayName || user.email}</span>
              <span className="block text-xs text-stone-500">{user.isManager ? 'Manager' : 'Sales'}</span>
            </span>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950"
            aria-label="Sign Out"
            title="Sign out"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-700 transition-colors hover:bg-stone-100 min-[1120px]:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            data-testid="mobile-menu-button"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden border-stone-200 bg-stone-50 transition-all duration-200 ease-in-out min-[1120px]:hidden ${mobileMenuOpen ? 'max-h-96 border-t opacity-100' : 'max-h-0 opacity-0'}`}
        data-testid="mobile-menu"
      >
        <nav className="space-y-1 px-4 py-3">
          {links(closeMobileMenu)}
          <p className="px-3 pt-2 text-xs text-stone-500">
            {user.displayName || user.email} · {user.isManager ? 'Manager' : 'Sales'}
          </p>
        </nav>
      </div>
    </header>
  );
};

export default Header;
