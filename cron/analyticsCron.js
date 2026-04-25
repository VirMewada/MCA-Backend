const cron = require("node-cron");
const { runAnalyticsForAllItems } = require("./analyticsService");

// 🕛 Runs every day at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("⏰ Midnight cron started");

    await runAnalyticsForAllItems();

    console.log("🎉 Cron completed");
  } catch (err) {
    console.error("❌ Cron failed:", err);
  }
});
