import { describe, it, expect } from 'vitest';
import {
  parseCSVString,
  parseDate,
  parseDeposit,
  deriveStatus,
  expandModelName,
  mapHeaders,
  validateRow,
  parseCSVToOrders,
  ParsedCSVRow,
} from '../csvParser';
import { OrderStatus } from '../../../types';

describe('parseCSVString', () => {
  it('parses simple CSV content', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    const result = parseCSVString(csv);
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,amount\n"Doe, John","$1,000"';
    const result = parseCSVString(csv);
    expect(result).toEqual([
      ['name', 'amount'],
      ['Doe, John', '$1,000'],
    ]);
  });

  it('handles escaped quotes in quoted fields', () => {
    const csv = 'text\n"He said ""Hello"""';
    const result = parseCSVString(csv);
    expect(result).toEqual([
      ['text'],
      ['He said "Hello"'],
    ]);
  });

  it('handles Windows line endings (CRLF)', () => {
    const csv = 'a,b\r\n1,2\r\n3,4';
    const result = parseCSVString(csv);
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles empty fields', () => {
    const csv = 'a,,c\n1,,3';
    const result = parseCSVString(csv);
    expect(result).toEqual([
      ['a', '', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('skips completely empty lines', () => {
    const csv = 'a,b\n\n1,2\n\n';
    const result = parseCSVString(csv);
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseDate', () => {
  it('parses M/D format with current year', () => {
    const result = parseDate('1/22');
    const currentYear = new Date().getFullYear();
    expect(result).toBe(`${currentYear}-01-22`);
  });

  it('parses M/D/YY format', () => {
    const result = parseDate('6/23/24');
    expect(result).toBe('2024-06-23');
  });

  it('parses M/D/YYYY format', () => {
    const result = parseDate('7/11/2025');
    expect(result).toBe('2025-07-11');
  });

  it('parses MM/DD format', () => {
    const result = parseDate('10/04');
    const currentYear = new Date().getFullYear();
    expect(result).toBe(`${currentYear}-10-04`);
  });

  it('returns today for empty string', () => {
    const result = parseDate('');
    const today = new Date().toISOString().split('T')[0];
    expect(result).toBe(today);
  });

  it('returns today for invalid date', () => {
    const result = parseDate('invalid');
    const today = new Date().toISOString().split('T')[0];
    expect(result).toBe(today);
  });
});

describe('parseDeposit', () => {
  it('parses dollar amount with comma', () => {
    expect(parseDeposit('$1,000')).toBe(1000);
  });

  it('parses plain number', () => {
    expect(parseDeposit('500')).toBe(500);
  });

  it('parses amount without dollar sign', () => {
    expect(parseDeposit('1,500')).toBe(1500);
  });

  it('returns 0 for empty string', () => {
    expect(parseDeposit('')).toBe(0);
  });

  it('returns 0 for invalid input', () => {
    expect(parseDeposit('abc')).toBe(0);
  });

  it('parses decimal amounts', () => {
    expect(parseDeposit('$1,000.50')).toBe(1000.5);
  });
});

describe('deriveStatus', () => {
  it('returns Locate for LOCATE keyword', () => {
    expect(deriveStatus('LOCATE')).toBe(OrderStatus.Locate);
  });

  it('returns Locate for locate in sentence', () => {
    expect(deriveStatus('NEED TO LOCATE')).toBe(OrderStatus.Locate);
  });

  it('returns DealerExchange for DEALER EXCHANGE keyword', () => {
    expect(deriveStatus('DEALER EXCHANGE NEEDED')).toBe(OrderStatus.DealerExchange);
  });

  it('returns FactoryOrder for INCOMING keyword', () => {
    expect(deriveStatus('INCOMING')).toBe(OrderStatus.FactoryOrder);
  });

  it('returns FactoryOrder for HERE keyword', () => {
    expect(deriveStatus('HERE')).toBe(OrderStatus.FactoryOrder);
  });

  it('returns FactoryOrder as default', () => {
    expect(deriveStatus('SOME OTHER TEXT')).toBe(OrderStatus.FactoryOrder);
  });

  it('is case insensitive', () => {
    expect(deriveStatus('locate')).toBe(OrderStatus.Locate);
  });
});

describe('expandModelName', () => {
  it('expands ES', () => {
    expect(expandModelName('ES')).toBe('Lexus ES');
  });

  it('expands GX', () => {
    expect(expandModelName('GX')).toBe('Lexus GX');
  });

  it('expands RXH', () => {
    expect(expandModelName('RXH')).toBe('Lexus RX Hybrid');
  });

  it('expands NXH', () => {
    expect(expandModelName('NXH')).toBe('Lexus NX Hybrid');
  });

  it('returns original if not in map', () => {
    expect(expandModelName('UNKNOWN')).toBe('UNKNOWN');
  });

  it('handles lowercase input', () => {
    expect(expandModelName('ls')).toBe('Lexus LS');
  });
});

describe('mapHeaders', () => {
  it('maps standard headers', () => {
    const headers = ['DATE', 'CUSTOMER', 'SALES PERSON', 'DEPOSIT'];
    const result = mapHeaders(headers);
    expect(result.get('date')).toBe(0);
    expect(result.get('customer')).toBe(1);
    expect(result.get('salesPerson')).toBe(2);
    expect(result.get('deposit')).toBe(3);
  });

  it('handles different case', () => {
    const headers = ['date', 'Customer', 'SALES PERSON'];
    const result = mapHeaders(headers);
    expect(result.get('date')).toBe(0);
    expect(result.get('customer')).toBe(1);
    expect(result.get('salesPerson')).toBe(2);
  });

  it('maps Deal # correctly', () => {
    const headers = ['DEAL #', 'MODEL #'];
    const result = mapHeaders(headers);
    expect(result.get('dealNumber')).toBe(0);
    expect(result.get('modelNumber')).toBe(1);
  });
});

describe('validateRow', () => {
  it('passes valid row', () => {
    const row: ParsedCSVRow = {
      date: '1/22',
      customer: 'PAUL',
      salesPerson: 'JORDAN',
      deposit: '$1,000',
      dealNumber: '12345',
      modelNumber: '9146',
      year: '25',
      model: 'LSH',
      extColor: '3R1',
      intColor: 'WHIT',
      manager: 'GH',
      options: '',
    };
    const result = validateRow(row, 1);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when customer is empty', () => {
    const row: ParsedCSVRow = {
      date: '1/22',
      customer: '',
      salesPerson: 'JORDAN',
      deposit: '$1,000',
      dealNumber: '12345',
      modelNumber: '9146',
      year: '25',
      model: 'LSH',
      extColor: '3R1',
      intColor: 'WHIT',
      manager: 'GH',
      options: '',
    };
    const result = validateRow(row, 2);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Row 2: Customer name is required');
  });

  it('warns when salesperson is empty', () => {
    const row: ParsedCSVRow = {
      date: '1/22',
      customer: 'PAUL',
      salesPerson: '',
      deposit: '$1,000',
      dealNumber: '12345',
      modelNumber: '9146',
      year: '25',
      model: 'LSH',
      extColor: '3R1',
      intColor: 'WHIT',
      manager: 'GH',
      options: '',
    };
    const result = validateRow(row, 1);
    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('Row 1: Salesperson is empty');
  });
});

describe('parseCSVToOrders', () => {
  const sampleCSV = `DATE,CUSTOMER,SALES PERSON,DEPOSIT,DEAL #,,MODEL #,YEAR,MODEL,EXT COLOR,INT COLOR,MANAGER,OPTIONS
1/22,PAUL,JORDAN,"$1,000",,,9146,25,LSH,3R1,WHIT,GH,
6/23,JOHNSON,JORDAN,"$1,000",52440,,9702,25,GX,223,20,,NEED BLK/BLK BS
7/11,HILL,JORDAN,"$1,000",,,9705,25,GX,85,40,,INCOMING
10/4,GREEN,JAY,"$1,000",80552,,9126,25,LS,85,,GH,LOCATE`;

  it('parses sample CSV correctly', () => {
    const result = parseCSVToOrders(sampleCSV);
    expect(result.errors).toHaveLength(0);
    expect(result.orders).toHaveLength(4);
    expect(result.totalRows).toBe(4);
    expect(result.skippedRows).toBe(0);
  });

  it('extracts customer names correctly', () => {
    const result = parseCSVToOrders(sampleCSV);
    const customerNames = result.orders.map(o => o.customerName);
    expect(customerNames).toContain('PAUL');
    expect(customerNames).toContain('JOHNSON');
    expect(customerNames).toContain('HILL');
    expect(customerNames).toContain('GREEN');
  });

  it('derives status from options', () => {
    const result = parseCSVToOrders(sampleCSV);
    const greenOrder = result.orders.find(o => o.customerName === 'GREEN');
    expect(greenOrder?.status).toBe(OrderStatus.Locate);

    const hillOrder = result.orders.find(o => o.customerName === 'HILL');
    expect(hillOrder?.status).toBe(OrderStatus.FactoryOrder);
  });

  it('parses deposit amounts correctly', () => {
    const result = parseCSVToOrders(sampleCSV);
    result.orders.forEach(order => {
      expect(order.depositAmount).toBe(1000);
    });
  });

  it('expands model abbreviations', () => {
    const result = parseCSVToOrders(sampleCSV);
    const paulOrder = result.orders.find(o => o.customerName === 'PAUL');
    expect(paulOrder?.model).toBe('Lexus LS Hybrid');

    const johnsonOrder = result.orders.find(o => o.customerName === 'JOHNSON');
    expect(johnsonOrder?.model).toBe('Lexus GX');
  });

  it('sets source to csv_upload', () => {
    const result = parseCSVToOrders(sampleCSV);
    result.orders.forEach(order => {
      expect(order.source).toBe('csv_upload');
    });
  });

  it('handles year conversion from 2-digit to 4-digit', () => {
    const result = parseCSVToOrders(sampleCSV);
    result.orders.forEach(order => {
      expect(order.year).toBe('2025');
    });
  });

  it('returns error for empty CSV', () => {
    const result = parseCSVToOrders('');
    expect(result.errors).toContain('CSV file is empty');
  });

  it('returns error for CSV without CUSTOMER column', () => {
    const csv = 'NAME,AMOUNT\nJohn,100';
    const result = parseCSVToOrders(csv);
    expect(result.errors).toContain('CSV must have a "CUSTOMER" column');
  });

  it('skips rows without customer name', () => {
    const csv = `CUSTOMER,SALES PERSON
PAUL,JORDAN
,EMPTY_ROW`;
    const result = parseCSVToOrders(csv);
    expect(result.orders).toHaveLength(1);
    expect(result.skippedRows).toBe(1);
  });

  it('handles the full sample CSV from the issue', () => {
    const fullCSV = `DATE,CUSTOMER,SALES PERSON,DEPOSIT,DEAL #,,MODEL #,YEAR,MODEL,EXT COLOR,INT COLOR,MANAGER,OPTIONS
1/22,PAUL,JORDAN,"$1,000",,,9146,25,LSH,3R1,WHIT,GH,
6/23,JOHNSON,JORDAN,"$1,000",52440,,9702,25,GX,223,20,,NEED BLK/BLK BS
7/11,HILL,JORDAN,"$1,000",,,9705,25,GX,85,40,,INCOMING
9/8,JACKSON,JAY,"$1,000",80351,,9702,26,GX,223,41,,2ND 01H9/41
9/20,KYRUS,BELOS,"$1,000",,,9458,26,RXH,1L8,24,GH,2026 INCOG/BLK LOADED
10/4,GREEN,JAY,"$1,000",80552,,9126,25,LS,85,,GH,LOCATE
10/13,RAMOS,JAY,"$1,000",80611,,9556,25,IS,,,GH,IS 500/NEED
10/16,RICE,JAY,"$1,000",80630,,9412,26,RX,85,B02,GH,HERE
10/2,PETERS,JOHNSON,"$1,000",80662,,9846,26,NXH,1J7,A03,GH,INCOMING
10/19,WHITE,WILLIAM,"$1,000",,,9846,26,NXH,1J7,A40,JB,INCOMING
11/1,TRIMBLE,JOHNSON,"$1,000",80770,,9004,25,ES,4X8,2,,INCOMING
10/30,KESTER,JAY,"$1,000",80740,,9453,26,RXH,1L2,A02,JB,INCOMING
11/3,SHOOK,LENZO,"$1,000",80784,,9854,26,NXH,3T5,23,GH,LOCATE- NONE IN COUNTRY YET
11/4,MCNEIL,JEFF,"$1,000",80793,,9702,25,GX,85,41,GH,
11/18,THOMPSON,JOHNSON,"$1,000",80890,,9702,26,GX,223,,,BLACK /?`;

    const result = parseCSVToOrders(fullCSV);
    expect(result.errors).toHaveLength(0);
    expect(result.orders).toHaveLength(15);

    // Verify all customer names are present
    const expectedCustomers = [
      'PAUL', 'JOHNSON', 'HILL', 'JACKSON', 'KYRUS',
      'GREEN', 'RAMOS', 'RICE', 'PETERS', 'WHITE',
      'TRIMBLE', 'KESTER', 'SHOOK', 'MCNEIL', 'THOMPSON'
    ];
    const actualCustomers = result.orders.map(o => o.customerName);
    expectedCustomers.forEach(customer => {
      expect(actualCustomers).toContain(customer);
    });

    // Verify status derivation for specific entries
    const shookOrder = result.orders.find(o => o.customerName === 'SHOOK');
    expect(shookOrder?.status).toBe(OrderStatus.Locate);

    const riceOrder = result.orders.find(o => o.customerName === 'RICE');
    expect(riceOrder?.status).toBe(OrderStatus.FactoryOrder);
  });
});
