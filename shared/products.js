// Preserve existing product variants/media when the desktop form edits a subset of fields.
export function productFormData(product, values, shopId) {
  const data = new FormData();
  const keys = [
    "title",
    "price",
    "old_price",
    "discount_percent",
    "category",
    "sub_category",
    "leaf_category",
    "description",
    "brand",
    "model",
    "color",
    "size",
    "length",
    "barcode",
    "sku",
    "stock_quantity",
    "stock_status",
    "content_language",
  ];
  data.set("shop_id", String(shopId));
  for (const key of keys)
    data.set(
      key,
      String(
        values[key] ??
          product[key] ??
          (key === "content_language" ? product.source_language : "") ??
          "",
      ),
    );
  for (const key of [
    "available_colors",
    "available_sizes",
    "unavailable_colors",
    "unavailable_sizes",
    "attributes",
  ]) {
    let value = values[key] ?? product[key] ?? (key === "attributes" ? {} : []);
    if (values[key] !== undefined && key !== "attributes")
      value = String(values[key])
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    if (values[key] !== undefined && key === "attributes") {
      value = JSON.parse(values[key] || "{}");
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error("Характеристики должны быть JSON-объектом");
    }
    if (typeof value !== "string") value = JSON.stringify(value);
    data.set(key, value);
  }
  data.set(
    "in_stock",
    String(
      (values.stock_status ?? product.stock_status ?? "AVAILABLE") !==
        "OUT_OF_STOCK",
    ),
  );
  data.set(
    "image_urls",
    JSON.stringify(
      Array.isArray(product.image_urls)
        ? product.image_urls
        : product.image_url
          ? [product.image_url]
          : [],
    ),
  );
  if (product.image_url) data.set("image_url", product.image_url);
  if (values.image?.size) data.append("image", values.image);
  return data;
}
