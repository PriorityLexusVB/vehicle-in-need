import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="w-16 h-16 border-4 border-slate-300 border-t-sky-500 rounded-full animate-spin"></div>
    </div>
  );
};

export default LoadingSpinner;