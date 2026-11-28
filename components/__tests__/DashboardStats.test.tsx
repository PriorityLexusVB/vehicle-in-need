import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import DashboardStats from '../DashboardStats';

const summary = { active: 11, got: 4, exchange: 2, waiting: 5, waitingLong: 2 };

describe('DashboardStats — did we get the car?', () => {
  it('leads with the question and the three buckets', () => {
    render(<DashboardStats summary={summary} securedLast30Days={3} />);
    expect(screen.getByRole('heading', { name: /did we get the car\?/i })).toBeInTheDocument();
    expect(within(screen.getByTestId('dashboard-got-car')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('dashboard-exchange')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('dashboard-waiting')).getByText('5')).toBeInTheDocument();
  });

  it('shows active and delivered context without repeating a bucket', () => {
    render(<DashboardStats summary={summary} securedLast30Days={3} />);
    const section = screen.getByTestId('dashboard-car-status');
    expect(section).toHaveTextContent('11 active orders');
    expect(section).toHaveTextContent('3 delivered in the last 30 days');
  });

  it('flags long waits only when there are some', () => {
    const { rerender } = render(<DashboardStats summary={summary} securedLast30Days={0} />);
    expect(screen.getByTestId('dashboard-waiting')).toHaveTextContent('2 over 30 days');
    rerender(<DashboardStats summary={{ ...summary, waitingLong: 0 }} securedLast30Days={0} />);
    expect(screen.getByTestId('dashboard-waiting')).toHaveTextContent('None over 30 days');
  });

  it('progress bar widths follow the buckets and survive zero orders', () => {
    const { rerender } = render(<DashboardStats summary={summary} securedLast30Days={0} />);
    const [gotBar, comingBar] = Array.from(screen.getByTestId('dashboard-car-status-bar').children) as HTMLElement[];
    expect(gotBar.style.width).toBe(`${(4 / 11) * 100}%`);
    expect(comingBar.style.width).toBe(`${(2 / 11) * 100}%`);
    rerender(<DashboardStats summary={{ active: 0, got: 0, exchange: 0, waiting: 0, waitingLong: 0 }} securedLast30Days={0} />);
    const [emptyBar] = Array.from(screen.getByTestId('dashboard-car-status-bar').children) as HTMLElement[];
    expect(emptyBar.style.width).toBe('0%');
  });
});
