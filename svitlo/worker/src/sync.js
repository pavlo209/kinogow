// Що зберігати про графік адреси і коли про нього писати людині.

export function partState(chart, queue, subqueue) {
  if (!chart) return null;
  let ranges;
  try {
    ranges = chart.ranges(Number(queue), Number(subqueue));
  } catch {
    return null;
  }
  return {
    signature: `${chart.iso}|${ranges.map(([start, end]) => `${start}-${end}`).join(";")}`,
    schedule_date: chart.label,
    ranges,
    image_url: chart.image || "",
  };
}

// null: нічого нового; "fresh": перший графік на цю дату; "changed": години на ту саму дату стали іншими.
export function noticeKind(previous, next) {
  if (previous && previous.signature === next.signature) return null;
  if (previous && previous.schedule_date === next.schedule_date) return "changed";
  return "fresh";
}
