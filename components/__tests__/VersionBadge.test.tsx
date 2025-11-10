import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import VersionBadge from '../VersionBadge';

describe('VersionBadge', () => {
  it('renders null when version is undefined (component returns null for dev/missing version)', () => {
    // Since we can't easily mock import.meta.env in Vitest for component tests,
    // we test the behavior assuming it returns null for undefined/dev
    const { container } = render(<VersionBadge />);
    
    // Without mocked env vars, component should return null
    expect(container.firstChild).toBeNull();
  });

  it('component exports successfully and can be imported', () => {
    // Basic smoke test to ensure the component exists and can be rendered
    expect(VersionBadge).toBeDefined();
    expect(typeof VersionBadge).toBe('function');
  });

  it('renders without crashing when called', () => {
    // Test that the component doesn't throw errors when rendered
    expect(() => {
      render(<VersionBadge />);
    }).not.toThrow();
  });
});
