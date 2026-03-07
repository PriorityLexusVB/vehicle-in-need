import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AllocationBoard from '../AllocationBoard';
import { AppUser } from '../../types';

const serviceMocks = vi.hoisted(() => ({
  subscribeLatestAllocationSnapshot: vi.fn(),
  publishAllocationSnapshot: vi.fn(),
}));

const pdfMocks = vi.hoisted(() => ({
  extractAllocationTextFromPdf: vi.fn(),
}));

const { subscribeLatestAllocationSnapshot, publishAllocationSnapshot } = serviceMocks;
const { extractAllocationTextFromPdf } = pdfMocks;

vi.mock('../../services/allocationService', () => serviceMocks);
vi.mock('../../src/utils/pdfTextExtractor', () => pdfMocks);

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
      interiorColor: 'EA20 BLACK',
      bos: 'Y',
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
      interiorColor: 'LA00 PALOMINO',
      bos: 'N',
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
  window.localStorage.clear();
  subscribeLatestAllocationSnapshot.mockReset();
  publishAllocationSnapshot.mockReset();
  extractAllocationTextFromPdf.mockReset();
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

  it('supports PDF upload and fills manager source text', async () => {
    const extractedText = [
      '3/5/2026 Toyota District Manager Allocation Application',
      '2 031 9353F TS14I127 7 Y 01J9-01 02045 Y BI CC CP TP G4 P9 Z1 2T 59 04-11',
      '( TX 350 AWD TX 350 AWD )',
      '( CELESTIAL SILVER METALLIC )',
    ].join('\n');

    extractAllocationTextFromPdf.mockResolvedValue(extractedText);

    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const pdfInput = screen.getByTestId('allocation-pdf-input');
    const pdfFile = new File(['%PDF-1.4'], 'allocation.pdf', {
      type: 'application/pdf',
    });

    await user.upload(pdfInput, pdfFile);

    await waitFor(() => {
      expect(extractAllocationTextFromPdf).toHaveBeenCalledTimes(1);
    });

    const sourceTextarea = screen.getByPlaceholderText('Paste allocation source text...');
    expect(sourceTextarea).toHaveValue(extractedText);
    expect(
      screen.getByText('Loaded allocation.pdf. Click Parse Source to validate and preview rows.'),
    ).toBeInTheDocument();
  });

  it('supports PDF drag-and-drop and fills manager source text', async () => {
    const extractedText = [
      '3/5/2026 Toyota District Manager Allocation Application',
      '14 031 9443F TI12DC97 9 Y 0085-46 02210 03-16',
      '( RX450H+ LUX AWD 5-DOOR SUV )',
      '( EMINENT WHITE PEARL )',
    ].join('\n');

    extractAllocationTextFromPdf.mockResolvedValue(extractedText);

    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const pdfFile = new File(['%PDF-1.4'], 'dropped-allocation.pdf', {
      type: 'application/pdf',
    });
    const dropzone = screen.getByTestId('allocation-pdf-dropzone');

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [pdfFile],
      },
    });

    await waitFor(() => {
      expect(extractAllocationTextFromPdf).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByPlaceholderText('Paste allocation source text...')).toHaveValue(extractedText);
    expect(
      screen.getByText('Loaded dropped-allocation.pdf. Click Parse Source to validate and preview rows.'),
    ).toBeInTheDocument();
  });

  it('supports exact-date build date grouping in strategy view', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    const arrivalGroupingSelect = screen.getByLabelText('Build date grouping mode');
    await user.selectOptions(arrivalGroupingSelect, 'date');

    expect(screen.getAllByText('Mar 14').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mar 20').length).toBeGreaterThan(0);
    expect(screen.queryByText('BUILD 8-30 DAYS')).toBeNull();
  });

  it('shows large vehicle-focused cards without coaching copy', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    const strategyView = screen.getByTestId('allocation-strategy-view');

    expect(screen.getAllByTestId('allocation-strategy-vehicle-card').length).toBeGreaterThan(0);
    expect(screen.getByText('TX500H')).toBeInTheDocument();
    expect(screen.getAllByText('Mar 14').length).toBeGreaterThan(0);
    expect(screen.getByText('Trim: F SPORT')).toBeInTheDocument();
    expect(screen.getByText(/Exterior: WHITE/i)).toBeInTheDocument();
    expect(screen.getByText(/Interior: EA20 BLACK/i)).toBeInTheDocument();
    expect(within(strategyView).getByText(/Changeable/i)).toBeInTheDocument();
    expect(within(strategyView).getByText(/Locked/i)).toBeInTheDocument();
    expect(screen.queryByText(/Qty:/i)).toBeNull();
    expect(screen.queryByText('Top Actions Right Now')).toBeNull();
    expect(screen.queryByText('Strategy Summary')).toBeNull();
    expect(screen.queryByText(/Contact active buyers today/i)).toBeNull();
    expect(screen.queryByText('Entries:')).toBeNull();
    expect(screen.queryByText('Nameplates:')).toBeNull();
  });

  it('filters strategy cards by BOS status', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    const strategyView = screen.getByTestId('allocation-strategy-view');

    const bosSelect = screen.getByLabelText('Filter by BOS');
    await user.selectOptions(bosSelect, 'y');

    expect(screen.getByText('TX500H')).toBeInTheDocument();
    expect(screen.queryByText('RX350')).toBeNull();
    expect(within(strategyView).getByText(/Changeable/i)).toBeInTheDocument();
    expect(within(strategyView).queryByText(/Locked/i)).toBeNull();
    expect(screen.getAllByTestId('allocation-strategy-vehicle-card')).toHaveLength(1);
  });

  it('hides quantity values in log view for single-unit entries', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Full Log View' }));

    const logView = screen.getByTestId('allocation-log-view');
    const bodyRows = within(logView).getAllByRole('row').slice(1);

    bodyRows.forEach((row) => {
      const cells = within(row).getAllByRole('cell');
      expect(cells[6]).toHaveTextContent(/^\s*$/);
    });
  });
});
