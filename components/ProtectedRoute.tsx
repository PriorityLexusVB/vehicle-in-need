import React from 'react';
import { Navigate } from 'react-router-dom';
import { AppUser } from '../types';

interface ProtectedRouteProps {
  user: AppUser | null;
  children: React.ReactNode;
}

/**
 * ProtectedRoute component that only allows managers to access certain routes.
 * Redirects non-managers to the home page.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ user, children }) => {
  if (!user?.isManager) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
