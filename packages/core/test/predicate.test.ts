import { getPath, matchesPredicate, validatePredicate } from "../src/predicate.js";

const USER = {
  id: "u1",
  email: "ada@example.com",
  status: "active",
  age: 36,
  roles: ["admin", "editor"],
  metadata: {
    tier: "pro",
    last_location: "xyz",
    seats: 5,
    teams: [
      { name: "core", level: 3 },
      { name: "ops", level: 1 }
    ]
  }
};

describe("getPath", () => {
  it("reads a top-level field", () => {
    expect(getPath(USER, "email")).toBe("ada@example.com");
  });

  it("reads through dot notation", () => {
    expect(getPath(USER, "metadata.last_location")).toBe("xyz");
  });

  it("returns undefined for a missing link instead of throwing", () => {
    expect(getPath(USER, "metadata.missing.deeper")).toBeUndefined();
    expect(getPath(null, "anything")).toBeUndefined();
  });
});

describe("matchesPredicate", () => {
  it("matches everything when there is no predicate", () => {
    expect(matchesPredicate(USER, null)).toBe(true);
    expect(matchesPredicate(USER, undefined)).toBe(true);
    expect(matchesPredicate(USER, {})).toBe(true);
  });

  it("treats a bare value as $eq", () => {
    expect(matchesPredicate(USER, { status: "active" })).toBe(true);
    expect(matchesPredicate(USER, { status: "banned" })).toBe(false);
  });

  it("matches through dot notation", () => {
    expect(matchesPredicate(USER, { "metadata.last_location": "xyz" })).toBe(true);
    expect(matchesPredicate(USER, { "metadata.last_location": "abc" })).toBe(false);
  });

  it("ANDs several fields", () => {
    expect(matchesPredicate(USER, { status: "active", "metadata.tier": "pro" })).toBe(true);
    expect(matchesPredicate(USER, { status: "active", "metadata.tier": "free" })).toBe(false);
  });

  it("ANDs several operators on one field", () => {
    expect(matchesPredicate(USER, { age: { $gte: 30, $lt: 40 } })).toBe(true);
    expect(matchesPredicate(USER, { age: { $gte: 30, $lt: 35 } })).toBe(false);
  });

  it("fails a missing field rather than throwing", () => {
    expect(matchesPredicate(USER, { nope: "x" })).toBe(false);
    expect(matchesPredicate(null, { status: "active" })).toBe(false);
  });

  describe("$eq / $ne", () => {
    it("compares scalars", () => {
      expect(matchesPredicate(USER, { status: { $eq: "active" } })).toBe(true);
      expect(matchesPredicate(USER, { status: { $ne: "active" } })).toBe(false);
      expect(matchesPredicate(USER, { status: { $ne: "banned" } })).toBe(true);
    });

    it("compares arrays structurally", () => {
      expect(matchesPredicate(USER, { roles: { $eq: ["admin", "editor"] } })).toBe(true);
      expect(matchesPredicate(USER, { roles: { $eq: ["editor", "admin"] } })).toBe(false);
    });
  });

  describe("$in / $nin", () => {
    it("tests membership for a scalar field", () => {
      expect(matchesPredicate(USER, { "metadata.tier": { $in: ["pro", "team"] } })).toBe(true);
      expect(matchesPredicate(USER, { "metadata.tier": { $in: ["free"] } })).toBe(false);
    });

    it("intersects when the field is itself an array", () => {
      expect(matchesPredicate(USER, { roles: { $in: ["admin"] } })).toBe(true);
      expect(matchesPredicate(USER, { roles: { $in: ["owner"] } })).toBe(false);
    });

    it("$nin is the negation", () => {
      expect(matchesPredicate(USER, { roles: { $nin: ["owner"] } })).toBe(true);
      expect(matchesPredicate(USER, { roles: { $nin: ["admin"] } })).toBe(false);
    });

    it("fails closed when the argument is not an array", () => {
      expect(matchesPredicate(USER, { roles: { $in: "admin" } })).toBe(false);
    });
  });

  describe("$gt / $gte / $lt / $lte", () => {
    it("orders numbers", () => {
      expect(matchesPredicate(USER, { age: { $gt: 35 } })).toBe(true);
      expect(matchesPredicate(USER, { age: { $gt: 36 } })).toBe(false);
      expect(matchesPredicate(USER, { age: { $gte: 36 } })).toBe(true);
      expect(matchesPredicate(USER, { age: { $lt: 40 } })).toBe(true);
      expect(matchesPredicate(USER, { age: { $lte: 36 } })).toBe(true);
    });

    it("orders strings", () => {
      expect(matchesPredicate(USER, { status: { $gt: "a" } })).toBe(true);
      expect(matchesPredicate(USER, { status: { $lt: "a" } })).toBe(false);
    });

    it("refuses to compare across types instead of coercing", () => {
      expect(matchesPredicate(USER, { status: { $gt: 1 } })).toBe(false);
      expect(matchesPredicate(USER, { age: { $gt: "1" } })).toBe(false);
    });
  });

  describe("$elemMatch", () => {
    it("matches when some element satisfies the condition", () => {
      expect(matchesPredicate(USER, { roles: { $elemMatch: "admin" } })).toBe(true);
      expect(matchesPredicate(USER, { roles: { $elemMatch: "owner" } })).toBe(false);
    });

    it("accepts an operator bag as the element condition", () => {
      expect(matchesPredicate(USER, { roles: { $elemMatch: { $in: ["editor"] } } })).toBe(true);
    });

    it("fails when the field is not an array", () => {
      expect(matchesPredicate(USER, { status: { $elemMatch: "active" } })).toBe(false);
    });
  });

  it("ignores an unsupported operator rather than matching by accident", () => {
    expect(matchesPredicate(USER, { email: { $regex: ".*" } as never })).toBe(false);
  });

  it("does not support nested query objects — dot notation is the only way in", () => {
    // By design: this reads as "metadata equals the object {tier:'pro'}",
    // which it does not, rather than as a nested query.
    expect(matchesPredicate(USER, { metadata: { tier: "pro" } })).toBe(false);
    expect(matchesPredicate(USER, { "metadata.tier": "pro" })).toBe(true);
  });
});

describe("validatePredicate", () => {
  it("accepts a well-formed predicate", () => {
    expect(validatePredicate({ status: "active", age: { $gte: 18 } })).toEqual([]);
    expect(validatePredicate(null)).toEqual([]);
  });

  it("flags a nested query object and points at dot notation", () => {
    const problems = validatePredicate({ metadata: { tier: "pro" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("dot notation");
  });

  it("flags an unsupported operator", () => {
    const problems = validatePredicate({ email: { $regex: ".*" } });
    expect(problems[0]).toContain("$regex");
  });

  it("flags a top-level operator", () => {
    const problems = validatePredicate({ $or: [] });
    expect(problems[0]).toContain("top-level operators");
  });

  it("flags mixing operators with plain keys", () => {
    const problems = validatePredicate({ age: { $gte: 18, oops: 1 } });
    expect(problems.some((p) => p.includes("cannot mix"))).toBe(true);
  });

  it("rejects a non-object predicate", () => {
    expect(validatePredicate("nope")).toEqual(["predicate must be an object"]);
  });
});
