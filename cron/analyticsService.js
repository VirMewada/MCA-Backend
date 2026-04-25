const Item = require("../Models/itemModel");
const Transaction = require("../Models/transactionModel");

const calculateAnalyticsForItem = async (item) => {
  const transactions = await Transaction.find({
    item_id: item._id,
  }).sort({ createdAt: 1 });

  if (!transactions.length) return;

  const issues = transactions.filter((t) => t.type === "issue");

  if (!issues.length) return;

  const totalUsed = issues.reduce((sum, t) => sum + t.quantity, 0);

  const firstDate = issues[0].createdAt;
  const lastDate = issues[issues.length - 1].createdAt;

  const days = (lastDate - firstDate) / (1000 * 60 * 60 * 24) || 1;

  const avgDailyUsage = totalUsed / days;

  // 🔹 Lead time from vendors (average)
  const leadTimes = item.vendors?.map((v) => v.lead_time_days).filter(Boolean);

  const avgLeadTime =
    leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : 0;

  // 🔹 Safety stock (simple buffer: 3 days)
  const safetyStock = avgDailyUsage * 3;

  const reorderPoint = avgDailyUsage * avgLeadTime + safetyStock;

  await Item.findByIdAndUpdate(item._id, {
    "analytics.avg_daily_usage": avgDailyUsage,
    "analytics.avg_lead_time": avgLeadTime,
    "analytics.safety_stock": safetyStock,
    min_stock: reorderPoint,
  });
};

const runAnalyticsForAllItems = async () => {
  console.log("📊 Running inventory analytics...");

  const items = await Item.find({ is_deleted: false });

  for (const item of items) {
    await calculateAnalyticsForItem(item);
  }

  console.log("✅ Analytics updated successfully");
};

module.exports = {
  runAnalyticsForAllItems,
};
