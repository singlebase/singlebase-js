/**
 * A deliberately small MongoDB-flavoured matcher.
 *
 * It exists so a guard can say "render this only for an admin in the EU"
 * declaratively, against the profile carried by the session. The scope is
 * fixed on purpose:
 *
 *  - one level of operators, never nested query objects;
 *  - dot notation is the *only* way to reach into a nested value;
 *  - a fixed operator set, listed in OPERATORS below.
 *
 * Anything more expressive belongs in application code, not in an attribute.
 * Keeping it this small means a predicate is always cheap, always total, and
 * can never become a way to smuggle logic into markup.
 */

export const OPERATORS = [
  "$eq",
  "$ne",
  "$in",
  "$nin",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$elemMatch"
] as const;

export type Operator = (typeof OPERATORS)[number];

/** The right-hand side of one field: a bare value (implicit $eq) or an operator bag. */
export type Condition = unknown | Partial<Record<Operator, unknown>>;

/** `{ "metadata.tier": { $in: ["pro", "team"] }, status: "active" }` */
export type Predicate = Record<string, Condition>;

const OPERATOR_SET = new Set<string>(OPERATORS);

function isOperatorBag(value: unknown): value is Partial<Record<Operator, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as object);
  return keys.length > 0 && keys.every((key) => OPERATOR_SET.has(key));
}

/**
 * Reads `a.b.c` off an object. Returns undefined for any missing link rather
 * than throwing — an absent field simply fails to match.
 */
export function getPath(source: unknown, path: string): unknown {
  let current = source;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Loose structural equality, enough for the scalars and arrays a profile holds. */
function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => equals(item, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) =>
        equals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      )
    );
  }
  return false;
}

/**
 * Ordered comparison for $gt/$gte/$lt/$lte. Only like-typed numbers, strings
 * and dates compare; anything else is "not comparable", which fails the test
 * rather than coercing its way to a surprising answer.
 */
function compare(left: unknown, right: unknown): number | null {
  if (typeof left === "number" && typeof right === "number") {
    return Number.isNaN(left) || Number.isNaN(right) ? null : left - right;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  return null;
}

function matchOperator(operator: string, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "$eq":
      return equals(actual, expected);
    case "$ne":
      return !equals(actual, expected);
    case "$in":
      if (!Array.isArray(expected)) return false;
      // Mongo semantics: when the field is an array, membership is an
      // intersection test rather than whole-array equality.
      return Array.isArray(actual)
        ? actual.some((item) => expected.some((candidate) => equals(item, candidate)))
        : expected.some((candidate) => equals(actual, candidate));
    case "$nin":
      if (!Array.isArray(expected)) return false;
      return !matchOperator("$in", actual, expected);
    case "$gt":
    case "$gte":
    case "$lt":
    case "$lte": {
      const order = compare(actual, expected);
      if (order === null) return false;
      if (operator === "$gt") return order > 0;
      if (operator === "$gte") return order >= 0;
      if (operator === "$lt") return order < 0;
      return order <= 0;
    }
    case "$elemMatch": {
      if (!Array.isArray(actual)) return false;
      // One level only: the argument is a condition applied to each element,
      // not a nested query object.
      return actual.some((item) => matchCondition(item, expected));
    }
    default:
      return false;
  }
}

function matchCondition(actual: unknown, condition: Condition): boolean {
  if (isOperatorBag(condition)) {
    // Several operators on one field are ANDed, as in Mongo.
    return Object.entries(condition).every(([operator, expected]) =>
      matchOperator(operator, actual, expected)
    );
  }
  return equals(actual, condition);
}

/**
 * True when `subject` satisfies every field in `predicate`. An empty or
 * missing predicate matches everything, so a guard with no filter behaves
 * exactly like one that was never given a filter.
 */
export function matchesPredicate(
  subject: unknown,
  predicate: Predicate | null | undefined
): boolean {
  if (!predicate) return true;
  const entries = Object.entries(predicate);
  if (entries.length === 0) return true;
  if (subject === null || subject === undefined) return false;

  return entries.every(([path, condition]) => matchCondition(getPath(subject, path), condition));
}

/**
 * Reports what is wrong with a predicate, for a console warning at the point
 * of use. Returns [] when it is well-formed. Catching `{ $regex: ... }` or a
 * nested query object early is far kinder than silently never matching.
 */
export function validatePredicate(predicate: unknown): string[] {
  if (predicate === null || predicate === undefined) return [];
  if (typeof predicate !== "object" || Array.isArray(predicate)) {
    return ["predicate must be an object"];
  }

  const problems: string[] = [];
  for (const [path, condition] of Object.entries(predicate as Record<string, unknown>)) {
    if (path.startsWith("$")) {
      problems.push(`"${path}": top-level operators are not supported; use a field name`);
      continue;
    }
    if (condition === null || typeof condition !== "object" || Array.isArray(condition)) continue;

    const keys = Object.keys(condition as object);
    const operators = keys.filter((key) => key.startsWith("$"));

    if (operators.length === 0) {
      problems.push(
        `"${path}": nested objects are not supported; use dot notation, e.g. "${path}.field"`
      );
      continue;
    }
    if (operators.length !== keys.length) {
      problems.push(`"${path}": cannot mix operators with plain keys`);
    }
    for (const operator of operators) {
      if (!OPERATOR_SET.has(operator)) {
        problems.push(`"${path}": unsupported operator "${operator}"`);
      }
    }
  }
  return problems;
}
