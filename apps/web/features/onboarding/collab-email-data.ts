export function summarizeCollabEmailRows(
  rows: Record<string, unknown>[],
): {
  reels: number;
  staticPosts: number;
  stories: number;
  commercialAmount: number;
  productQuantity: string;
} {
  const total = (field: string) =>
    rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);

  return {
    reels: total("reels"),
    staticPosts: total("static_posts"),
    stories: total("stories"),
    commercialAmount: total("commercial_amount"),
    productQuantity: String(
      rows.find((row) => Number(row.garment_qty) > 0)?.garment_qty ?? "",
    ).trim(),
  };
}
