import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZeroManagerWarning from '../ZeroManagerWarning';

describe('ZeroManagerWarning', () => {
  it('displays warning when no managers exist and user is not a manager', () => {
    render(
      <ZeroManagerWarning hasManagers={false} isCurrentUserManager={false} />
    );

    expect(
      screen.getByText(/No managers detected/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/contact an administrator/i)
    ).toBeInTheDocument();
  });

  it('hides warning when managers exist', () => {
    render(
      <ZeroManagerWarning hasManagers={true} isCurrentUserManager={false} />
    );

    expect(
      screen.queryByText(/No managers detected/i)
    ).not.toBeInTheDocument();
  });

  it('hides warning when current user is a manager', () => {
    render(
      <ZeroManagerWarning hasManagers={false} isCurrentUserManager={true} />
    );

    expect(
      screen.queryByText(/No managers detected/i)
    ).not.toBeInTheDocument();
  });

  it('can be dismissed by clicking close button', async () => {
    const user = userEvent.setup();
    render(
      <ZeroManagerWarning hasManagers={false} isCurrentUserManager={false} />
    );

    // Verify warning is visible
    expect(
      screen.getByText(/No managers detected/i)
    ).toBeInTheDocument();

    // Click dismiss button
    const dismissButton = screen.getByRole('button', { name: /dismiss warning/i });
    await user.click(dismissButton);

    // Verify warning is dismissed
    expect(
      screen.queryByText(/No managers detected/i)
    ).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <ZeroManagerWarning hasManagers={false} isCurrentUserManager={false} />
    );

    // Check for role=alert
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();

    // Check for dismiss button with aria-label
    const dismissButton = screen.getByRole('button', { name: /dismiss warning/i });
    expect(dismissButton).toHaveAttribute('aria-label', 'Dismiss warning');
  });
});
