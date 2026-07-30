const mongoose = require("mongoose");
const Item = require("../Models/itemModel");

/**
 * BOM graph utilities.
 *
 * Every traversal in here is ITERATIVE and depth-guarded. The original
 * getFullBOM/calculateCost were naively recursive with no cycle detection, so
 * a BOM that (indirectly) contained itself would recurse until the process
 * died. Nothing in this file can hang on a cyclic graph.
 */

const MAX_DEPTH = 32;

const idStr = (v) => (v && v._id ? String(v._id) : String(v));

/**
 * Whether an item can be manufactured.
 * Explicit procurement_type wins; otherwise "does it have a BOM".
 * Mirrors the isMakeable virtual so it works on .lean() documents too.
 */
function isMakeable(item) {
  if (!item) return false;
  if (item.procurement_type === "make") return true;
  if (item.procurement_type === "buy") return false;
  return (item.children?.length ?? 0) > 0;
}

/** Effective consumption per parent unit, including scrap allowance. */
function effectiveQty(child) {
  const qty = Number(child?.quantity) || 0;
  const scrap = Number(child?.scrap_pct) || 0;
  return qty * (1 + scrap / 100);
}

/**
 * The cost of ONE unit of an item.
 *
 * Leaf items are the tricky case: `costing.latest_cost` is only written when
 * someone edits or recalculates, so a freshly created part sits at 0 in the
 * database even though weight × rate + labour is its real cost. The `total`
 * virtual papers over that in API responses, but anything reading
 * latest_cost directly (the BOM table, cost rollups) saw 0.
 *
 * Always derive leaves from their inputs; only trust latest_cost for items
 * that genuinely have a BOM.
 */
function unitCostOf(item) {
  if (!item) return 0;

  const c = item.costing || {};
  const hasBOM = (item.children?.length ?? 0) > 0;

  if (!hasBOM) {
    const derived =
      (Number(c.weight) || 0) * (Number(c.rate) || 0) + (Number(c.labour) || 0);
    return derived || Number(c.latest_cost) || 0;
  }

  return Number(c.latest_cost) || 0;
}

/* ------------------------------------------------------------------ */
/* Graph loading                                                       */
/* ------------------------------------------------------------------ */

/**
 * Load every item reachable from `rootId` in breadth-first waves.
 *
 * One query per depth level rather than one per node — a 4-level BOM costs
 * 4 queries no matter how wide it is. The previous getFullBOM issued a query
 * per node (N+1) and re-fetched shared components once per occurrence.
 *
 * Returns a Map of id -> lean item. Safe on cyclic data: `seen` stops us
 * re-queueing anything we've already loaded.
 */
async function loadSubgraph(rootId) {
  const byId = new Map();
  let frontier = [String(rootId)];
  let depth = 0;

  while (frontier.length && depth <= MAX_DEPTH) {
    const missing = frontier.filter((id) => !byId.has(id));
    if (!missing.length) break;

    const docs = await Item.find({ _id: { $in: missing } })
      .select(
        "name code full_code type unit stock min_stock children costing procurement_type is_deleted"
      )
      .lean();

    docs.forEach((d) => byId.set(String(d._id), d));

    const next = [];
    docs.forEach((d) => {
      (d.children || []).forEach((c) => {
        const cid = idStr(c.item_id);
        if (cid && !byId.has(cid)) next.push(cid);
      });
    });

    frontier = [...new Set(next)];
    depth += 1;
  }

  return byId;
}

/* ------------------------------------------------------------------ */
/* Cycle detection                                                     */
/* ------------------------------------------------------------------ */

/**
 * Collect every descendant id of `rootId` (iterative DFS, cycle-safe).
 * Used to reject a proposed BOM edit that would create a loop.
 */
async function collectDescendants(rootId) {
  const graph = await loadSubgraph(rootId);
  const out = new Set();
  const stack = [String(rootId)];

  while (stack.length) {
    const cur = stack.pop();
    const node = graph.get(cur);
    if (!node) continue;

    (node.children || []).forEach((c) => {
      const cid = idStr(c.item_id);
      if (cid && !out.has(cid)) {
        out.add(cid);
        stack.push(cid);
      }
    });
  }

  return out;
}

/**
 * Validate a proposed `children` array for `parentId`.
 *
 * Rejects: malformed lines, non-positive quantities, duplicates, unknown or
 * soft-deleted items, self-reference, and any child that already has the
 * parent somewhere beneath it (which would close a loop).
 *
 * Returns { ok: true, children } with normalised lines, or
 * { ok: false, message }.
 */
async function validateChildren(parentId, children) {
  if (!Array.isArray(children)) {
    return { ok: false, message: "`children` must be an array." };
  }

  const parent = String(parentId);
  const normalised = [];
  const seen = new Set();

  for (const raw of children) {
    const childId = idStr(raw?.item_id);

    if (!childId || childId === "undefined" || childId === "null") {
      return { ok: false, message: "Every BOM line needs an item_id." };
    }
    // Guard before any query — an unchecked malformed id reaches Mongoose as
    // a CastError and surfaces to the client as an opaque 500.
    if (!mongoose.isValidObjectId(childId)) {
      return { ok: false, message: `"${childId}" is not a valid item id.` };
    }
    if (childId === parent) {
      return { ok: false, message: "An item cannot contain itself." };
    }
    if (seen.has(childId)) {
      return {
        ok: false,
        message:
          "The same component appears twice. Combine the quantities into one line.",
      };
    }
    seen.add(childId);

    const quantity = Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false,
        message: "Every BOM line needs a quantity greater than zero.",
      };
    }

    const scrap = Number(raw.scrap_pct ?? 0);
    if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) {
      return { ok: false, message: "scrap_pct must be between 0 and 100." };
    }

    normalised.push({ item_id: childId, quantity, scrap_pct: scrap });
  }

  // A "part" is a raw material — a leaf by definition. It must never gain a
  // bill of materials, or the part/assembly/main vocabulary stops meaning
  // anything and cost rollups start double-counting.
  //
  // Clearing children (empty array) stays allowed, so legacy documents that
  // already have some can be cleaned up.
  if (normalised.length) {
    const parentDoc = await Item.findById(parent).select("type name").lean();

    if (!parentDoc) {
      return { ok: false, message: "Item not found." };
    }

    if (parentDoc.type === "part") {
      return {
        ok: false,
        message: `"${parentDoc.name}" is a Part — raw materials can't have a bill of materials. Change its type to Assembly or Main first.`,
      };
    }
  }

  if (!normalised.length) return { ok: true, children: [] };

  // All referenced items must exist and be live.
  const ids = normalised.map((c) => c.item_id);
  const found = await Item.find({ _id: { $in: ids }, is_deleted: false })
    .select("_id name")
    .lean();

  if (found.length !== ids.length) {
    const foundSet = new Set(found.map((f) => String(f._id)));
    const missing = ids.filter((id) => !foundSet.has(id));
    return {
      ok: false,
      message: `These components don't exist or were deleted: ${missing.join(
        ", "
      )}`,
    };
  }

  // Cycle check: if the parent is reachable from any proposed child, adding
  // that child closes a loop.
  for (const c of normalised) {
    const descendants = await collectDescendants(c.item_id);
    if (descendants.has(parent)) {
      const name =
        found.find((f) => String(f._id) === c.item_id)?.name ?? c.item_id;
      return {
        ok: false,
        message: `Adding "${name}" would create a circular BOM — this item is already used somewhere inside it.`,
      };
    }
  }

  return { ok: true, children: normalised };
}

/* ------------------------------------------------------------------ */
/* Explosion                                                           */
/* ------------------------------------------------------------------ */

/**
 * Flatten a BOM to its purchased leaves, summing requirements per DISTINCT
 * item.
 *
 * This is the part that makes "how many can I make" correct. Taking a min
 * branch-by-branch double-counts anything used in more than one place:
 *
 *   2HP motor    = 1 wound stator + 2 bearings
 *   wound stator = 1 stator shaft + 2 bearings
 *
 * With 10 bearings, a per-branch min says 5 motors. Building 5 actually needs
 * 20 bearings. Summing into a flat vector gives bearings a requirement of 4
 * per motor, and floor(10/4) = 2 — the true answer.
 *
 * `stopAtSubAssemblies` treats any makeable child as a leaf instead of
 * descending, which answers "what can I build from sub-assemblies already on
 * the shelf" rather than "…from raw material".
 */
function explode(graph, rootId, { stopAtSubAssemblies = false } = {}) {
  const requirements = new Map(); // itemId -> qty per 1 root unit
  const cyclesHit = new Set();

  // path carries the ancestor chain so we can spot a loop without recursion.
  const stack = [{ id: String(rootId), multiplier: 1, depth: 0, path: new Set() }];

  while (stack.length) {
    const { id, multiplier, depth, path } = stack.pop();
    const node = graph.get(id);
    if (!node) continue;

    const children = node.children || [];
    const expandable = isMakeable(node) && children.length > 0;

    // Root always expands (otherwise there's nothing to compute).
    const isRoot = id === String(rootId);
    const shouldExpand =
      expandable &&
      depth < MAX_DEPTH &&
      (isRoot || !stopAtSubAssemblies) &&
      !path.has(id);

    if (path.has(id)) {
      cyclesHit.add(id);
      continue;
    }

    if (!shouldExpand) {
      if (!isRoot) {
        requirements.set(id, (requirements.get(id) || 0) + multiplier);
      }
      continue;
    }

    const nextPath = new Set(path);
    nextPath.add(id);

    for (const c of children) {
      const cid = idStr(c.item_id);
      if (!cid) continue;
      stack.push({
        id: cid,
        multiplier: multiplier * effectiveQty(c),
        depth: depth + 1,
        path: nextPath,
      });
    }
  }

  return { requirements, cyclesHit: [...cyclesHit] };
}

/**
 * How many of `rootId` can be built right now.
 *
 * Reports two figures because they answer different questions:
 *
 *   fromSubAssemblies — treats sub-assemblies on the shelf as available and
 *                       does NOT look inside them. "Can I ship this week?"
 *   fromRawMaterial   — ignores sub-assembly stock and explodes all the way
 *                       to purchased parts. "Do I need to raise POs?"
 *
 * `buildable` combines them: sub-assembly stock is consumed first, then the
 * shortfall is made from raw material.
 */
async function computeBuildable(rootId) {
  const graph = await loadSubgraph(rootId);
  const root = graph.get(String(rootId));

  if (!root) return { error: "Item not found." };

  if (!isMakeable(root)) {
    return {
      item: root,
      makeable: false,
      reason:
        root.procurement_type === "buy"
          ? "This item is marked as purchased, not manufactured."
          : "This item has no bill of materials, so there is nothing to build.",
      buildable: 0,
      fromSubAssemblies: 0,
      fromRawMaterial: 0,
      constraints: [],
      cycles: [],
    };
  }

  const describe = (id) => {
    const n = graph.get(id) || {};
    return {
      item_id: id,
      name: n.name ?? "(unknown)",
      full_code: n.full_code ?? null,
      unit: n.unit ?? null,
      type: n.type ?? null,
      stock: Number(n.stock) || 0,
    };
  };

  /** min over a requirement vector of floor(stock / required) */
  const limitOf = (requirements) => {
    let limit = Infinity;
    const lines = [];

    for (const [id, required] of requirements.entries()) {
      const node = graph.get(id);
      const stock = Number(node?.stock) || 0;
      const possible = required > 0 ? Math.floor(stock / required) : Infinity;

      lines.push({
        ...describe(id),
        required_per_unit: Number(required.toFixed(6)),
        possible,
        shortfall_for_one: Math.max(0, Number((required - stock).toFixed(6))),
      });

      if (possible < limit) limit = possible;
    }

    if (!requirements.size) limit = 0;
    return { limit: limit === Infinity ? 0 : limit, lines };
  };

  // Pass 1 — one level of expansion only; sub-assemblies counted as stock.
  const shallow = explode(graph, rootId, { stopAtSubAssemblies: true });
  const shallowResult = limitOf(shallow.requirements);

  // Pass 2 — full explosion to purchased leaves.
  const deep = explode(graph, rootId, { stopAtSubAssemblies: false });
  const deepResult = limitOf(deep.requirements);

  // Combined: use sub-assemblies on hand first, then make the rest from raw
  // material. Computed by re-running the deep explosion against the residual
  // stock left after the shallow pass has claimed what it can.
  const combined = combinePasses(graph, rootId, shallowResult.limit);

  const constraints = deepResult.lines
    .filter((l) => l.possible <= deepResult.limit)
    .sort((a, b) => a.possible - b.possible)
    .slice(0, 10);

  return {
    item: {
      _id: String(root._id),
      name: root.name,
      full_code: root.full_code,
      type: root.type,
      unit: root.unit,
      stock: Number(root.stock) || 0,
    },
    makeable: true,
    buildable: combined,
    fromSubAssemblies: shallowResult.limit,
    fromRawMaterial: deepResult.limit,
    constraints,
    componentsShallow: shallowResult.lines.sort(
      (a, b) => a.possible - b.possible
    ),
    componentsDeep: deepResult.lines.sort((a, b) => a.possible - b.possible),
    cycles: [...new Set([...shallow.cyclesHit, ...deep.cyclesHit])].map(
      describe
    ),
  };
}

/**
 * Sub-assembly stock first, raw material for the remainder.
 *
 * Walks the direct children once. For each, whatever is on the shelf is used
 * as-is; anything beyond that has to be manufactured from its own leaves.
 * Deliberately one level deep — going deeper turns this into a general
 * allocation problem with no single right answer, and a number nobody can
 * explain is worse than two numbers they can.
 */
function combinePasses(graph, rootId, shallowLimit) {
  const root = graph.get(String(rootId));
  if (!root) return 0;

  const available = new Map();
  const stockOf = (id) => {
    if (!available.has(id))
      available.set(id, Number(graph.get(id)?.stock) || 0);
    return available.get(id);
  };

  let limit = Infinity;

  for (const c of root.children || []) {
    const cid = idStr(c.item_id);
    const perUnit = effectiveQty(c);
    if (!cid || perUnit <= 0) continue;

    const onShelf = stockOf(cid);
    const child = graph.get(cid);

    let extra = 0;
    if (child && isMakeable(child)) {
      const sub = explode(graph, cid, { stopAtSubAssemblies: false });
      let subLimit = Infinity;
      for (const [leafId, required] of sub.requirements.entries()) {
        if (required <= 0) continue;
        const possible = Math.floor(stockOf(leafId) / required);
        if (possible < subLimit) subLimit = possible;
      }
      extra = subLimit === Infinity ? 0 : subLimit;
    }

    const possible = Math.floor((onShelf + extra) / perUnit);
    if (possible < limit) limit = possible;
  }

  if (limit === Infinity) limit = 0;
  return Math.max(limit, shallowLimit);
}

/* ------------------------------------------------------------------ */
/* Order feasibility                                                   */
/* ------------------------------------------------------------------ */

// Feasibility walks are capped shallower than MAX_DEPTH: each level clones the
// availability pool to probe without committing, so depth is paid for twice.
const FEASIBILITY_DEPTH = 12;

/**
 * Try to obtain `want` units of `itemId`, consuming from `pool`.
 *
 * Takes finished/sub-assembly stock first, then manufactures the shortfall out
 * of components — which is what a planner actually does. Returns how many were
 * obtained (may be fewer than asked).
 *
 * `pool` is mutated. Callers that only want to know the answer should pass a
 * clone.
 */
function obtain(graph, pool, itemId, want, depth = 0) {
  if (want <= 0) return 0;

  const id = String(itemId);
  const stock = pool.get(id) ?? 0;
  const fromStock = Math.min(want, stock);
  pool.set(id, stock - fromStock);

  let remaining = want - fromStock;
  if (remaining <= 0) return fromStock;

  const node = graph.get(id);
  if (!node || !isMakeable(node) || depth >= FEASIBILITY_DEPTH) {
    return fromStock;
  }

  const children = (node.children || []).filter((c) => idStr(c.item_id));
  if (!children.length) return fromStock;

  // How many COMPLETE units does the pool support?
  //
  // Asking each child for the full `remaining` in turn does NOT work: the
  // first child drains everything it can, starving a later child that needs
  // the same component, and the answer comes back 0 even when several units
  // are clearly makeable. (Ordering 5 motors that share bearings with their
  // own sub-assembly hit exactly this.)
  //
  // Feasibility is monotonic in k — if k units can be made, so can k-1 — so
  // binary search on k, testing each candidate against a fresh copy.
  const canMake = (k) => {
    if (k <= 0) return true;
    const probe = new Map(pool);
    for (const c of children) {
      const per = effectiveQty(c);
      if (per <= 0) continue;
      const need = k * per;
      if (obtain(graph, probe, idStr(c.item_id), need, depth + 1) < need) {
        return false;
      }
    }
    return true;
  };

  let lo = 0;
  let hi = remaining;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canMake(mid)) lo = mid;
    else hi = mid - 1;
  }

  const limit = lo;
  if (limit <= 0) return fromStock;

  // Commit exactly `limit` units against the real pool.
  for (const c of children) {
    const per = effectiveQty(c);
    if (per <= 0) continue;
    obtain(graph, pool, idStr(c.item_id), limit * per, depth + 1);
  }

  return fromStock + limit;
}

/**
 * Can we fulfil this order?
 *
 * The trap here is the same one that breaks naive buildable maths, one level
 * up: two order lines for different pumps that share a bearing will each
 * happily claim the same stock if evaluated independently. So lines are
 * settled against ONE shared availability pool.
 *
 * Allocation is greedy in line order — the first line gets first claim on
 * contested material. That's arbitrary but explainable, and predictable is
 * what matters when someone is deciding what to promise a customer.
 *
 * @param lines [{ item_id, quantity, dispatched_quantity }]
 */
async function computeOrderFeasibility(lines = []) {
  const rootIds = [
    ...new Set(lines.map((l) => idStr(l.item_id)).filter(Boolean)),
  ];

  if (!rootIds.length) {
    return { lines: [], fulfillable: true, shortages: [] };
  }

  // Merge every line's subgraph into one map so shared components resolve to
  // the same node (and therefore the same stock figure).
  const graph = new Map();
  for (const rootId of rootIds) {
    const sub = await loadSubgraph(rootId);
    sub.forEach((node, id) => {
      if (!graph.has(id)) graph.set(id, node);
    });
  }

  const pool = new Map();
  graph.forEach((node, id) => pool.set(id, Number(node.stock) || 0));

  // Snapshot opening stock so we can report what each line consumed.
  const opening = new Map(pool);

  const results = lines.map((line) => {
    const id = idStr(line.item_id);
    const node = graph.get(id);

    const ordered = Number(line.quantity) || 0;
    const dispatched = Number(line.dispatched_quantity) || 0;
    const outstanding = Math.max(0, ordered - dispatched);

    const before = pool.get(id) ?? 0;
    const fromStock = Math.min(outstanding, before);

    const obtained = obtain(graph, pool, id, outstanding);
    const buildable = Math.max(0, obtained - fromStock);
    const shortfall = Math.max(0, outstanding - obtained);

    return {
      item_id: id,
      name: node?.name ?? line.name ?? "(unknown item)",
      full_code: node?.full_code ?? null,
      unit: node?.unit ?? null,
      ordered,
      dispatched,
      outstanding,
      in_stock: before,
      from_stock: fromStock,
      buildable,
      available: obtained,
      shortfall,
      covered: outstanding === 0 || obtained >= outstanding,
    };
  });

  // Anything the pool ran dry on, reported against opening stock.
  const shortages = [];
  pool.forEach((left, id) => {
    const node = graph.get(id);
    if (!node) return;
    const start = opening.get(id) ?? 0;
    // Exhausted AND actually used — a component that was always zero and
    // never needed isn't a shortage worth surfacing.
    if (left <= 0 && start > 0) {
      shortages.push({
        item_id: id,
        name: node.name,
        full_code: node.full_code ?? null,
        unit: node.unit ?? null,
        opening_stock: start,
        remaining: 0,
      });
    }
  });

  const blocking = results.filter((r) => !r.covered);

  return {
    lines: results,
    fulfillable: blocking.length === 0,
    blocking: blocking.map((b) => ({
      item_id: b.item_id,
      name: b.name,
      shortfall: b.shortfall,
    })),
    shortages: shortages.slice(0, 20),
  };
}

/* ------------------------------------------------------------------ */
/* Cost rollup                                                         */
/* ------------------------------------------------------------------ */

/**
 * Recalculate `costing.latest_cost` for an item AND every assembly beneath it.
 *
 * The previous implementation computed the whole tree correctly in memory and
 * then saved only the root — its own comment said "cascade later" — so nested
 * assemblies kept stale costs indefinitely. This does a proper post-order pass
 * (children before parents) and bulk-writes every node whose cost moved.
 *
 * Cycle-safe: nodes currently on the traversal path are treated as costing 0
 * rather than recursing forever.
 *
 * Returns { updated: [{item_id, name, from, to}], costs: Map, cycles: [] }.
 */
async function recalculateCostTree(rootId) {
  const graph = await loadSubgraph(rootId);
  const root = graph.get(String(rootId));
  if (!root) return { error: "Item not found." };

  const costs = new Map();
  const cycles = new Set();

  // Iterative post-order: push a node, then re-visit it once its children are
  // resolved. Avoids recursion so a deep or cyclic BOM can't blow the stack.
  const stack = [{ id: String(rootId), phase: "enter", path: new Set() }];

  while (stack.length) {
    const frame = stack.pop();
    const node = graph.get(frame.id);
    if (!node) {
      costs.set(frame.id, 0);
      continue;
    }

    if (frame.phase === "enter") {
      if (frame.path.has(frame.id)) {
        cycles.add(frame.id);
        costs.set(frame.id, 0);
        continue;
      }
      if (costs.has(frame.id)) continue;

      const children = node.children || [];

      if (!children.length) {
        costs.set(frame.id, unitCostOf(node));
        continue;
      }

      const nextPath = new Set(frame.path);
      nextPath.add(frame.id);

      stack.push({ ...frame, phase: "exit", path: nextPath });
      for (const c of children) {
        const cid = idStr(c.item_id);
        if (cid) stack.push({ id: cid, phase: "enter", path: nextPath });
      }
      continue;
    }

    // exit — every child now has a cost
    let total = 0;
    for (const c of node.children || []) {
      const cid = idStr(c.item_id);
      total += (costs.get(cid) ?? 0) * effectiveQty(c);
    }
    costs.set(frame.id, Number(total.toFixed(4)));
  }

  // Persist every node whose stored cost actually changed.
  const ops = [];
  const updated = [];

  for (const [id, cost] of costs.entries()) {
    const node = graph.get(id);
    if (!node) continue;

    const stored = Number(node.costing?.latest_cost) || 0;
    if (Math.abs(stored - cost) < 0.0001) continue;

    ops.push({
      updateOne: {
        filter: { _id: id },
        update: {
          $set: { "costing.latest_cost": cost },
          // Keep an audit trail of how the cost moved over time.
          $push: {
            "costing.cost_history": {
              $each: [{ cost, date: new Date() }],
              $slice: -50,
            },
          },
        },
      },
    });

    updated.push({ item_id: id, name: node.name, from: stored, to: cost });
  }

  if (ops.length) await Item.bulkWrite(ops);

  return {
    rootCost: costs.get(String(rootId)) ?? 0,
    updated,
    cycles: [...cycles],
  };
}

module.exports = {
  MAX_DEPTH,
  isMakeable,
  effectiveQty,
  unitCostOf,
  recalculateCostTree,
  computeOrderFeasibility,
  loadSubgraph,
  collectDescendants,
  validateChildren,
  explode,
  computeBuildable,
};
