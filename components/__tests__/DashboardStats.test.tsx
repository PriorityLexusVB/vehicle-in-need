import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import DashboardStats from '../DashboardStats';
import type { ModelSlotTotals } from '../../src/utils/allocationModelTotals';

const baseStats = { totalActive: 12, awaitingAction: 3, securedLast30Days: 7 };

describe('DashboardStats', () => {
  it('renders the three headline stat values', () => {
    render(<DashboardStats {...baseStats} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('hides the Model Totals strip when there are no model totals', () => {
    const { rerender } = render(<DashboardStats {...baseStats} />);
    expect(screen.queryByTestId('dashboard-model-totals')).toBeNull();

    rerender(<DashboardStats {...baseStats} modelTotals={[]} />);
    expect(screen.queryByTestId('dashboard-model-totals')).toBeNull();
  });

  it('renders a Model Totals card per model with total/open/linked counts', () => {
    const modelTotals: ModelSlotTotals[] = [
      { model: 'RX 350h', totalSlots: 8, linkedSlots: 2, availableSlots: 6 },
      { model: 'NX 350', totalSlots: 3, linkedSlots: 0, availableSlots: 3 },
    ];
    render(<DashboardStats {...baseStats} modelTotals={modelTotals} />);

    const strip = screen.getByTestId('dashboard-model-totals');
    const cards = within(strip).getAllByTestId('dashboard-model-total-card');
    expect(cards).toHaveLength(2);

    const rx = cards[0];
    expect(within(rx).getByText('RX 350h')).toBeInTheDocument();
    expect(within(rx).getByText('8 total')).toBeInTheDocument();
    expect(within(rx).getByText('6 open')).toBeInTheDocument();
    expect(within(rx).getByText('2 linked')).toBeInTheDocument();

    const nx = cards[1];
    expect(within(nx).getByText('NX 350')).toBeInTheDocument();
    expect(within(nx).getByText('3 total')).toBeInTheDocument();
  });
});
