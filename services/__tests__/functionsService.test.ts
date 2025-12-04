import { describe, it, expect } from 'vitest';
import { parseFirebaseFunctionError } from '../functionsService';

describe('parseFirebaseFunctionError', () => {
  describe('Firebase Functions errors', () => {
    it('returns correct message for unauthenticated error', () => {
      const error = { code: 'functions/unauthenticated' };
      expect(parseFirebaseFunctionError(error)).toBe(
        'You must be logged in to perform this action.'
      );
    });

    it('returns correct message for permission-denied error', () => {
      const error = { code: 'functions/permission-denied' };
      expect(parseFirebaseFunctionError(error)).toBe(
        "You don't have permission to perform this action. Only managers can manage user roles."
      );
    });

    it('returns custom message for invalid-argument error when provided', () => {
      const error = { code: 'functions/invalid-argument', message: 'Custom validation error' };
      expect(parseFirebaseFunctionError(error)).toBe('Custom validation error');
    });

    it('returns default message for invalid-argument error when no message', () => {
      const error = { code: 'functions/invalid-argument' };
      expect(parseFirebaseFunctionError(error)).toBe('Invalid input provided.');
    });

    it('returns correct message for not-found error', () => {
      const error = { code: 'functions/not-found' };
      expect(parseFirebaseFunctionError(error)).toBe('The specified user was not found.');
    });

    it('returns correct message for internal error', () => {
      const error = { code: 'functions/internal' };
      expect(parseFirebaseFunctionError(error)).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });

    it('returns correct message for unavailable error', () => {
      const error = { code: 'functions/unavailable' };
      expect(parseFirebaseFunctionError(error)).toBe(
        'The server is temporarily unavailable. Please try again in a few moments.'
      );
    });

    it('returns custom message for unknown error codes when message provided', () => {
      const error = { code: 'functions/unknown', message: 'Something went wrong' };
      expect(parseFirebaseFunctionError(error)).toBe('Something went wrong');
    });
  });

  describe('Network/CORS errors', () => {
    it('handles TypeError for network failures', () => {
      const error = new TypeError('Failed to fetch');
      expect(parseFirebaseFunctionError(error)).toBe(
        'Unable to connect to the server. The Cloud Functions may not be deployed. Please contact your administrator.'
      );
    });

    it('handles error with "cors" in message', () => {
      const error = new Error('CORS error: blocked');
      expect(parseFirebaseFunctionError(error)).toBe(
        'Unable to connect to the server. The Cloud Functions may not be deployed. Please contact your administrator.'
      );
    });

    it('handles error with "network" in message', () => {
      const error = new Error('Network error');
      expect(parseFirebaseFunctionError(error)).toBe(
        'Unable to connect to the server. The Cloud Functions may not be deployed. Please contact your administrator.'
      );
    });

    it('handles error with "failed to fetch" in message', () => {
      const error = new Error('Failed to fetch resource');
      expect(parseFirebaseFunctionError(error)).toBe(
        'Unable to connect to the server. The Cloud Functions may not be deployed. Please contact your administrator.'
      );
    });

    it('handles error with "load failed" in message', () => {
      const error = new Error('Load failed for some resource');
      expect(parseFirebaseFunctionError(error)).toBe(
        'Unable to connect to the server. The Cloud Functions may not be deployed. Please contact your administrator.'
      );
    });
  });

  describe('Generic errors', () => {
    it('returns error message for regular Error instances', () => {
      const error = new Error('Some specific error message');
      expect(parseFirebaseFunctionError(error)).toBe('Some specific error message');
    });

    it('returns default message for non-Error objects', () => {
      expect(parseFirebaseFunctionError('string error')).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });

    it('returns default message for null', () => {
      expect(parseFirebaseFunctionError(null)).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });

    it('returns default message for undefined', () => {
      expect(parseFirebaseFunctionError(undefined)).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });
});
