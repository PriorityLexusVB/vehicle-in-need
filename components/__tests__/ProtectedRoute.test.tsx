import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { AppUser } from '../../types';

describe('ProtectedRoute', () => {
  const mockManagerUser: AppUser = {
    uid: 'manager-123',
    email: 'manager@test.com',
    displayName: 'Manager User',
    isManager: true,
  };

  const mockNonManagerUser: AppUser = {
    uid: 'user-123',
    email: 'user@test.com',
    displayName: 'Regular User',
    isManager: false,
  };

  it('renders children when user is a manager', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={mockManagerUser}>
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('redirects to home when user is not a manager', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={mockNonManagerUser}>
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('redirects to home when user is null', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={null}>
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('redirects when user exists but isManager is undefined', () => {
    const userWithoutManagerFlag = {
      uid: 'user-123',
      email: 'user@test.com',
      displayName: 'User',
    } as AppUser;

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={userWithoutManagerFlag}>
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
