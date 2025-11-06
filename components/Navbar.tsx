import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppUser } from '../types';

interface NavbarProps {
  user: AppUser;
}

const Navbar: React.FC<NavbarProps> = ({ user }) => {
  const location = useLocation();
  const isAdmin = location.pathname === '/admin';

  return (
    <nav className="bg-gradient-to-r from-sky-600 to-sky-700 shadow-lg">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link 
              to="/"
              className="text-white font-semibold text-lg hover:text-sky-100 transition-colors"
            >
              Home
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {user.isManager && (
              <Link
                to="/admin"
                className={`px-6 py-2 rounded-full font-bold text-sm transition-all duration-200 transform hover:scale-105 shadow-md ${
                  isAdmin
                    ? 'bg-white text-sky-700 hover:bg-sky-50'
                    : 'bg-sky-500 text-white hover:bg-sky-400'
                }`}
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
