/**
 * Maps the former Allocation Board DX focus URL to the first-class DX route.
 * Non-DX Allocation Board queries are deliberately left alone.
 */
export function getLegacyDxDestination(searchParams: URLSearchParams): string | null {
  const targetsDx = searchParams.has("dxModel")
    || searchParams.get("scrollTo") === "dx-pipeline";
  if (!targetsDx) return null;

  const destinationParams = new URLSearchParams(searchParams);
  destinationParams.delete("view");
  const query = destinationParams.toString();
  return `/dealer-exchange${query ? `?${query}` : ""}`;
}
