import React from 'react';
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
                  <span className='ml-2 font-mono text-xs text-sky-700'>[isManager: {user.isManager.toString()}]</span>
              </p>
            </div>
            <nav className="flex items-center gap-2 p-1 bg-slate-200/80 rounded-full flex-wrap" data-testid="main-nav">
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
                  className={`flex items-center justify-center px-3 py-2.5 sm:px-4 text-sm font-semibold rounded-full transition-colors ${currentPath === '/requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
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
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-full transition-colors ${currentPath === '/admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
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
                <div className="text-right">
                  <span className="text-2xl font-bold text-sky-600">{totalOrders}</span>
                  <p className="text-xs text-slate-500 font-medium">Active Orders</p>
                </div>
                <div className="h-6 w-px bg-slate-200"></div>
              </>
            )}
            {user.isManager && (
              <Link
                to="/admin"
                className="flex items-center gap-2 px-3 py-2 rounded-full text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                aria-label="User Management"
                title="User Management"
                data-testid="admin-settings-link"
              >
                <SettingsIcon className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">User Management</span>
              </Link>
            )}
            {import.meta.env.DEV && user.isManager && (
              <Link
                to="/dashboard-beta"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
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
          </div>
        </div>
      </div>
      {/* Removed the separate mobile-only nav to avoid duplication; the nav above is now always visible for managers. */}
    </header>
  );
};

export default Header;