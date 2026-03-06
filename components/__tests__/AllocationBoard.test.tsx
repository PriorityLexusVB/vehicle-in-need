import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AllocationBoard from '../AllocationBoard';
import { AppUser } from '../../types';

const serviceMocks = vi.hoisted(() => ({
  subscribeLatestAllocationSnapshot: vi.fn(),
  publishAllocationSnapshot: vi.fn(),
}));

const { subscribeLatestAllocationSnapshot, publishAllocationSnapshot } = serviceMocks;

vi.mock('../../services/allocationService', () => serviceMocks);

const managerUser: AppUser = {
  uid: 'manager-1',
  email: 'manager@priorityautomotive.com',
  displayName: 'Manager User',
  isManager: true,
};

const consultantUser: AppUser = {
  uid: 'consultant-1',
  email: 'consultant@priorityautomotive.com',
  displayName: 'Consultant User',
  isManager: false,
};

const sampleSnapshot = {
  id: 'snapshot-1',
  reportDate: '2026-03-01',
  publishedAt: {
    toDate: () => new Date('2026-03-05T10:00:00Z'),
  },
  publishedByUid: 'manager-1',
  publishedByEmail: 'manager@priorityautomotive.com',
  itemCount: 2,
  summary: {
    units: 2,
    value: 116550,
    hybridMix: 50,
  },
  isLatest: true,
  vehicles: [
    {
      id: '1',
      code: 'TX500H',
      quantity: 1,
      color: 'WHITE',
      arrival: '2026-03-14',
      grade: 'F SPORT',
      engine: 'Hybrid',
      msrp: 70500,
      category: 'Growth',
      type: 'Three-Row SUV Hybrid',
      rank: 'Critical',
      profit: 6400,
      totalValue: 70500,
    },
    {
      id: '2',
      code: 'RX350',
      quantity: 1,
      color: 'BLACK',
      arrival: '2026-03-20',
      grade: 'Premium',
      engine: 'Gas',
      msrp: 46050,
      category: 'Core',
      type: 'SUV',
      rank: 'High',
      profit: 4200,
      totalValue: 46050,
    },
  ],
};

beforeEach(() => {
  subscribeLatestAllocationSnapshot.mockReset();
  publishAllocationSnapshot.mockReset();
  subscribeLatestAllocationSnapshot.mockImplementation((callback: (snapshot: unknown) => void) => {
    callback(sampleSnapshot);
    return () => undefined;
  });
});

describe('AllocationBoard', () => {
  it('hides manager controls for consultants and defaults to strategy view', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('allocation-manager-toggle')).toBeNull();
    expect(screen.getByText('Strategy View')).toBeInTheDocument();
    expect(screen.getByText('Full Log View')).toBeInTheDocument();
  });

  it('shows collapsible manager panel for managers', async () => {
    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    const toggle = await screen.findByTestId('allocation-manager-toggle');
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByTestId('allocation-manager-panel')).toBeNull();

    await user.click(toggle);

    expect(screen.getByTestId('allocation-manager-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parse Source' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish Snapshot' })).toBeInTheDocument();
  });
});
