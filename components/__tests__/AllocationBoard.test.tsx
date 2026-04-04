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
      model: 'TX500H',
      sourceCode: '9704F',
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
      factoryAccessories: 'KG MF WL',
      postProductionOptions: '1S 2T 59 DF',
    },
    {
      id: '2',
      code: 'RX350',
      model: 'RX350',
      sourceCode: '9443F',
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

  it('parses real DM pasted source and publishes factual snapshot payload', async () => {
    publishAllocationSnapshot.mockResolvedValue(undefined);

    const sourceText = [
      '3/5/2026 Toyota District Manager Allocation Application',
      'Dealer: 64506-PRIORITY LEXUS VIRGNA BCH',
      '14 031 9443F TI12DC97 9 Y 0085-46 02210 03-16',
      '( RX450H+ LUX AWD 5-DOOR SUV )',
      '( EMINENT WHITE PEARL )',
    ].join('\n');

    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const sourceTextarea = screen.getByPlaceholderText('Paste allocation source text...');
    fireEvent.change(sourceTextarea, { target: { value: sourceText } });

    await user.click(screen.getByRole('button', { name: 'Parse Source' }));

    await waitFor(() => {
      expect(screen.getByText(/Parsed 1 rows successfully\./i)).toBeInTheDocument();
    });

    const publishButton = screen.getByRole('button', { name: 'Publish Snapshot' });
    expect(publishButton).toBeEnabled();

    await user.click(publishButton);

    await waitFor(() => {
      expect(publishAllocationSnapshot).toHaveBeenCalledTimes(1);
    });

    const [payload, uid, email] = publishAllocationSnapshot.mock.calls[0];
    expect(uid).toBe('manager-1');
    expect(email).toBe('manager@priorityautomotive.com');
    expect(payload.itemCount).toBe(1);
    expect(payload.vehicles[0].code).toBe('RX450H+');
    expect(payload.vehicles[0].sourceCode).toBe('9443F');
    expect(payload.vehicles[0].model).toBe('RX450H+');
    expect(payload.vehicles[0].arrival).toBe('2026-03-16');
    expect(payload.vehicles[0].color).toBe('085 EMINENT WHITE PEARL');
    expect(payload.vehicles[0].interiorColor).toBe('46');
    expect(payload.vehicles[0].bos).toBe('N');
  });

  it('keeps sourceCode in publish payload for wrapped source lines before model', async () => {
    publishAllocationSnapshot.mockResolvedValue(undefined);

    const sourceText = [
      '9353F INT EA26 FACTORY ACCY: BI CC',
      'CP TP PPOs: 1S 2T 59 DF',
      'BOS Y LOC 03-23',
      'GX550 CAVIAR / BLACK',
    ].join('\n');

    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const sourceTextarea = screen.getByPlaceholderText('Paste allocation source text...');
    fireEvent.change(sourceTextarea, { target: { value: sourceText } });

    await user.click(screen.getByRole('button', { name: 'Parse Source' }));

    await waitFor(() => {
      expect(screen.getByText(/Parsed 1 rows/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Publish Snapshot' }));

    await waitFor(() => {
      expect(publishAllocationSnapshot).toHaveBeenCalledTimes(1);
    });

    const [payload] = publishAllocationSnapshot.mock.calls[0];
    expect(payload.vehicles[0].sourceCode).toBe('9353F');
    expect(payload.vehicles[0].code).toBe('GX550');
    expect(payload.vehicles[0].model).toBe('GX550');

    const vehicle = payload.vehicles[0] as (typeof payload.vehicles)[number] & {
      factoryAccessories?: string[];
      postProductionOptions?: string[];
    };
    expect(vehicle.factoryAccessories).toEqual(['BI', 'CC', 'CP', 'TP']);
    expect(vehicle.postProductionOptions).toEqual(['1S', '2T', '59', 'DF']);
  });

  it('preserves factory accessories and PPOs from parse to publish and display', async () => {
    publishAllocationSnapshot.mockResolvedValue(undefined);

    const sourceText = [
      '9353F INT EA26 FACTORY ACCY: BI CC',
      'CP TP PPOs: 1S 2T 59 DF',
      'BOS Y LOC 03-23',
      'GX550 CAVIAR / BLACK',
    ].join('\n');

    const firstRender = render(<AllocationBoard currentUser={managerUser} />);
    const managerUserEvent = userEvent.setup();

    await managerUserEvent.click(await screen.findByTestId('allocation-manager-toggle'));

    const sourceTextarea = screen.getByPlaceholderText('Paste allocation source text...');
    fireEvent.change(sourceTextarea, { target: { value: sourceText } });

    await managerUserEvent.click(screen.getByRole('button', { name: 'Parse Source' }));

    await waitFor(() => {
      expect(screen.getByText(/Parsed 1 rows/i)).toBeInTheDocument();
    });

    await managerUserEvent.click(screen.getByRole('button', { name: 'Publish Snapshot' }));

    await waitFor(() => {
      expect(publishAllocationSnapshot).toHaveBeenCalledTimes(1);
    });

    const [payload] = publishAllocationSnapshot.mock.calls[0];
    const publishedVehicle = payload.vehicles[0] as (typeof payload.vehicles)[number] & {
      factoryAccessories?: string[];
      postProductionOptions?: string[];
    };
    expect(publishedVehicle.factoryAccessories).toEqual(['BI', 'CC', 'CP', 'TP']);
    expect(publishedVehicle.postProductionOptions).toEqual(['1S', '2T', '59', 'DF']);

    firstRender.unmount();

    subscribeLatestAllocationSnapshot.mockReset();
    subscribeLatestAllocationSnapshot.mockImplementation((callback: (snapshot: unknown) => void) => {
      callback({
        ...sampleSnapshot,
        id: 'snapshot-from-publish',
        itemCount: payload.itemCount,
        summary: payload.summary,
        vehicles: payload.vehicles.map((vehicle: (typeof payload.vehicles)[number], index: number) => ({
          ...vehicle,
          id: `published-${index}`,
        })),
      });
      return () => undefined;
    });

    render(<AllocationBoard currentUser={consultantUser} />);
    const consultantUserEvent = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    const strategyView = screen.getByTestId('allocation-strategy-view');
    expect(within(strategyView).getByText('BI, CC, CP, TP')).toBeInTheDocument();
    expect(within(strategyView).getByText('1S, 2T, 59, DF')).toBeInTheDocument();

    await consultantUserEvent.click(screen.getByRole('button', { name: 'Full Log View' }));

    const logView = screen.getByTestId('allocation-log-view');
    expect(within(logView).getByText('BI, CC, CP, TP')).toBeInTheDocument();
    expect(within(logView).getByText('1S, 2T, 59, DF')).toBeInTheDocument();
  });

  it('captures DM row option tokens into accessories and PPOs in publish payload', async () => {
    publishAllocationSnapshot.mockResolvedValue(undefined);

    const sourceText = [
      '2/19/2026 Toyota District Manager Allocation Application District:06 08:17:13 AM Allocation Status By Dealer',
      'Dealer: 64506-PRIORITY LEXUS VIRGNA BCH',
      '1 022 9353F TS12I666 8 Y 0223-01 01728 Y BI CC CP TP 1S 2T 59 87 DF Z1 0',
      '4-02 ( TX 350 AWD TX 350 AWD )',
      '( CA VIAR )',
    ].join('\n');

    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const sourceTextarea = screen.getByPlaceholderText('Paste allocation source text...');
    fireEvent.change(sourceTextarea, { target: { value: sourceText } });

    await user.click(screen.getByRole('button', { name: 'Parse Source' }));

    await waitFor(() => {
      expect(screen.getByText(/Parsed 1 rows/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Publish Snapshot' }));

    await waitFor(() => {
      expect(publishAllocationSnapshot).toHaveBeenCalledTimes(1);
    });

    const [payload] = publishAllocationSnapshot.mock.calls[0];
    const vehicle = payload.vehicles[0] as (typeof payload.vehicles)[number] & {
      factoryAccessories?: string[];
      postProductionOptions?: string[];
    };
    expect(vehicle.factoryAccessories).toEqual(['BI', 'CC', 'CP', 'TP']);
    expect(vehicle.postProductionOptions).toEqual(['1S', '2T', '59', '87', 'DF', 'Z1']);
  });

  it('keeps distinct sourceCode values for consecutive wrapped rows in publish payload', async () => {
    publishAllocationSnapshot.mockResolvedValue(undefined);

    const sourceText = [
      '9706F INT 20 FACTORY ACCY: KG MF WL PPOs: 1S 2T 59 DF GN',
      'BOS Y LOC 03-23',
      'GX550 CAVIAR / BLACK',
      '9353F INT EA26 FACTORY ACCY: BI CC CP TP',
      'PPOs: 1S 2T 59 DF',
      'BOS N LOC 03-26',
      'TX350 CLOUD BURST / BLACK',
    ].join('\n');

    render(<AllocationBoard currentUser={managerUser} />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('allocation-manager-toggle'));

    const sourceTextarea = screen.getByPlaceholderText('Paste allocation source text...');
    fireEvent.change(sourceTextarea, { target: { value: sourceText } });

    await user.click(screen.getByRole('button', { name: 'Parse Source' }));

    await waitFor(() => {
      expect(screen.getByText(/Parsed 2 rows/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Publish Snapshot' }));

    await waitFor(() => {
      expect(publishAllocationSnapshot).toHaveBeenCalledTimes(1);
    });

    const [payload] = publishAllocationSnapshot.mock.calls[0];
    expect(payload.itemCount).toBe(2);
    expect(payload.vehicles[0].code).toBe('GX550');
    expect(payload.vehicles[0].sourceCode).toBe('9706F');
    expect(payload.vehicles[1].code).toBe('TX350');
    expect(payload.vehicles[1].sourceCode).toBe('9353F');
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

  it('shows dense factual vehicle cards without coaching copy', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    const strategyView = screen.getByTestId('allocation-strategy-view');

    expect(screen.getAllByTestId('allocation-strategy-vehicle-card').length).toBeGreaterThan(0);
    expect(screen.getByText('TX500H')).toBeInTheDocument();
    expect(screen.getAllByText('Mar 14').length).toBeGreaterThan(0);
    expect(screen.getByText('Trim: F SPORT')).toBeInTheDocument();
    expect(screen.queryByText(/Priority: Critical/i)).toBeNull();
    expect(screen.queryByText(/Category: Growth/i)).toBeNull();
    expect(within(strategyView).getAllByText('Exterior').length).toBeGreaterThan(0);
    expect(within(strategyView).getAllByText('Interior').length).toBeGreaterThan(0);
    expect(within(strategyView).getByText('WHITE')).toBeInTheDocument();
    expect(within(strategyView).getByText('EA20 BLACK')).toBeInTheDocument();
    expect(within(strategyView).getAllByText(/Days Out/i).length).toBeGreaterThan(0);
    expect(within(strategyView).getAllByText(/Build \/ Port/i).length).toBeGreaterThan(0);
    expect(within(strategyView).getAllByText(/Factory Accessories/i)).toHaveLength(1);
    expect(within(strategyView).getAllByText(/Post-Production Options/i)).toHaveLength(1);
    expect(within(strategyView).getByText('KG MF WL')).toBeInTheDocument();
    expect(within(strategyView).getByText('1S 2T 59 DF')).toBeInTheDocument();
    expect(within(strategyView).queryByText(/BOS:\s*N/i)).toBeNull();
    expect(within(strategyView).queryByText(/BOS:\s*TBD/i)).toBeNull();
    expect(screen.queryByText(/Qty:/i)).toBeNull();
    expect(screen.queryByText('Top Actions Right Now')).toBeNull();
    expect(screen.queryByText('Strategy Summary')).toBeNull();
    expect(screen.queryByText(/Contact active buyers today/i)).toBeNull();
    expect(screen.queryByText('Entries:')).toBeNull();
    expect(screen.queryByText('Nameplates:')).toBeNull();
  });

  it('shows 4-digit code separately from model in strategy and full log views', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    expect(screen.getByText('9704')).toBeInTheDocument();
    expect(screen.getByText('9443')).toBeInTheDocument();
    expect(screen.getAllByText('TX500H').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RX350').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Full Log View' }));

    const logView = screen.getByTestId('allocation-log-view');
    expect(logView).toBeInTheDocument();
    const headers = within(logView).getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      'Code',
      'Model',
      'Grade / Trim',
      'Build / Port',
      'BOS',
      'Qty',
      'Matched Orders',
      'Factory Accessories',
      'Post-Production Options',
    ]);
    expect(within(logView).getAllByText('9704').length).toBeGreaterThan(0);
    expect(within(logView).getAllByText('9443').length).toBeGreaterThan(0);
    expect(within(logView).getAllByText('TX500H').length).toBeGreaterThan(0);
    expect(within(logView).getAllByText('RX350').length).toBeGreaterThan(0);
    expect(within(logView).getByText('KG MF WL')).toBeInTheDocument();
    expect(within(logView).getByText('1S 2T 59 DF')).toBeInTheDocument();
  });

  it('filters strategy cards by BOS status', async () => {
    render(<AllocationBoard currentUser={consultantUser} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('allocation-strategy-view')).toBeInTheDocument();
    });

    const bosSelect = screen.getByLabelText('Filter by BOS');
    await user.selectOptions(bosSelect, 'y');

    expect(screen.getByText('TX500H')).toBeInTheDocument();
    expect(screen.queryByText('RX350')).toBeNull();
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
      expect(cells[5]).toHaveTextContent(/^\s*$/);
    });
  });
});
