import React from 'react';

const VersionBadge: React.FC = () => {
  // Read from Vite-exposed environment variables
  const version = import.meta.env.VITE_APP_COMMIT_SHA;
  const buildTime = import.meta.env.VITE_APP_BUILD_TIME;
  
  if (!version || version === 'dev') {
    return null;
  }

  const formatBuildTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } catch {
      return isoString;
    }
  };

  // Format: v<short-sha> @ <build-time>
  const displayText = buildTime && buildTime !== 'unknown' 
    ? `v${version} @ ${formatBuildTime(buildTime)}`
    : `v${version}`;

  return (
    <span 
      className="ml-2 text-xs font-mono text-slate-400 hover:text-slate-600 transition-colors cursor-help" 
      title={buildTime ? `Built: ${buildTime}` : 'Version information'}
    >
      {displayText}
    </span>
  );
};

export default VersionBadge;
