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
      model: 'TX500H',
      sourceCode: '9704F',
      quantity: 1,
      color: 'WHITE',
      interior: '20',
      arrival: '2026-03-14',
      timelineType: 'build',
      bos: 'Y',
      grade: 'F SPORT',
      factoryAccessories: 'BI CP FT',
      postProductionOptions: '2T 3J 59 87 DF Z1',
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
      model: 'RX350',
      sourceCode: '9443F',
      quantity: 1,
      color: 'BLACK',
      interior: 'LA20',
      arrival: '2026-03-20',
      timelineType: 'port',
      bos: 'N',
      grade: 'Premium',
      factoryAccessories: 'WU',
      postProductionOptions: '3J 59',
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
    expect(screen.getByTestId('allocation-source-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-source-file-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parse Source' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish Snapshot' })).toBeInTheDocument();
  });

  it('loads source text from uploaded file in manager panel', async () => {
    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const input = screen.getByTestId('allocation-source-file-input') as HTMLInputElement;
    const file = new File(['9704F TX500H INT 20 BOS Y'], 'allocation.txt', { type: 'text/plain' });

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByDisplayValue('9704F TX500H INT 20 BOS Y')).toBeInTheDocument();
    });
  });

  it('renders 4-digit codes and model split in strategy and full log views', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    expect(screen.getByText('9704')).toBeInTheDocument();
    expect(screen.getByText('9443')).toBeInTheDocument();
    expect(screen.getAllByText('Factory Accy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PPOs').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Full Log View' }));

    expect(screen.getByTestId('allocation-log-view')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      'Code',
      'Model',
      'Grade / Trim',
      'Build / Port',
      'BOS',
      'Category',
      'Priority',
      'Qty',
      'Factory Accessories',
      'Post-Production Options',
      'Value',
    ]);
  });

  it('keeps code and model distinct when source code is unavailable', async () => {
    subscribeLatestAllocationSnapshot.mockImplementationOnce((callback: (snapshot: unknown) => void) => {
      callback({
        ...sampleSnapshot,
        vehicles: [
          {
            ...sampleSnapshot.vehicles[0],
            sourceCode: undefined,
            code: 'GX550',
            model: 'GX550',
          },
        ],
      });
      return () => undefined;
    });

    render(<AllocationBoard currentUser={consultantUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    expect(screen.getByText('----')).toBeInTheDocument();
    expect(screen.getByText('GX550')).toBeInTheDocument();
  });
});
