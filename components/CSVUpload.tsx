import React, { useState, useRef, useCallback } from 'react';
import { parseCSVToOrders, CSVOrderData, ParseCSVResult } from '../src/utils/csvParser';
import { AppUser } from '../types';
import { CloseIcon } from './icons/CloseIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

interface CSVUploadProps {
  onUpload: (orders: CSVOrderData[]) => Promise<{ success: number; failed: number }>;
  currentUser: AppUser;
  onClose: () => void;
}

interface UploadState {
  stage: 'idle' | 'preview' | 'uploading' | 'complete';
  file: File | null;
  parseResult: ParseCSVResult | null;
  uploadResult: { success: number; failed: number } | null;
  dragActive: boolean;
}

const CSVUpload: React.FC<CSVUploadProps> = ({ onUpload, currentUser, onClose }) => {
  const [state, setState] = useState<UploadState>({
    stage: 'idle',
    file: null,
    parseResult: null,
    uploadResult: null,
    dragActive: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    try {
      const content = await file.text();
      const parseResult = parseCSVToOrders(content);

      setState(prev => ({
        ...prev,
        stage: 'preview',
        file,
        parseResult,
      }));
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Failed to read the CSV file. Please try again.');
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setState(prev => ({ ...prev, dragActive: true }));
    } else if (e.type === 'dragleave') {
      setState(prev => ({ ...prev, dragActive: false }));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState(prev => ({ ...prev, dragActive: false }));

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  const handleUpload = async () => {
    if (!state.parseResult || state.parseResult.orders.length === 0) {
      return;
    }

    setState(prev => ({ ...prev, stage: 'uploading' }));

    try {
      const result = await onUpload(state.parseResult.orders);
      setState(prev => ({
        ...prev,
        stage: 'complete',
        uploadResult: result,
      }));
    } catch (error) {
      console.error('Error uploading orders:', error);
      alert('Failed to upload orders. Please try again.');
      setState(prev => ({ ...prev, stage: 'preview' }));
    }
  };

  const handleReset = () => {
    setState({
      stage: 'idle',
      file: null,
      parseResult: null,
      uploadResult: null,
      dragActive: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderIdleStage = () => (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        state.dragActive
          ? 'border-sky-500 bg-sky-50'
          : 'border-slate-300 hover:border-slate-400'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <DocumentTextIcon className="mx-auto h-12 w-12 text-slate-400" />
      <p className="mt-4 text-sm text-slate-600">
        Drag and drop a CSV file here, or{' '}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-sky-600 hover:text-sky-500 font-medium"
        >
          browse
        </button>
      </p>
      <p className="mt-2 text-xs text-slate-500">
        CSV must include a CUSTOMER column. Optional columns: DATE, SALES PERSON, DEPOSIT, DEAL #, MODEL #, YEAR, MODEL, EXT COLOR, INT COLOR, MANAGER, OPTIONS
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleInputChange}
        className="hidden"
        aria-label="Upload CSV file"
      />
    </div>
  );

  const renderPreviewStage = () => {
    if (!state.parseResult) return null;

    const { orders, errors, warnings, skippedRows, totalRows } = state.parseResult;

    return (
      <div className="space-y-4">
        {/* File info */}
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3">
            <DocumentTextIcon className="h-8 w-8 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">{state.file?.name}</p>
              <p className="text-xs text-slate-500">
                {totalRows} rows found, {orders.length} valid, {skippedRows} skipped
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Remove file"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800 mb-2">Errors ({errors.length})</p>
            <ul className="text-xs text-red-700 space-y-1 max-h-24 overflow-y-auto">
              {errors.slice(0, 10).map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
              {errors.length > 10 && (
                <li className="font-medium">... and {errors.length - 10} more errors</li>
              )}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800 mb-2">Warnings ({warnings.length})</p>
            <ul className="text-xs text-amber-700 space-y-1 max-h-24 overflow-y-auto">
              {warnings.slice(0, 5).map((warning, i) => (
                <li key={i}>• {warning}</li>
              ))}
              {warnings.length > 5 && (
                <li className="font-medium">... and {warnings.length - 5} more warnings</li>
              )}
            </ul>
          </div>
        )}

        {/* Preview table */}
        {orders.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <p className="px-3 py-2 bg-slate-50 text-sm font-medium text-slate-700 border-b border-slate-200">
              Preview ({orders.length} orders to import)
            </p>
            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Model</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Year</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Deposit</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {orders.slice(0, 20).map((order, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-900">{order.customerName}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{order.model}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{order.year}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{order.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">
                        ${order.depositAmount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {orders.length > 20 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-center text-xs text-slate-500">
                        ... and {orders.length - 20} more orders
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={orders.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            Import {orders.length} Orders
          </button>
        </div>
      </div>
    );
  };

  const renderUploadingStage = () => (
    <div className="text-center py-8">
      <svg className="animate-spin mx-auto h-12 w-12 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <p className="mt-4 text-sm text-slate-600">Importing orders...</p>
      <p className="mt-1 text-xs text-slate-500">Please wait while we add your orders to the system.</p>
    </div>
  );

  const renderCompleteStage = () => {
    if (!state.uploadResult) return null;

    const { success, failed } = state.uploadResult;

    return (
      <div className="text-center py-8">
        <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">Import Complete</h3>
        <p className="mt-2 text-sm text-slate-600">
          Successfully imported <span className="font-semibold text-green-600">{success}</span> orders
          {failed > 0 && (
            <>, <span className="font-semibold text-red-600">{failed}</span> failed</>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Imported by: {currentUser.displayName || currentUser.email}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Import More
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">Import Orders from CSV</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close CSV upload"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>

      {state.stage === 'idle' && renderIdleStage()}
      {state.stage === 'preview' && renderPreviewStage()}
      {state.stage === 'uploading' && renderUploadingStage()}
      {state.stage === 'complete' && renderCompleteStage()}
    </div>
  );
};

export default CSVUpload;
