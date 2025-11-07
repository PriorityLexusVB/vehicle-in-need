/**
 * Safe MutationObserver utility that guards against invalid targets
 * and handles lifecycle properly
 */

export interface SafeObserverOptions {
  onMutation: MutationCallback;
  observerOptions?: MutationObserverInit;
}

/**
 * Creates a safe MutationObserver that validates the target before observing
 * @param options Configuration object with mutation callback and observer options
 * @returns Object with observe and disconnect methods
 */
export function createSafeObserver(options: SafeObserverOptions) {
  const { onMutation, observerOptions } = options;
  let observer: MutationObserver | null = null;

  return {
    /**
     * Starts observing the target element
     * @param target The DOM element to observe
     * @returns true if observation started successfully, false otherwise
     */
    observe(target: Node | null | undefined): boolean {
      // Validate target is a valid Node
      if (!target || !(target instanceof Node)) {
        console.warn('SafeObserver: Cannot observe invalid target', target);
        return false;
      }

      try {
        // Create observer if it doesn't exist
        if (!observer) {
          observer = new MutationObserver(onMutation);
        }

        // Start observing
        observer.observe(target, observerOptions);
        return true;
      } catch (error) {
        console.warn('SafeObserver: Error starting observation', error);
        return false;
      }
    },

    /**
     * Stops observing and cleans up the observer
     */
    disconnect() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  };
}

/**
 * Hook-friendly version that returns a ref callback for use with React useEffect
 * @param callback Mutation callback function
 * @param options MutationObserver init options
 * @returns Cleanup function for use in useEffect
 */
export function useSafeObserver(
  callback: MutationCallback,
  options?: MutationObserverInit
): (target: Node | null) => (() => void) {
  return (target: Node | null) => {
    if (!target || !(target instanceof Node)) {
      return () => {}; // No-op cleanup
    }

    const observer = new MutationObserver(callback);
    
    try {
      observer.observe(target, options);
    } catch (error) {
      console.warn('useSafeObserver: Error starting observation', error);
    }

    return () => observer.disconnect();
  };
}
