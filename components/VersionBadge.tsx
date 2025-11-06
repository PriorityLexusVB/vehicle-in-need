import React from 'react';

interface VersionBadgeProps {
  version?: string;
  buildTime?: string;
}

const VersionBadge: React.FC<VersionBadgeProps> = ({ version, buildTime }) => {
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

  return (
    <span 
      className="ml-2 text-xs font-mono text-slate-400 hover:text-slate-600 transition-colors cursor-help" 
      title={buildTime ? `Built: ${formatBuildTime(buildTime)}` : 'Version information'}
    >
      v{version}
    </span>
  );
};

export default VersionBadge;
