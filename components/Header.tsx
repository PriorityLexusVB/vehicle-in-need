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
    "inline-flex items-center justify-center gap-2 border-b-2 text-sm font-semibold transition-colors",
    compact ? "px-2 py-2" : "px-1 py-2",
    active
      ? "border-stone-950 text-stone-950"
      : "border-transparent text-stone-500 hover:text-stone-950",
  ].join(" ");

const mobileNavClass = (active: boolean) =>
  [
    "flex items-center gap-3 rounded-[3px] px-4 py-3 text-sm font-semibold transition-colors",
    active
      ? "bg-stone-100 text-stone-950"
      : "text-stone-700 hover:bg-stone-50 hover:text-stone-950",
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
    aria-current={active ? 'page' : undefined}
  >
    {children}
  </Link>
);

const Header: React.FC<HeaderProps> = ({ user, totalOrders, onLogout, currentPath }) => {
  const isNonManager = !user.isManager;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white text-stone-950">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-5 lg:gap-8">
            <div className="min-w-0">
              <p className="hidden text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 sm:block">
                Priority Lexus Virginia Beach
              </p>
              <Link to="/" className="group inline-flex items-baseline gap-2">
                <h1 className="text-lg font-bold tracking-tight text-stone-950 transition-colors group-hover:text-stone-600 md:text-xl">
                  Vehicle Order Tracker
                  <VersionBadge />
                </h1>
              </Link>
              <p className="hidden text-xs text-stone-500 sm:block">
                Welcome, {user.displayName || user.email} {user.isManager && '(Manager)'}
              </p>
            </div>

            <nav
              className="hidden items-center gap-6 min-[1120px]:flex"
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
              {user.isManager && (
                <HeaderLink
                  to="/dealer-exchange"
                  active={currentPath === '/dealer-exchange'}
                  testId="dx-nav-link"
                >
                  Dealer Exchange
                </HeaderLink>
              )}
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
                <div className="hidden border-l border-stone-200 px-4 text-right 2xl:block">
                  <span className="text-xl font-bold leading-none text-stone-950">{totalOrders}</span>
                  <p className="mt-1 text-[11px] font-semibold uppercase text-stone-500">Active Orders</p>
                </div>
              </>
            )}
            <button
              onClick={onLogout}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[3px] border border-stone-300 p-2 text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 sm:px-3"
              aria-label="Sign Out"
            >
              <LogoutIcon className="h-5 w-5" />
              <span className="hidden text-sm font-semibold sm:block">Sign Out</span>
            </button>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-stone-300 text-stone-700 transition-colors hover:bg-stone-100 min-[1120px]:hidden"
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
        className={`overflow-hidden border-t border-stone-200 bg-white transition-all duration-200 ease-in-out min-[1120px]:hidden ${mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
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
          {user.isManager && (
            <HeaderLink
              to="/dealer-exchange"
              active={currentPath === '/dealer-exchange'}
              testId="mobile-dx-nav-link"
              onClick={closeMobileMenu}
            >
              Dealer Exchange
            </HeaderLink>
          )}
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
