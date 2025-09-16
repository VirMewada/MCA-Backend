const mongoose = require("mongoose");
const DB = process.env.DATABASE;
mongoose
  .set("strictQuery", true)
  .connect(DB, {
    useNewUrlParser: true,
  })
  .then(() => console.log("DB connection Successful!"))
  .catch((err) => {
    console.log(`DB Connection Failed`);
  });
