const Item = require("../Models/itemModel");
const Transaction = require("../Models/transactionModel");

// -- Tuning constants ------------------------------------------------------
// How much weight a fresh observation gets vs. the value we already believed.
// Higher = reacts faster to recent changes, lower = smoother / more stable.
const USAGE_ALPHA = 0.3;
const LEAD_TIME_ALPHA = 0.3;

// The "recent" window used to observe current demand behaviour.
const RECENT_WINDOW_DAYS = 30;

// Need at least this many issue transactions in the recent window before we
// trust a statistical (std-dev based) safety stock instead of the flat
// fallback buffer -- protects new/rarely-moved items from noisy swings.
const MIN_SAMPLES_FOR_STATS = 5;

// z-score for desired service level. 1.65 ~= 95% service level (95% of the
// time, on-hand + safety stock covers demand during lead time).
const SERVICE_LEVEL_Z = 1.65;

// Flat buffer (in days of avg usage) used as safety stock when there isn't
// enough data yet to compute a meaningful standard deviation.
const FALLBACK_BUFFER_DAYS = 3;

const DAY_MS = 1000 * 60 * 60 * 24;

const stdDev = (values) => {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

// Builds one bucket per day in the window (defaulting to 0), summing any
// issue quantities that fall on that day -- this is what lets us measure
// demand *variability*, not just the average.
const buildDailyBuckets = (issues, windowStart, windowDays) => {
  const buckets = new Array(windowDays).fill(0);
  for (const t of issues) {
    const dayIndex = Math.floor((t.createdAt - windowStart) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < windowDays) {
      buckets[dayIndex] += t.quantity;
    }
  }
  return buckets;
};

/**
 * Computes the updated analytics fields for a single item, given:
 * - its recent issue transactions (within RECENT_WINDOW_DAYS)
 * - its all-time totals (for first-run seeding when there's no recent activity)
 * Does NOT hit the database -- pure calculation, so it's cheap to run for
 * every item in a loop after the transactions are fetched in bulk.
 */
const computeItemAnalytics = (item, recentIssues, allTime, windowStart) => {
  const prevAvgUsage = item.analytics?.avg_daily_usage ?? 0;
  const prevLeadTime = item.analytics?.avg_lead_time ?? 0;

  // Observed demand this window
  const recentTotal = recentIssues.reduce((sum, t) => sum + t.quantity, 0);
  const observedDailyUsage = recentTotal / RECENT_WINDOW_DAYS;

  // All-time rate, used only to seed a brand-new item that has never
  // had analytics computed before (prevAvgUsage === 0)
  let seedRate = 0;
  if (allTime && allTime.totalAll > 0) {
    const spanDays = Math.max(
      (allTime.lastDate - allTime.firstDate) / DAY_MS,
      1
    );
    seedRate = allTime.totalAll / spanDays;
  }

  const baseline = prevAvgUsage > 0 ? prevAvgUsage : seedRate;

  // Moving average: nudge the baseline toward what's actually happening
  // right now. Because `baseline` is last run's result, this compounds run
  // over run -- a real EMA, not a fresh all-time average each time.
  const avgDailyUsage =
    USAGE_ALPHA * observedDailyUsage + (1 - USAGE_ALPHA) * baseline;

  // Lead time -- vendor-quoted, smoothed against what we had before so a
  // single vendor data edit doesn't cause a sudden reorder-point jump.
  // (Note: this is still the *quoted* lead time, not an *observed* one --
  // if your PO flow records order-placed -> received timestamps, that would
  // be a strictly better signal. Happy to wire that in if you share the PO
  // model/controller.)
  const vendorLeadTimes = (item.vendors || [])
    .map((v) => v.lead_time_days)
    .filter((v) => typeof v === "number" && v > 0);
  const vendorAvgLeadTime = vendorLeadTimes.length
    ? vendorLeadTimes.reduce((a, b) => a + b, 0) / vendorLeadTimes.length
    : 0;

  const avgLeadTime =
    vendorAvgLeadTime > 0
      ? prevLeadTime > 0
        ? LEAD_TIME_ALPHA * vendorAvgLeadTime +
          (1 - LEAD_TIME_ALPHA) * prevLeadTime
        : vendorAvgLeadTime
      : prevLeadTime; // no vendor data this run -- don't zero out what we knew

  // Safety stock -- statistical when we have enough recent samples to
  // trust a standard deviation, otherwise fall back to a flat day-buffer so
  // sparse/new items don't get a wild number from a tiny sample.
  const dailyBuckets = buildDailyBuckets(
    recentIssues,
    windowStart,
    RECENT_WINDOW_DAYS
  );
  const demandStdDev = stdDev(dailyBuckets);
  const leadTimeForBuffer = avgLeadTime > 0 ? avgLeadTime : 1;

  const safetyStock =
    recentIssues.length >= MIN_SAMPLES_FOR_STATS
      ? SERVICE_LEVEL_Z * demandStdDev * Math.sqrt(leadTimeForBuffer)
      : avgDailyUsage * FALLBACK_BUFFER_DAYS;

  const rawSuggestedMinStock = avgDailyUsage * avgLeadTime + safetyStock;
  // Round up to a whole unit — min_stock should read as a clean, actionable
  // number, and rounding up (rather than to nearest) errs toward not
  // understocking rather than trimming the buffer down.
  const suggestedMinStock = Math.ceil(rawSuggestedMinStock);

  return { avgDailyUsage, avgLeadTime, safetyStock, suggestedMinStock };
};

/**
 * Runs analytics for every non-deleted item in two bulk queries (instead of
 * one query per item) plus a single bulkWrite to save results, so this
 * scales to large catalogs without N sequential round trips.
 */
const runAnalyticsForAllItems = async () => {
  console.log("Running inventory analytics...");

  const now = new Date();
  const windowStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);

  const items = await Item.find({ is_deleted: false }).lean();
  if (!items.length) {
    console.log("Analytics: no items to process");
    return;
  }

  // Recent issue transactions across ALL items, in one query
  const recentIssues = await Transaction.find({
    type: "issue",
    createdAt: { $gte: windowStart },
  })
    .select("item_id quantity createdAt")
    .lean();

  const recentByItem = new Map();
  for (const t of recentIssues) {
    const key = String(t.item_id);
    if (!recentByItem.has(key)) recentByItem.set(key, []);
    recentByItem.get(key).push(t);
  }

  // All-time issue totals across ALL items, in one aggregation -- used
  // only to seed items that have never had analytics computed before
  const allTimeAgg = await Transaction.aggregate([
    { $match: { type: "issue" } },
    {
      $group: {
        _id: "$item_id",
        totalAll: { $sum: "$quantity" },
        firstDate: { $min: "$createdAt" },
        lastDate: { $max: "$createdAt" },
      },
    },
  ]);
  const allTimeByItem = new Map(allTimeAgg.map((a) => [String(a._id), a]));

  const bulkOps = [];

  for (const item of items) {
    const key = String(item._id);
    const itemRecentIssues = recentByItem.get(key) || [];
    const allTime = allTimeByItem.get(key);

    // Nothing to learn from yet (no issue history at all) -- skip rather
    // than writing zeros over defaults.
    if (!allTime && itemRecentIssues.length === 0) continue;

    const { avgDailyUsage, avgLeadTime, safetyStock, suggestedMinStock } =
      computeItemAnalytics(item, itemRecentIssues, allTime, windowStart);

    const setFields = {
      "analytics.avg_daily_usage": avgDailyUsage,
      "analytics.avg_lead_time": avgLeadTime,
      "analytics.safety_stock": safetyStock,
      "analytics.suggested_min_stock": suggestedMinStock,
    };

    // Only touch min_stock when the item is in "auto" mode -- a manual
    // override the user set on the item page must never get clobbered here.
    if ((item.analytics?.safety_stock_mode || "manual") === "auto") {
      setFields.min_stock = suggestedMinStock;
    }

    bulkOps.push({
      updateOne: { filter: { _id: item._id }, update: { $set: setFields } },
    });
  }

  if (bulkOps.length) {
    await Item.bulkWrite(bulkOps);
  }

  console.log(`Analytics updated for ${bulkOps.length} item(s)`);
};

/**
 * Same calculation, scoped to a single item -- handy for a future
 * "recalculate this item" action without re-running the whole catalog.
 */
const recalculateAnalyticsForItem = async (itemId) => {
  const item = await Item.findById(itemId).lean();
  if (!item || item.is_deleted) return null;

  const now = new Date();
  const windowStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);

  const recentIssues = await Transaction.find({
    item_id: itemId,
    type: "issue",
    createdAt: { $gte: windowStart },
  })
    .select("item_id quantity createdAt")
    .lean();

  const allTimeAgg = await Transaction.aggregate([
    { $match: { item_id: item._id, type: "issue" } },
    {
      $group: {
        _id: "$item_id",
        totalAll: { $sum: "$quantity" },
        firstDate: { $min: "$createdAt" },
        lastDate: { $max: "$createdAt" },
      },
    },
  ]);
  const allTime = allTimeAgg[0];

  if (!allTime && recentIssues.length === 0) return null;

  const { avgDailyUsage, avgLeadTime, safetyStock, suggestedMinStock } =
    computeItemAnalytics(item, recentIssues, allTime, windowStart);

  const setFields = {
    "analytics.avg_daily_usage": avgDailyUsage,
    "analytics.avg_lead_time": avgLeadTime,
    "analytics.safety_stock": safetyStock,
    "analytics.suggested_min_stock": suggestedMinStock,
  };
  if ((item.analytics?.safety_stock_mode || "manual") === "auto") {
    setFields.min_stock = suggestedMinStock;
  }

  return Item.findByIdAndUpdate(itemId, { $set: setFields }, { new: true });
};

module.exports = {
  runAnalyticsForAllItems,
  recalculateAnalyticsForItem,
};
