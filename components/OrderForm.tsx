
import React, { useState } from 'react';
import { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS, YEARS } from '../constants';
import { PlusIcon } from './icons/PlusIcon';

interface OrderFormProps {
  onAddOrder: (order: Omit<Order, 'id'>) => void | Promise<void>;
}

const initialFormState = {
  salesperson: '',
  manager: '',
  date: new Date().toISOString().split('T')[0],
  customerName: '',
  stockNumber: '',
  dealNumber: '',
  vin: '',
  year: YEARS[0],
  model: '',
  modelNumber: '',
  color: '',
  interiorColor: '',
  extOption1: '',
  extOption2: '',
  intOption1: '',
  intOption2: '',
  msrp: '',
  sellingPrice: '',
  gross: '',
  depositAmount: '',
  status: OrderStatus.FactoryOrder,
  options: '',
  notes: '',
};

const FormField: React.FC<{label: string, id: string, error?: string, children: React.ReactNode}> = ({ label, id, error, children }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="mt-1">{children}</div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
);

const OrderForm: React.FC<OrderFormProps> = ({ onAddOrder }) => {
  const [formState, setFormState] = useState(initialFormState);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initialFormState, string>>>({});

  const validate = () => {
    const newErrors: Partial<Record<keyof typeof initialFormState, string>> = {};
    if (!formState.salesperson) newErrors.salesperson = 'Salesperson is required';
    if (!formState.manager) newErrors.manager = 'Manager is required';
    if (!formState.customerName) newErrors.customerName = 'Customer name is required';
    if (!formState.model) newErrors.model = 'Model is required';
    if (!formState.color) newErrors.color = 'Exterior color is required';
    if (!formState.dealNumber) newErrors.dealNumber = 'Deal # is required';
    if (!formState.modelNumber) newErrors.modelNumber = 'Model # is required';
    if (!formState.interiorColor) newErrors.interiorColor = 'Interior Color # is required';
    if (!formState.options) newErrors.options = 'Options are required';

    if (!formState.depositAmount || isNaN(parseFloat(formState.depositAmount))) {
      newErrors.depositAmount = 'A valid deposit amount is required';
    }
    if (!formState.msrp || isNaN(parseFloat(formState.msrp))) {
      newErrors.msrp = 'A valid MSRP is required';
    }
    if (formState.sellingPrice && isNaN(parseFloat(formState.sellingPrice))) {
      newErrors.sellingPrice = 'Must be a valid number';
    }
    if (formState.gross && isNaN(parseFloat(formState.gross))) {
      newErrors.gross = 'Must be a valid number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onAddOrder({
        ...formState,
        msrp: parseFloat(formState.msrp),
        sellingPrice: formState.sellingPrice ? parseFloat(formState.sellingPrice) : undefined,
        gross: formState.gross ? parseFloat(formState.gross) : undefined,
        depositAmount: parseFloat(formState.depositAmount),
      });
      setFormState(initialFormState);
      setErrors({});
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prevState => ({ ...prevState, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({...prev, [name]: undefined}));
    }
  };

  const activeStatusOptions = STATUS_OPTIONS.filter(s => s !== OrderStatus.Delivered && s !== OrderStatus.Received);
  const inputClass = (name: keyof typeof initialFormState) => `block w-full p-2.5 border ${errors[name] ? 'border-red-500' : 'border-slate-300'} rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors`;
  const moneyInputClass = (name: keyof typeof initialFormState) => `pl-8 block w-full p-2.5 border ${errors[name] ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors`;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Add New Order</h2>
      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-600 border-b pb-2">Staff & Date</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <FormField label="Salesperson*" id="salesperson" error={errors.salesperson}>
                    <input type="text" id="salesperson" name="salesperson" value={formState.salesperson} onChange={handleChange} className={inputClass('salesperson')} />
                 </FormField>
                 <FormField label="Manager*" id="manager" error={errors.manager}>
                    <input type="text" id="manager" name="manager" value={formState.manager} onChange={handleChange} className={inputClass('manager')} />
                 </FormField>
                 <FormField label="Date*" id="date">
                    <input type="date" id="date" name="date" value={formState.date} onChange={handleChange} className={inputClass('date')} />
                 </FormField>
            </div>
        </div>
        
        <div className="space-y-4">
             <h3 className="text-base font-semibold text-slate-600 border-b pb-2">Customer & Deal</h3>
             <FormField label="Customer Name*" id="customerName" error={errors.customerName}>
                <input type="text" id="customerName" name="customerName" value={formState.customerName} onChange={handleChange} className={inputClass('customerName')} />
             </FormField>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Deal #*" id="dealNumber" error={errors.dealNumber}>
                    <input type="text" id="dealNumber" name="dealNumber" value={formState.dealNumber} onChange={handleChange} className={inputClass('dealNumber')} />
                </FormField>
                <FormField label="Stock #" id="stockNumber">
                    <input type="text" id="stockNumber" name="stockNumber" value={formState.stockNumber} onChange={handleChange} className={inputClass('stockNumber')} />
                </FormField>
                <FormField label="VIN (Last 8)" id="vin">
                    <input type="text" id="vin" name="vin" value={formState.vin} onChange={handleChange} className={inputClass('vin')} />
                </FormField>
             </div>
        </div>

        <div className="space-y-4">
             <h3 className="text-base font-semibold text-slate-600 border-b pb-2">Vehicle Specification</h3>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Year*" id="year">
                    <select id="year" name="year" value={formState.year} onChange={handleChange} className={inputClass('year')}>
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </FormField>
                <div className="sm:col-span-2">
                     <FormField label="Model*" id="model" error={errors.model}>
                        <input type="text" id="model" name="model" value={formState.model} onChange={handleChange} className={inputClass('model')} />
                    </FormField>
                </div>
            </div>
             <FormField label="Model #* (4 chars max)" id="modelNumber" error={errors.modelNumber}>
                <input type="text" id="modelNumber" name="modelNumber" value={formState.modelNumber} onChange={handleChange} maxLength={4} className={inputClass('modelNumber')} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Exterior Color #*" id="color" error={errors.color}>
                    <input type="text" id="color" name="color" value={formState.color} onChange={handleChange} maxLength={4} className={inputClass('color')} />
                </FormField>
                <FormField label="Interior Color #*" id="interiorColor" error={errors.interiorColor}>
                    <input type="text" id="interiorColor" name="interiorColor" value={formState.interiorColor} onChange={handleChange} maxLength={4} className={inputClass('interiorColor')} />
                </FormField>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Ext. Option 1 #" id="extOption1" error={errors.extOption1}><input type="text" name="extOption1" value={formState.extOption1} onChange={handleChange} maxLength={4} className={inputClass('extOption1')} /></FormField>
                <FormField label="Ext. Option 2 #" id="extOption2" error={errors.extOption2}><input type="text" name="extOption2" value={formState.extOption2} onChange={handleChange} maxLength={4} className={inputClass('extOption2')} /></FormField>
                <FormField label="Int. Option 1 #" id="intOption1" error={errors.intOption1}><input type="text" name="intOption1" value={formState.intOption1} onChange={handleChange} maxLength={4} className={inputClass('intOption1')} /></FormField>
                <FormField label="Int. Option 2 #" id="intOption2" error={errors.intOption2}><input type="text" name="intOption2" value={formState.intOption2} onChange={handleChange} maxLength={4} className={inputClass('intOption2')} /></FormField>
            </div>
        </div>

        <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-600 border-b pb-2">Financials</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="MSRP*" id="msrp" error={errors.msrp}>
                    <div className="relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-slate-500 sm:text-sm">$</span></div>
                        <input type="number" id="msrp" name="msrp" value={formState.msrp} onChange={handleChange} className={moneyInputClass('msrp')} step="0.01" />
                    </div>
                </FormField>
                <FormField label="Selling Price" id="sellingPrice" error={errors.sellingPrice}>
                    <div className="relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-slate-500 sm:text-sm">$</span></div>
                        <input type="number" id="sellingPrice" name="sellingPrice" value={formState.sellingPrice} onChange={handleChange} className={moneyInputClass('sellingPrice')} step="0.01" />
                    </div>
                </FormField>
                <FormField label="Gross" id="gross" error={errors.gross}>
                    <div className="relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-slate-500 sm:text-sm">$</span></div>
                        <input type="number" id="gross" name="gross" value={formState.gross} onChange={handleChange} className={moneyInputClass('gross')} step="0.01" />
                    </div>
                </FormField>
                 <FormField label="Deposit Amount*" id="depositAmount" error={errors.depositAmount}>
                    <div className="relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-slate-500 sm:text-sm">$</span></div>
                        <input type="number" id="depositAmount" name="depositAmount" value={formState.depositAmount} onChange={handleChange} className={moneyInputClass('depositAmount')} step="0.01" />
                    </div>
                </FormField>
            </div>
        </div>

        <div className="space-y-4">
             <h3 className="text-base font-semibold text-slate-600 border-b pb-2">Status & Notes</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status*</label>
                <div className="mt-2 flex flex-wrap gap-2">
                    {activeStatusOptions.map(status => (
                    <button key={status} type="button" onClick={() => setFormState(s => ({...s, status}))} className={`px-4 py-2 text-sm rounded-full border-2 transition-colors ${formState.status === status ? 'bg-sky-600 border-sky-600 text-white font-semibold' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400'}`}>
                        {status}
                    </button>
                    ))}
                </div>
            </div>
            <FormField label="Options*" id="options" error={errors.options}>
                <textarea id="options" name="options" rows={3} value={formState.options} onChange={handleChange} className={inputClass('options')}></textarea>
            </FormField>
             <FormField label="Internal Notes" id="notes">
                 <textarea id="notes" name="notes" rows={3} value={formState.notes} onChange={handleChange} className={inputClass('notes')}></textarea>
            </FormField>
        </div>

        <button type="submit" className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5">
          <PlusIcon />
          Add Order
        </button>
      </form>
    </div>
  );
};

export default OrderForm;