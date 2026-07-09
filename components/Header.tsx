import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppUser } from '../types';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { LogoutIcon } from './icons/LogoutIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import VersionBadge from './VersionBadge';

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
  compact?: boolean;
  onClick?: () => void;
}

const desktopNavClass = (active: boolean, compact = false) =>
  [
    "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors",
    compact ? "px-2 py-1.5 sm:px-4" : "px-4 py-1.5",
    active
      ? "bg-platinum text-graphite shadow-sm"
      : "text-stone-300 hover:bg-white/10 hover:text-white",
  ].join(" ");

const mobileNavClass = (active: boolean) =>
  [
    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
    active
      ? "bg-platinum text-graphite shadow-sm"
      : "text-stone-200 hover:bg-white/10 hover:text-white",
  ].join(" ");

const HeaderLink: React.FC<HeaderLinkProps> = ({
  to,
  active,
  children,
  testId,
  ariaLabel,
  compact,
  onClick,
}) => (
  <Link
    to={to}
    onClick={onClick}
    className={onClick ? mobileNavClass(active) : desktopNavClass(active, compact)}
    data-testid={testId}
    aria-label={ariaLabel}
  >
    {children}
  </Link>
);

const Header: React.FC<HeaderProps> = ({ user, totalOrders, onLogout, currentPath }) => {
  const isNonManager = !user.isManager;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-graphite text-white shadow-lg shadow-black/20">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-20 items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-5 lg:gap-8">
            <div className="min-w-0">
              <p className="hidden text-[11px] font-bold uppercase tracking-wide text-platinum sm:block">
                Priority Lexus Virginia Beach
              </p>
              <Link to="/" className="group inline-flex items-baseline gap-2">
                <h1 className="text-xl font-bold text-white transition-colors group-hover:text-platinum md:text-2xl">
                  Vehicle Order Tracker
                  <VersionBadge />
                </h1>
              </Link>
              <p className="hidden text-sm text-stone-300 sm:block">
                Welcome, {user.displayName || user.email} {user.isManager && '(Manager)'}
              </p>
            </div>

            <nav
              className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 md:flex"
              data-testid="main-nav"
            >
              {user.isManager && (
                <HeaderLink to="/" active={currentPath === '/'} testId="dashboard-nav-link">
                  Dashboard
                </HeaderLink>
              )}
              <HeaderLink
                to="/allocation"
                active={currentPath === '/allocation'}
                testId="allocation-nav-link"
                ariaLabel="Allocation Board"
                compact={isNonManager}
              >
                {isNonManager ? (
                  <>
                    <BriefcaseIcon className="h-5 w-5 sm:hidden" aria-hidden="true" />
                    <span className="hidden sm:inline">Allocation Board</span>
                  </>
                ) : (
                  'Allocation Board'
                )}
              </HeaderLink>
              {isNonManager && (
                <HeaderLink
                  to="/requests"
                  active={currentPath === '/requests'}
                  testId="requests-nav-link"
                  ariaLabel="Requests"
                >
                  <DocumentTextIcon className="h-5 w-5 sm:hidden" aria-hidden="true" />
                  <span className="hidden sm:inline">Requests</span>
                </HeaderLink>
              )}
              {user.isManager && (
                <HeaderLink to="/admin" active={currentPath === '/admin'} testId="admin-nav-link">
                  <SettingsIcon className="h-4 w-4" aria-hidden="true" />
                  <span>User Management</span>
                </HeaderLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {user.isManager && (
              <>
                <div className="hidden rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-right md:block">
                  <span className="text-2xl font-bold leading-none text-white">{totalOrders}</span>
                  <p className="mt-1 text-[11px] font-semibold uppercase text-platinum">Active Orders</p>
                </div>
              </>
            )}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 p-2 text-stone-300 transition-colors hover:bg-white/10 hover:text-white sm:px-3"
              aria-label="Sign Out"
            >
              <LogoutIcon className="h-5 w-5" />
              <span className="hidden text-sm font-semibold sm:block">Sign Out</span>
            </button>
            <button
              className="flex items-center justify-center rounded-lg border border-white/10 p-2 text-stone-200 transition-colors hover:bg-white/10 md:hidden"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              data-testid="mobile-menu-button"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        className={`overflow-hidden border-t border-white/10 bg-graphite transition-all duration-200 ease-in-out md:hidden ${mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
        data-testid="mobile-menu"
      >
        <nav className="space-y-1 px-4 py-3">
          {user.isManager && (
            <HeaderLink to="/" active={currentPath === '/'} onClick={closeMobileMenu}>
              Dashboard
            </HeaderLink>
          )}
          <HeaderLink to="/allocation" active={currentPath === '/allocation'} onClick={closeMobileMenu}>
            <BriefcaseIcon className="h-5 w-5" aria-hidden="true" />
            Allocation Board
          </HeaderLink>
          {isNonManager && (
            <HeaderLink to="/requests" active={currentPath === '/requests'} onClick={closeMobileMenu}>
              <DocumentTextIcon className="h-5 w-5" aria-hidden="true" />
              Requests
            </HeaderLink>
          )}
          {user.isManager && (
            <HeaderLink to="/admin" active={currentPath === '/admin'} onClick={closeMobileMenu}>
              <SettingsIcon className="h-4 w-4" aria-hidden="true" />
              User Management
            </HeaderLink>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
