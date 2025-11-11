<<<<<<< HEAD

import React, { useState } from 'react';
import { Order, OrderStatus, AppUser } from '../types';
=======
import React, { useState } from 'react';
import { Order, OrderStatus } from '../types';
>>>>>>> feat/admin-hardening-docs
import { STATUS_OPTIONS } from '../constants';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import StatusBadge from './StatusBadge';
import { generateFollowUpEmail } from '../services/geminiService';
import { SparklesIcon } from './icons/SparklesIcon';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { TrashIcon } from './icons/TrashIcon';

interface OrderCardProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onDeleteOrder: (orderId: string) => void;
<<<<<<< HEAD
  currentUser?: AppUser | null;
=======
>>>>>>> feat/admin-hardening-docs
}

const DetailItem: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <strong className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</strong>
        <span className="text-sm text-slate-800">{children || 'N/A'}</span>
    </div>
);

<<<<<<< HEAD
const OrderCard: React.FC<OrderCardProps> = ({ order, onUpdateStatus, onDeleteOrder, currentUser }) => {
=======
const OrderCard: React.FC<OrderCardProps> = ({ order, onUpdateStatus, onDeleteOrder }) => {
>>>>>>> feat/admin-hardening-docs
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const extOptions = [order.extOption1, order.extOption2].filter(Boolean);
  const intOptions = [order.intOption1, order.intOption2].filter(Boolean);
  const isDelivered = order.status === OrderStatus.Delivered;
  const isReceived = order.status === OrderStatus.Received;
  const isActive = !isDelivered && !isReceived;

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as OrderStatus;
    onUpdateStatus(order.id, newStatus);
  };
  
  const handleGenerateEmail = async () => {
    setIsGenerating(true);
    setGeneratedEmail('');
    try {
      const emailContent = await generateFollowUpEmail(order);
      setGeneratedEmail(emailContent);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate email. Please try again.";
      alert(`AI Assistant Error: ${errorMessage}`);
      console.error("Email generation error:", error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedEmail).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const activeStatusOptions = STATUS_OPTIONS.filter(s => s !== OrderStatus.Delivered && s !== OrderStatus.Received);

  return (
    <div className={`rounded-xl shadow-sm transition-all duration-300 ${isDelivered ? 'bg-slate-100/70 border-slate-200' : 'bg-white border-slate-200 hover:shadow-md hover:border-slate-300'} border`}>
      <div 
        className="p-4 cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="flex justify-between items-start">
            <div>
            <h3 className={`text-lg font-bold ${isDelivered ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                {order.customerName}
            </h3>
            <p className="text-sm text-slate-500 font-medium">
                {order.year} {order.model}
            </p>
            <div className="mt-2">
                <StatusBadge status={order.status} />
            </div>
            </div>
            <div className="flex items-center space-x-3 text-right flex-shrink-0 ml-4">
                <span className="text-sm font-medium text-slate-500">{order.date}</span>
                <button className="text-slate-400 hover:text-sky-600" aria-label="Toggle order details">
                    <ChevronDownIcon className={`w-6 h-6 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
            </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="mt-2 pt-4 border-t border-slate-200">
            <div className="p-3 mb-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
<<<<<<< HEAD
                    {currentUser?.isManager && isActive ? (
=======
                    {isActive ? (
>>>>>>> feat/admin-hardening-docs
                    <>
                        <label htmlFor={`status-select-${order.id}`} className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                           Change Status:
                        </label>
                        <select 
                          id={`status-select-${order.id}`} 
                          value={order.status} 
                          onChange={handleStatusChange}
                          className="p-1.5 border border-slate-300 rounded-md shadow-sm text-sm focus:ring-sky-500 focus:border-sky-500"
                        >
                          {activeStatusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </>
                    ) : (isReceived ? (
                        <div className="text-sm font-medium text-slate-700">Vehicle at dealership. Ready for delivery.</div>
<<<<<<< HEAD
                    ) : isDelivered ? (
                        <div className="text-sm font-medium text-green-700">Order Completed</div>
                    ) : (
                        <div className="text-sm font-medium text-slate-700">Status: {order.status}</div>
=======
                    ) : (
                        <div className="text-sm font-medium text-green-700">Order Completed</div>
>>>>>>> feat/admin-hardening-docs
                    ))}
                </div>

                <div className="flex items-center gap-2">
<<<<<<< HEAD
                    {currentUser?.isManager && isActive && (
=======
                    {isActive && (
>>>>>>> feat/admin-hardening-docs
                        <button onClick={() => onUpdateStatus(order.id, OrderStatus.Received)} className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors">
                           Mark as Received
                        </button>
                    )}
<<<<<<< HEAD
                    {currentUser?.isManager && isReceived && (
=======
                    {isReceived && (
>>>>>>> feat/admin-hardening-docs
                        <button onClick={() => onUpdateStatus(order.id, OrderStatus.Delivered)} className="flex items-center gap-1.5 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors">
                           Mark as Delivered
                        </button>
                    )}
<<<<<<< HEAD
                    {currentUser?.isManager && (
                        <button onClick={() => onDeleteOrder(order.id)} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium py-2 px-3 rounded-lg hover:bg-red-50 transition-colors">
                            <TrashIcon className="w-4 h-4 text-red-500" />
                            Delete
                        </button>
                    )}
=======
                    <button onClick={() => onDeleteOrder(order.id)} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium py-2 px-3 rounded-lg hover:bg-red-50 transition-colors">
                        <TrashIcon className="w-4 h-4 text-red-500" />
                        Delete
                    </button>
>>>>>>> feat/admin-hardening-docs
                </div>
                </div>
            </div>
          
            <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-5 text-sm">
                    <DetailItem label="Salesperson">{order.salesperson}</DetailItem>
                    <DetailItem label="Manager">{order.manager}</DetailItem>
                    <DetailItem label="Deposit">{typeof order.depositAmount === 'number' ? `$${order.depositAmount.toFixed(2)}` : 'N/A'}</DetailItem>
                    <DetailItem label="Deal #">{order.dealNumber}</DetailItem>
                    <DetailItem label="Stock #">{order.stockNumber}</DetailItem>
                    <DetailItem label="VIN (Last 8)">{order.vin}</DetailItem>
                    <DetailItem label="Model #">{order.modelNumber}</DetailItem>
                    <DetailItem label="Ext. Color #">{order.color}</DetailItem>
                    <DetailItem label="Int. Color #">{order.interiorColor}</DetailItem>
                    <DetailItem label="MSRP">{typeof order.msrp === 'number' ? `$${order.msrp.toFixed(2)}` : 'N/A'}</DetailItem>
                    <DetailItem label="Selling Price">{order.sellingPrice ? `$${order.sellingPrice.toFixed(2)}` : 'N/A'}</DetailItem>
                    <DetailItem label="Gross">{order.gross ? `$${order.gross.toFixed(2)}` : 'N/A'}</DetailItem>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(extOptions.length > 0 || intOptions.length > 0) ? (
                        <>
                         <DetailItem label="Exterior Option #'s">{extOptions.join(', ')}</DetailItem>
                         <DetailItem label="Interior Option #'s">{intOptions.join(', ')}</DetailItem>
                        </>
                    ) : null}
                </div>

                {(order.options || order.notes) && (
                    <div className="space-y-4">
                        {order.options && (
                            <div className="bg-slate-50 p-3 rounded-lg border">
                            <strong className="block text-slate-500 text-sm font-semibold mb-1">Options</strong>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.options}</p>
                            </div>
                        )}
                        {order.notes && (
                            <div className="bg-slate-50 p-3 rounded-lg border">
                            <strong className="block text-slate-500 text-sm font-semibold mb-1">Internal Notes</strong>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.notes}</p>
                            </div>
                        )}
                    </div>
                )}


                <div className="pt-4 mt-4 border-t border-slate-200">
                     <h4 className="text-base font-semibold text-slate-700 mb-3">AI Email Assistant</h4>
                    <button onClick={handleGenerateEmail} disabled={isGenerating} className="flex items-center justify-center gap-2 w-full sm:w-auto text-sm bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors disabled:bg-slate-400 disabled:cursor-wait">
                        <SparklesIcon className={isGenerating ? 'animate-spin' : ''} />
                        {isGenerating ? 'Generating...' : 'Generate Follow-up'}
                    </button>
                    {generatedEmail && (
                        <div className="mt-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
                            <label htmlFor={`email-draft-${order.id}`} className="block text-sm font-bold text-slate-700 mb-2">Generated Email Draft:</label>
                            <textarea id={`email-draft-${order.id}`} readOnly value={generatedEmail} rows={10} className="w-full p-2.5 border border-slate-300 rounded-md shadow-sm bg-white text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"></textarea>
                            <button onClick={handleCopyToClipboard} className={`mt-2 flex items-center gap-2 text-sm font-semibold py-1.5 px-3 rounded-md transition-all duration-200 ${copySuccess ? 'bg-green-200 text-green-800' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
                                <ClipboardIcon />
                                {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderCard;