export function formatWarehouseName(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\bBSD\b/gi, "Sale Stock")
    .replace(/\bDL\b/gi, "Installation");
}

export function formatWarehouseHeading(value: string | null | undefined) {
  return `${formatWarehouseName(value)} Warehouses`.trim();
}
