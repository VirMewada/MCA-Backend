const Category = require("../Models/CategoryModel");
const catchAsync = require("../Utils/catchAsync");

////////////////////////////////////////////////////////////

// 🔍 Find Single Category
exports.find = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);

  res.status(200).json({
    status: 200,
    success: true,
    data: { category },
  });
});

////////////////////////////////////////////////////////////

// 📂 Get All Categories (flat)
exports.index = catchAsync(async (req, res) => {
  const categories = await Category.find({ is_deleted: false }).sort({
    code: 1,
  });

  res.status(200).json({
    status: 200,
    success: true,
    data: { categories },
  });
});

////////////////////////////////////////////////////////////

// 🌳 Get Tree Structure (IMPORTANT for UI)
exports.tree = catchAsync(async (req, res) => {
  const categories = await Category.find({ is_deleted: false }).lean();

  const map = {};
  const tree = [];

  categories.forEach((cat) => {
    map[cat._id] = { ...cat, children: [] };
  });

  categories.forEach((cat) => {
    if (cat.parent) {
      map[cat.parent]?.children.push(map[cat._id]);
    } else {
      tree.push(map[cat._id]);
    }
  });

  res.status(200).json({
    status: 200,
    success: true,
    data: { categories: tree },
  });
});

////////////////////////////////////////////////////////////

// ➕ Create Category (AUTO CODE GENERATION)
exports.store = catchAsync(async (req, res) => {
  const { name, parentId, customCode } = req.body;

  let code = "";
  let level = 1;
  let full_path = name;
  let parent = null;

  if (parentId) {
    parent = await Category.findById(parentId);

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Parent category not found",
      });
    }

    level = parent.level + 1;
    full_path = `${parent.full_path} / ${name}`;

    if (customCode) {
      // ✅ VALIDATE custom code
      if (!customCode.startsWith(parent.code)) {
        return res.status(400).json({
          success: false,
          message: "Code must match parent hierarchy",
        });
      }

      code = customCode;
    } else {
      // AUTO GENERATE
      const count = await Category.countDocuments({
        parent: parentId,
        is_deleted: false,
      });

      code = `${parent.code}/${count + 1}`;
    }

    parent.is_leaf = false;
    await parent.save();
  } else {
    // ROOT
    if (customCode) {
      code = customCode;
    } else {
      const rootCount = await Category.countDocuments({
        parent: null,
        is_deleted: false,
      });

      code = `R${rootCount + 1}`;
    }

    level = 1;
    full_path = name;
  }

  const category = await Category.create({
    name,
    code,
    parent: parentId || null,
    level,
    full_path,
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Category Created Successfully",
    data: { category },
  });
});

////////////////////////////////////////////////////////////

// ✏️ Update Category
exports.update = catchAsync(async (req, res) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Category Updated Successfully",
    data: { category },
  });
});

////////////////////////////////////////////////////////////

// ❌ Soft Delete Category
exports.delete = catchAsync(async (req, res) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { is_deleted: true },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Category Deleted Successfully",
    data: { category },
  });
});
