import React, { useState } from 'react';
import { Order, OrderStatus, AppUser } from '../types';
import { ACTIVE_STATUS_OPTIONS } from '../constants';
import { PlusIcon } from './icons/PlusIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

interface OrderFormProps {
  onAddOrder: (order: Omit<Order, 'id'>) => Promise<boolean>;
  currentUser?: AppUser | null;
}

const getInitialFormState = (currentUser?: AppUser | null) => ({
  salesperson: currentUser?.displayName || '',
  manager: '',
  date: new Date().toISOString().split('T')[0],
  customerName: '',
  stockNumber: '',
  dealNumber: '',
  vin: '',
  year: new Date().getFullYear().toString(),
  model: '',
  modelNumber: '',
  exteriorColor1: '',
  exteriorColor2: '',
  exteriorColor3: '',
  interiorColor1: '',
  interiorColor2: '',
  interiorColor3: '',
  msrp: '',
  sellingPrice: '',
  gross: '',
  depositAmount: '',
  status: OrderStatus.FactoryOrder,
  options: '',
  notes: '',
});

const FormField: React.FC<{label: string, id: string, error?: string, hint?: string, children: React.ReactNode}> = ({ label, id, error, hint, children }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="mt-1">{children}</div>
        {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
);

const OrderForm: React.FC<OrderFormProps> = ({ onAddOrder, currentUser }) => {
  const [formState, setFormState] = useState(() => getInitialFormState(currentUser));
  const [errors, setErrors] = useState<Partial<Record<keyof typeof formState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const validate = () => {
    const newErrors: Partial<Record<keyof typeof formState, string>> = {};
    if (!formState.salesperson) newErrors.salesperson = 'Salesperson is required';
    if (!formState.manager) newErrors.manager = 'Manager is required';
    if (!formState.customerName) newErrors.customerName = 'Customer name is required';
    if (!formState.model) newErrors.model = 'Model is required';
    if (!formState.dealNumber) newErrors.dealNumber = 'Deal # is required';
    if (!formState.modelNumber) newErrors.modelNumber = 'Model # is required';
    if (!formState.options) newErrors.options = 'Options are required';

    // Validate year field
    const currentYear = new Date().getFullYear();
    const minYear = 1900;
    const maxYear = currentYear + 2;
    const yearNum = parseInt(formState.year, 10);
    
    if (!formState.year) {
      newErrors.year = 'Year is required';
    } else if (!/^\d{4}$/.test(formState.year)) {
      newErrors.year = 'Year must be a 4-digit number';
    } else if (isNaN(yearNum) || yearNum < minYear || yearNum > maxYear) {
      newErrors.year = `Year must be between ${minYear} and ${maxYear}`;
    }

    // Validate exterior and interior color codes with explicit else-if logic
    if (!formState.exteriorColor1) {
      newErrors.exteriorColor1 = 'Exterior Color #1 is required';
    } else if (formState.exteriorColor1.length < 3) {
      newErrors.exteriorColor1 = 'Must be at least 3 characters';
    }

    if (formState.exteriorColor2 && formState.exteriorColor2.length < 3) {
      newErrors.exteriorColor2 = 'Must be at least 3 characters';
    }
    if (formState.exteriorColor3 && formState.exteriorColor3.length < 3) {
      newErrors.exteriorColor3 = 'Must be at least 3 characters';
    }

    if (!formState.interiorColor1) {
      newErrors.interiorColor1 = 'Interior Color #1 is required';
    } else if (formState.interiorColor1.length < 3) {
      newErrors.interiorColor1 = 'Must be at least 3 characters';
    }

    if (formState.interiorColor2 && formState.interiorColor2.length < 3) {
      newErrors.interiorColor2 = 'Must be at least 3 characters';
    }
    if (formState.interiorColor3 && formState.interiorColor3.length < 3) {
      newErrors.interiorColor3 = 'Must be at least 3 characters';
    }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setIsSubmitting(true);
      setSubmitSuccess(false);
      const success = await onAddOrder({
        ...formState,
        msrp: parseFloat(formState.msrp),
        sellingPrice: formState.sellingPrice ? parseFloat(formState.sellingPrice) : undefined,
        gross: formState.gross ? parseFloat(formState.gross) : undefined,
        depositAmount: parseFloat(formState.depositAmount),
      });
      setIsSubmitting(false);

      if (success) {
        setSubmitSuccess(true);
        setFormState(getInitialFormState(currentUser));
        setErrors({});
        setTimeout(() => setSubmitSuccess(false), 4000);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prevState => ({ ...prevState, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({...prev, [name]: undefined}));
    }
  };

  // Use ACTIVE_STATUS_OPTIONS directly instead of filtering STATUS_OPTIONS
  // ACTIVE_STATUS_OPTIONS now only contains Factory Order and Dealer Exchange (Locate removed)
  const activeStatusOptions = ACTIVE_STATUS_OPTIONS;
  const inputClass = (name: keyof typeof formState) => `block w-full p-2.5 border ${errors[name] ? 'border-red-500' : 'border-slate-300'} rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors`;
  const moneyInputClass = (name: keyof typeof formState) => `pl-8 block w-full p-2.5 border ${errors[name] ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors`;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Add New Order</h2>

      {submitSuccess && (
        <div className="flex items-center gap-3 mb-4 p-4 bg-green-100 border border-green-300 text-green-800 rounded-lg animate-fade-in-down">
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
            <span className="font-semibold">Order submitted successfully!</span>
        </div>
      )}

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
                <FormField label="Year*" id="year" error={errors.year} hint={`${new Date().getFullYear() - 25}–${new Date().getFullYear() + 2}`}>
                    <input 
                      type="text" 
                      id="year" 
                      name="year" 
                      value={formState.year} 
                      onChange={handleChange} 
                      className={inputClass('year')}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder={new Date().getFullYear().toString()}
                    />
                </FormField>
                <div className="sm:col-span-2">
                     <FormField label="Model*" id="model" error={errors.model}>
                        <input type="text" id="model" name="model" value={formState.model} onChange={handleChange} className={inputClass('model')} />
                    </FormField>
                </div>
            </div>
             <FormField label="Model #* (4 chars max)" id="modelNumber" error={errors.modelNumber} hint="4-character code, e.g., 350H">
                <input type="text" id="modelNumber" name="modelNumber" value={formState.modelNumber} onChange={handleChange} maxLength={4} className={inputClass('modelNumber')} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <FormField label="Exterior Color #1*" id="exteriorColor1" error={errors.exteriorColor1} hint="Min 3 chars, e.g., 01UL">
                        <input type="text" id="exteriorColor1" name="exteriorColor1" value={formState.exteriorColor1} onChange={handleChange} minLength={3} maxLength={4} className={inputClass('exteriorColor1')} />
                    </FormField>
                    <FormField label="Exterior Color #2" id="exteriorColor2" error={errors.exteriorColor2} hint="Min 3 chars">
                        <input type="text" id="exteriorColor2" name="exteriorColor2" value={formState.exteriorColor2} onChange={handleChange} minLength={3} maxLength={4} className={inputClass('exteriorColor2')} />
                    </FormField>
                    <FormField label="Exterior Color #3" id="exteriorColor3" error={errors.exteriorColor3} hint="Min 3 chars">
                        <input type="text" id="exteriorColor3" name="exteriorColor3" value={formState.exteriorColor3} onChange={handleChange} minLength={3} maxLength={4} className={inputClass('exteriorColor3')} />
                    </FormField>
                </div>
                <div>
                    <FormField label="Interior Color #1*" id="interiorColor1" error={errors.interiorColor1} hint="Min 3 chars, e.g., LA40">
                        <input type="text" id="interiorColor1" name="interiorColor1" value={formState.interiorColor1} onChange={handleChange} minLength={3} maxLength={4} className={inputClass('interiorColor1')} />
                    </FormField>
                    <FormField label="Interior Color #2" id="interiorColor2" error={errors.interiorColor2} hint="Min 3 chars">
                        <input type="text" id="interiorColor2" name="interiorColor2" value={formState.interiorColor2} onChange={handleChange} minLength={3} maxLength={4} className={inputClass('interiorColor2')} />
                    </FormField>
                    <FormField label="Interior Color #3" id="interiorColor3" error={errors.interiorColor3} hint="Min 3 chars">
                        <input type="text" id="interiorColor3" name="interiorColor3" value={formState.interiorColor3} onChange={handleChange} minLength={3} maxLength={4} className={inputClass('interiorColor3')} />
                    </FormField>
                </div>
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
                <label htmlFor="status-buttons" className="block text-sm font-medium text-slate-700">Status*</label>
                <div id="status-buttons" className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Select status">
                    {activeStatusOptions.map(status => (
                    <button key={status} type="button" onClick={() => setFormState(s => ({...s, status}))} className={`px-4 py-2 text-sm rounded-full border-2 transition-colors ${formState.status === status ? 'bg-sky-600 border-sky-600 text-white font-semibold' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400'}`}>
                        {status}
                    </button>
                    ))}
                </div>
            </div>
            <FormField label="Options*" id="options" error={errors.options} hint="Key packages and accessories">
                <textarea id="options" name="options" rows={3} value={formState.options} onChange={handleChange} className={inputClass('options')}></textarea>
            </FormField>
             <FormField label="Internal Notes" id="notes">
                 <textarea id="notes" name="notes" rows={3} value={formState.notes} onChange={handleChange} className={inputClass('notes')}></textarea>
            </FormField>
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting} 
          data-testid="submit-order-button"
          className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 disabled:from-slate-400 disabled:to-slate-500 disabled:shadow-none disabled:transform-none disabled:cursor-wait">
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Submitting...
            </>
          ) : (
            <>
              <PlusIcon />
              Add Order
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default OrderForm;