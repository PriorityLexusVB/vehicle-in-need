import { OrderStatus } from '../../types';

/**
 * Represents a parsed CSV row before conversion to an Order.
 */
export interface ParsedCSVRow {
  date: string;
  customer: string;
  salesPerson: string;
  deposit: string;
  dealNumber: string;
  modelNumber: string;
  year: string;
  model: string;
  extColor: string;
  intColor: string;
  manager: string;
  options: string;
}

/**
 * Represents the order data ready to be saved to Firestore.
 * Excludes `id`, `createdAt`, `createdByUid`, `createdByEmail` which are set at write time.
 */
export interface CSVOrderData {
  salesperson: string;
  manager: string;
  date: string;
  customerName: string;
  dealNumber: string;
  stockNumber: string;
  vin: string;
  year: string;
  model: string;
  modelNumber: string;
  exteriorColor1: string;
  exteriorColor2: string;
  exteriorColor3: string;
  interiorColor1: string;
  interiorColor2: string;
  interiorColor3: string;
  msrp: number;
  sellingPrice: number | undefined;
  gross: number | undefined;
  depositAmount: number;
  status: OrderStatus;
  options: string;
  notes: string;
  source: string;
}

/**
 * Expected CSV column headers (case-insensitive matching).
 */
const CSV_COLUMN_MAP: Record<string, keyof ParsedCSVRow> = {
  'date': 'date',
  'customer': 'customer',
  'sales person': 'salesPerson',
  'salesperson': 'salesPerson',
  'deposit': 'deposit',
  'deal #': 'dealNumber',
  'deal number': 'dealNumber',
  'model #': 'modelNumber',
  'model number': 'modelNumber',
  'year': 'year',
  'model': 'model',
  'ext color': 'extColor',
  'ext_color': 'extColor',
  'exterior color': 'extColor',
  'int color': 'intColor',
  'int_color': 'intColor',
  'interior color': 'intColor',
  'manager': 'manager',
  'options': 'options',
};

/**
 * Parse a CSV string into an array of string arrays (rows).
 * Handles quoted fields with commas and escaped quotes.
 */
export function parseCSVString(csvContent: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentLine.push(currentField.trim());
        if (currentLine.some(field => field !== '')) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
        if (char === '\r') i++; // Skip \n after \r
      } else if (char === '\r') {
        currentLine.push(currentField.trim());
        if (currentLine.some(field => field !== '')) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Handle last field/line
  currentLine.push(currentField.trim());
  if (currentLine.some(field => field !== '')) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Parse a date string in various formats (M/D, MM/DD, M/D/YY, M/D/YYYY) to ISO format.
 */
export function parseDate(dateStr: string): string {
  if (!dateStr) {
    return new Date().toISOString().split('T')[0];
  }

  const parts = dateStr.split('/');
  const currentYear = new Date().getFullYear();

  if (parts.length >= 2) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    let year = currentYear;

    if (parts.length >= 3 && parts[2]) {
      const yearPart = parseInt(parts[2], 10);
      year = yearPart < 100 ? 2000 + yearPart : yearPart;
    }

    // Validate date parts
    if (!isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const paddedMonth = month.toString().padStart(2, '0');
      const paddedDay = day.toString().padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
  }

  // Return today's date if parsing fails
  return new Date().toISOString().split('T')[0];
}

/**
 * Parse a deposit amount string (e.g., "$1,000" or "1000") to a number.
 */
export function parseDeposit(depositStr: string): number {
  if (!depositStr) return 0;
  
  // Remove $ and commas, then parse
  const cleaned = depositStr.replace(/[$,]/g, '').trim();
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

/**
 * Derive order status from the options/notes text.
 * 
 * Priority order for status detection (first match wins):
 * 1. DEALER EXCHANGE / DEALER-EXCHANGE → Dealer Exchange status
 * 2. INCOMING / HERE → Factory Order status
 * 3. LOCATE → Factory Order status (legacy: Locate status is no longer used, mapped to Factory Order)
 * 4. Default → Factory Order status
 * 
 * Note: The Locate status has been removed from the UI. CSV imports with "LOCATE" keywords
 * will now be mapped to Factory Order status instead.
 */
export function deriveStatus(options: string): OrderStatus {
  const normalizedOptions = options.toUpperCase();

  if (normalizedOptions.includes('DEALER EXCHANGE') || normalizedOptions.includes('DEALER-EXCHANGE')) {
    return OrderStatus.DealerExchange;
  }
  if (normalizedOptions.includes('INCOMING') || normalizedOptions.includes('HERE')) {
    return OrderStatus.FactoryOrder;
  }
  // Legacy: LOCATE keyword now maps to Factory Order since Locate status is no longer selectable
  if (normalizedOptions.includes('LOCATE')) {
    return OrderStatus.FactoryOrder;
  }
  
  // Default to Factory Order
  return OrderStatus.FactoryOrder;
}

/**
 * Expand model abbreviations to full model names.
 */
export function expandModelName(modelAbbr: string): string {
  const modelMap: Record<string, string> = {
    'ES': 'Lexus ES',
    'IS': 'Lexus IS',
    'LS': 'Lexus LS',
    'LSH': 'Lexus LS Hybrid',
    'GX': 'Lexus GX',
    'LX': 'Lexus LX',
    'NX': 'Lexus NX',
    'NXH': 'Lexus NX Hybrid',
    'RX': 'Lexus RX',
    'RXH': 'Lexus RX Hybrid',
    'TX': 'Lexus TX',
    'UX': 'Lexus UX',
    'RC': 'Lexus RC',
    'LC': 'Lexus LC',
  };

  const abbr = modelAbbr.toUpperCase().trim();
  return modelMap[abbr] || modelAbbr;
}

/**
 * Map column headers to their indices.
 */
export function mapHeaders(headerRow: string[]): Map<keyof ParsedCSVRow, number> {
  const headerMap = new Map<keyof ParsedCSVRow, number>();

  headerRow.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();
    const mappedKey = CSV_COLUMN_MAP[normalizedHeader];
    if (mappedKey) {
      headerMap.set(mappedKey, index);
    }
  });

  return headerMap;
}

/**
 * Validation result for a single row.
 */
export interface RowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a parsed CSV row.
 */
export function validateRow(row: ParsedCSVRow, rowIndex: number): RowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!row.customer || row.customer.trim() === '') {
    errors.push(`Row ${rowIndex}: Customer name is required`);
  }

  // Warnings for missing optional but recommended fields
  if (!row.salesPerson || row.salesPerson.trim() === '') {
    warnings.push(`Row ${rowIndex}: Salesperson is empty`);
  }
  if (!row.year || row.year.trim() === '') {
    warnings.push(`Row ${rowIndex}: Year is empty, will use current year`);
  }
  if (!row.model || row.model.trim() === '') {
    warnings.push(`Row ${rowIndex}: Model is empty`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse CSV content and convert to order data ready for Firestore.
 */
export interface ParseCSVResult {
  orders: CSVOrderData[];
  errors: string[];
  warnings: string[];
  skippedRows: number;
  totalRows: number;
}

export function parseCSVToOrders(csvContent: string): ParseCSVResult {
  const result: ParseCSVResult = {
    orders: [],
    errors: [],
    warnings: [],
    skippedRows: 0,
    totalRows: 0,
  };

  const rows = parseCSVString(csvContent);
  
  if (rows.length === 0) {
    result.errors.push('CSV file is empty');
    return result;
  }

  // First row is headers
  const headerRow = rows[0];
  const headerMap = mapHeaders(headerRow);

  // Check for required header columns
  if (!headerMap.has('customer')) {
    result.errors.push('CSV must have a "CUSTOMER" column');
    return result;
  }

  const dataRows = rows.slice(1);
  result.totalRows = dataRows.length;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowIndex = i + 2; // +2 for 1-indexed and header row

    // Parse row into structured data
    const parsedRow: ParsedCSVRow = {
      date: headerMap.has('date') ? (row[headerMap.get('date')!] || '') : '',
      customer: headerMap.has('customer') ? (row[headerMap.get('customer')!] || '') : '',
      salesPerson: headerMap.has('salesPerson') ? (row[headerMap.get('salesPerson')!] || '') : '',
      deposit: headerMap.has('deposit') ? (row[headerMap.get('deposit')!] || '') : '',
      dealNumber: headerMap.has('dealNumber') ? (row[headerMap.get('dealNumber')!] || '') : '',
      modelNumber: headerMap.has('modelNumber') ? (row[headerMap.get('modelNumber')!] || '') : '',
      year: headerMap.has('year') ? (row[headerMap.get('year')!] || '') : '',
      model: headerMap.has('model') ? (row[headerMap.get('model')!] || '') : '',
      extColor: headerMap.has('extColor') ? (row[headerMap.get('extColor')!] || '') : '',
      intColor: headerMap.has('intColor') ? (row[headerMap.get('intColor')!] || '') : '',
      manager: headerMap.has('manager') ? (row[headerMap.get('manager')!] || '') : '',
      options: headerMap.has('options') ? (row[headerMap.get('options')!] || '') : '',
    };

    // Validate row
    const validation = validateRow(parsedRow, rowIndex);
    result.warnings.push(...validation.warnings);

    if (!validation.isValid) {
      result.errors.push(...validation.errors);
      result.skippedRows++;
      continue;
    }

    // Convert to order data
    const currentYear = new Date().getFullYear().toString();
    const year = parsedRow.year.trim() || currentYear;
    
    // Handle year conversion with validation
    // Only support 2-digit years in the range "00" to "99", mapped to 2000-2099
    let fullYear: string;
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 0 || yearNum > 99) {
        result.warnings.push(`Row ${rowIndex}: 2-digit year "${year}" is invalid. Using current year.`);
        fullYear = currentYear;
      } else {
        fullYear = `20${year.padStart(2, '0')}`;
      }
    } else {
      fullYear = year;
    }
    
    const modelAbbr = parsedRow.model.trim();
    const fullModel = expandModelName(modelAbbr);
    
    // Generate a unique deal number if not provided
    // Format: CSV-[timestamp]-[row number padded to 4 digits] for uniqueness
    // Using rowIndex which includes header offset for consistency
    const dealNumber = parsedRow.dealNumber.trim() || `CSV-${Date.now()}-${String(rowIndex).padStart(4, '0')}`;

    const orderData: CSVOrderData = {
      salesperson: parsedRow.salesPerson.trim() || 'Unknown',
      manager: parsedRow.manager.trim() || 'Unknown',
      date: parseDate(parsedRow.date),
      customerName: parsedRow.customer.trim().toUpperCase(),
      dealNumber,
      stockNumber: '',
      vin: '',
      year: fullYear,
      model: fullModel,
      modelNumber: parsedRow.modelNumber.trim() || '',
      exteriorColor1: parsedRow.extColor.trim() || 'TBD',
      exteriorColor2: '',
      exteriorColor3: '',
      interiorColor1: parsedRow.intColor.trim() || 'TBD',
      interiorColor2: '',
      interiorColor3: '',
      msrp: 0, // Will be updated later or default
      sellingPrice: undefined,
      gross: undefined,
      depositAmount: parseDeposit(parsedRow.deposit),
      status: deriveStatus(parsedRow.options),
      options: parsedRow.options.trim() || 'From CSV import',
      notes: `Imported from CSV on ${new Date().toISOString().split('T')[0]}`,
      source: 'csv_upload',
    };

    result.orders.push(orderData);
  }

  return result;
}
