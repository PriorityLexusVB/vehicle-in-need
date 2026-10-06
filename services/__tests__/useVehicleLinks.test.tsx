import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVehicleLinks } from "../useVehicleLinks";

type LinkSnapshot = {
  metadata: { fromCache: boolean };
  docs: Array<{ id: string; data: () => { orderId: string } }>;
};
type Subscription = {
  options: { includeMetadataChanges: boolean };
  next: (snapshot: LinkSnapshot) => void;
  error: (error: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

const subscriptions = vi.hoisted(() => [] as Subscription[]);

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "vehicle_links"),
  onSnapshot: vi.fn((
    _reference: unknown,
    options: { includeMetadataChanges: boolean },
    next: Subscription["next"],
    error: Subscription["error"],
  ) => {
    const unsubscribe = vi.fn();
    subscriptions.push({ options, next, error, unsubscribe });
    return unsubscribe;
  }),
}));

function snapshot(id: string, fromCache = false): LinkSnapshot {
  return {
    metadata: { fromCache },
    docs: [{ id, data: () => ({ orderId: `order-${id}` }) }],
  };
}

describe("useVehicleLinks auth-session freshness", () => {
  beforeEach(() => {
    subscriptions.length = 0;
    vi.clearAllMocks();
  });

  it("clears the public claim view and waits for a fresh listener after re-enable", () => {
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useVehicleLinks(enabled),
      { initialProps: { enabled: true } },
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.linksByVehicleId.size).toBe(0);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].options.includeMetadataChanges).toBe(true);

    const oldListener = subscriptions[0];
    act(() => oldListener.next(snapshot("old-unit")));
    expect(result.current.loading).toBe(false);
    expect(result.current.linksByVehicleId.has("old-unit")).toBe(true);

    rerender({ enabled: false });
    expect(oldListener.unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.linksByVehicleId.size).toBe(0);
    expect(result.current.loading).toBe(false);
    act(() => oldListener.next(snapshot("obsolete-unit")));
    expect(result.current.linksByVehicleId.size).toBe(0);

    rerender({ enabled: true });
    expect(subscriptions).toHaveLength(2);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.linksByVehicleId.size).toBe(0);
    act(() => oldListener.next(snapshot("late-old-unit")));
    expect(result.current.loading).toBe(true);
    expect(result.current.linksByVehicleId.size).toBe(0);

    const freshListener = subscriptions[1];
    act(() => freshListener.next(snapshot("cached-unit", true)));
    expect(result.current.loading).toBe(true);
    expect(result.current.linksByVehicleId.has("cached-unit")).toBe(true);
    act(() => freshListener.next(snapshot("fresh-unit")));
    expect(result.current.loading).toBe(false);
    expect(result.current.linksByVehicleId.has("fresh-unit")).toBe(true);
    expect(result.current.linksByVehicleId.has("old-unit")).toBe(false);
    act(() => oldListener.next(snapshot("late-old-unit")));
    expect(result.current.linksByVehicleId.has("fresh-unit")).toBe(true);

    act(() => freshListener.error(new Error("claims denied")));
    expect(result.current.loading).toBe(false);
    expect(result.current.error?.message).toBe("claims denied");
    expect([...result.current.linksByVehicleId.keys()]).toEqual(["fresh-unit"]);
    unmount();
    expect(freshListener.unsubscribe).toHaveBeenCalledOnce();
  });
});
