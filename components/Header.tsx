import React from 'react';
import { AppUser } from '../types';
import { LogoutIcon } from './icons/LogoutIcon';
import { SettingsIcon } from './icons/SettingsIcon';

interface HeaderProps {
  user: AppUser;
  totalOrders: number;
  onLogout: () => void;
  view?: 'dashboard' | 'settings';
  setView?: (view: 'dashboard' | 'settings') => void;
  appVersion?: string;
  buildTime?: string;
}

const Header: React.FC<HeaderProps> = ({ user, totalOrders, onLogout, view, setView, appVersion, buildTime }) => {
  const handleUserManagementClick = () => {
    if (setView) {
      setView('settings');
    } else {
      // Fallback: set hash if setView is not available
      window.location.hash = 'settings';
    }
  };

  return (
    <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-10 border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                Vehicle Order Tracker
                {appVersion && (
                  <span className="ml-2 text-xs font-mono text-slate-400" title={buildTime}>
                    v{appVersion}
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-500 hidden sm:block">
                  Welcome, {user.displayName || user.email} {user.isManager && '(Manager)'}
                  <span className='ml-2 font-mono text-xs text-sky-700'>[isManager: {user.isManager.toString()}]</span>
              </p>
            </div>
            {user.isManager && setView && (
              <nav className="flex items-center gap-2 p-1 bg-slate-200/80 rounded-full flex-wrap">
                <button 
                  onClick={() => setView('dashboard')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${view === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Dashboard
                </button>
                <button 
                  onClick={() => setView('settings')} 
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${view === 'settings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>User Management</span>
                </button>
              </nav>
            )}
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
              <button
                onClick={handleUserManagementClick}
                className="flex items-center gap-2 px-3 py-2 rounded-full text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                aria-label="User Management"
                title="User Management"
              >
                <SettingsIcon className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">User Management</span>
              </button>
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