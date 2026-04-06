import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div role="status" className="flex items-center justify-center min-h-screen bg-stone-50">
      <div className="w-16 h-16 border-4 border-stone-300 border-t-indigo-500 rounded-full animate-spin"></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default LoadingSpinner;
