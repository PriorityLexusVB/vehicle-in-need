import React, { useState } from 'react';
import { VehicleOption } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';

interface VehicleOptionsManagerProps {
  options: VehicleOption[];
  onAddOption: (option: Omit<VehicleOption, 'id'>) => Promise<void>;
  onDeleteOption: (optionId: string) => Promise<void>;
}

const VehicleOptionsManager: React.FC<VehicleOptionsManagerProps> = ({
  options,
  onAddOption,
  onDeleteOption,
}) => {
  const [activeTab, setActiveTab] = useState<'exterior' | 'interior'>('exterior');
  const [isAdding, setIsAdding] = useState(false);
  const [newOption, setNewOption] = useState({ code: '', name: '', type: 'exterior' as const });
  const [error, setError] = useState('');

  const filteredOptions = options.filter(opt => opt.type === activeTab);

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!newOption.code || !newOption.name) {
      setError('Code and name are required');
      return;
    }
    if (newOption.code.length > 4) {
      setError('Code must be 4 characters or less');
      return;
    }

    // Check for duplicate codes
    const duplicate = options.find(
      opt => opt.code.toUpperCase() === newOption.code.toUpperCase() && opt.type === activeTab
    );
    if (duplicate) {
      setError(`Code "${newOption.code}" already exists for ${activeTab} options`);
      return;
    }

    try {
      await onAddOption({
        ...newOption,
        code: newOption.code.toUpperCase(),
        type: activeTab,
      });
      setNewOption({ code: '', name: '', type: activeTab });
      setIsAdding(false);
    } catch (err) {
      setError('Failed to add option. Please try again.');
      console.error('Error adding option:', err);
    }
  };

  const handleDelete = async (optionId: string, code: string) => {
    if (window.confirm(`Are you sure you want to delete option "${code}"? This cannot be undone.`)) {
      try {
        await onDeleteOption(optionId);
      } catch (err) {
        alert('Failed to delete option. Please try again.');
        console.error('Error deleting option:', err);
      }
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 mt-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Vehicle Option Codes</h2>
        <p className="text-sm text-slate-600 mb-6">
          Manage the available option codes for vehicle orders. These options will appear in dropdowns when creating or editing orders.
        </p>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="-mb-px flex space-x-6" aria-label="Option Types">
            <button
              onClick={() => {
                setActiveTab('exterior');
                setNewOption({ code: '', name: '', type: 'exterior' });
                setIsAdding(false);
                setError('');
              }}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
                activeTab === 'exterior'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Exterior Options
            </button>
            <button
              onClick={() => {
                setActiveTab('interior');
                setNewOption({ code: '', name: '', type: 'interior' });
                setIsAdding(false);
                setError('');
              }}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
                activeTab === 'interior'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Interior Options
            </button>
          </nav>
        </div>

        {/* Add Button */}
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="mb-4 flex items-center gap-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
          >
            <PlusIcon className="w-5 h-5" />
            Add {activeTab === 'exterior' ? 'Exterior' : 'Interior'} Option
          </button>
        )}

        {/* Add Form */}
        {isAdding && (
          <form onSubmit={handleAddOption} className="mb-6 p-4 bg-sky-50 border border-sky-200 rounded-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="option-code" className="block text-sm font-medium text-slate-700 mb-1">
                  Code* (4 chars max)
                </label>
                <input
                  type="text"
                  id="option-code"
                  value={newOption.code}
                  onChange={(e) => setNewOption({ ...newOption, code: e.target.value })}
                  maxLength={4}
                  className="block w-full p-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm uppercase"
                  placeholder="PW01"
                />
              </div>
              <div>
                <label htmlFor="option-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Name*
                </label>
                <input
                  type="text"
                  id="option-name"
                  value={newOption.name}
                  onChange={(e) => setNewOption({ ...newOption, name: e.target.value })}
                  className="block w-full p-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                  placeholder="Premium Wheels Package"
                />
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Option
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewOption({ code: '', name: '', type: activeTab });
                  setError('');
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Options List */}
        <div className="space-y-2">
          {filteredOptions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No {activeTab} options configured yet. Add one to get started.
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div>
                  <span className="font-mono font-bold text-slate-800">{option.code}</span>
                  <span className="mx-2 text-slate-400">—</span>
                  <span className="text-slate-700">{option.name}</span>
                </div>
                <button
                  onClick={() => handleDelete(option.id, option.code)}
                  className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium py-1 px-3 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleOptionsManager;
