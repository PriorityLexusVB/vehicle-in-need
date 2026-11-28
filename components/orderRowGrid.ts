/**
 * Shared column template for the manager order rows on wide screens (xl+).
 * OrderList's header row and every OrderCard summary use this exact string,
 * so the column headings always line up with the cells beneath them.
 * Columns: Customer, Salesperson, Vehicle, Colors, Deposit, Car, Latest note, expand.
 * (OrderCard keeps a phone-friendly DOM order and uses xl:order-* to match.)
 */
export const ORDER_ROW_GRID_XL =
  "xl:grid-cols-[minmax(0,1.3fr)_minmax(0,.85fr)_minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,.6fr)_minmax(0,1.05fr)_minmax(0,1.4fr)_2.75rem]";

export const ORDER_ROW_COLUMNS = [
  "Customer",
  "Salesperson",
  "Vehicle",
  "Colors",
  "Deposit",
  "Car",
  "Latest note",
] as const;
