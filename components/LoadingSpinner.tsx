import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-stone-300 border-t-stone-950"></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default LoadingSpinner;
