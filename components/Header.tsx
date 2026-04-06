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

const Header: React.FC<HeaderProps> = ({ user, totalOrders, onLogout, currentPath }) => {
  const isNonManager = !user.isManager;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-10 border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <div>
              <Link to="/" className="inline-block">
                <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight hover:text-sky-700 transition-colors">
                  Vehicle Order Tracker
                  <VersionBadge />
                </h1>
              </Link>
              <p className="text-sm text-slate-500 hidden sm:block">
                  Welcome, {user.displayName || user.email} {user.isManager && '(Manager)'}
              </p>
            </div>
            {/* Desktop nav -- hidden on mobile */}
            <nav className="hidden md:flex items-center gap-2 p-1 bg-slate-200/80 rounded-full" data-testid="main-nav">
              {user.isManager && (
                <Link
                  to="/"
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${currentPath === '/' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  data-testid="dashboard-nav-link"
                >
                  Dashboard
                </Link>
              )}
              <Link
                to="/allocation"
                className={`flex items-center justify-center rounded-full transition-colors text-sm font-semibold ${currentPath === '/allocation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'} ${isNonManager ? 'px-2 py-1.5 sm:px-4' : 'px-4 py-1.5'}`}
                data-testid="allocation-nav-link"
                aria-label="Allocation Board"
              >
                {isNonManager ? (
                  <>
                    <BriefcaseIcon className="w-5 h-5 sm:hidden" aria-hidden="true" />
                    <span className="hidden sm:inline">Allocation Board</span>
                  </>
                ) : (
                  'Allocation Board'
                )}
              </Link>
              {isNonManager && (
                <Link
                  to="/requests"
                  className={`flex items-center justify-center px-3 py-1.5 sm:px-4 text-sm font-semibold rounded-full transition-colors ${currentPath === '/requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  data-testid="requests-nav-link"
                  aria-label="Requests"
                >
                  <DocumentTextIcon className="w-5 h-5 sm:hidden" aria-hidden="true" />
                  <span className="hidden sm:inline">Requests</span>
                </Link>
              )}
              {user.isManager && (
                <Link
                  to="/admin"
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${currentPath === '/admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  data-testid="admin-nav-link"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>User Management</span>
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user.isManager && (
              <>
                <div className="text-right hidden md:block">
                  <span className="text-2xl font-bold text-sky-600">{totalOrders}</span>
                  <p className="text-xs text-slate-500 font-medium">Active Orders</p>
                </div>
                <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
              </>
            )}
            {user.isManager && (
              <Link
                to="/dashboard-beta"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
                title="Beta Dashboard"
              >
                Beta
              </Link>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 p-2 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
              aria-label="Sign Out"
            >
              <LogoutIcon className="w-6 h-6" />
              <span className="text-sm font-medium hidden sm:block">Sign Out</span>
            </button>
            {/* Mobile hamburger button */}
            <button
              className="md:hidden flex items-center justify-center p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              data-testid="mobile-menu-button"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
      {/* Mobile dropdown menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ease-in-out ${mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
        data-testid="mobile-menu"
      >
        <nav className="bg-slate-50 border-t border-slate-200 px-4 py-2">
          {user.isManager && (
            <Link
              to="/"
              onClick={closeMobileMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${currentPath === '/' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
            >
              Dashboard
            </Link>
          )}
          <Link
            to="/allocation"
            onClick={closeMobileMenu}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${currentPath === '/allocation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
          >
            <BriefcaseIcon className="w-5 h-5" aria-hidden="true" />
            Allocation Board
          </Link>
          {isNonManager && (
            <Link
              to="/requests"
              onClick={closeMobileMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${currentPath === '/requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
            >
              <DocumentTextIcon className="w-5 h-5" aria-hidden="true" />
              Requests
            </Link>
          )}
          {user.isManager && (
            <Link
              to="/admin"
              onClick={closeMobileMenu}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${currentPath === '/admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
            >
              <SettingsIcon className="w-4 h-4" aria-hidden="true" />
              User Management
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;