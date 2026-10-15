import test from "node:test";
import assert from "node:assert/strict";
import { CombatEntropy, validateCombatFormula } from "../dist/index.js";

const dice = (sides, sign = 1, count = 1) => ({
  kind: "dice",
  sides,
  sign,
  count,
});
const formula = (...terms) => [
  {
    source: { kind: "base", id: "captured-rule", name: "Captured rule" },
    label: "Explicit contribution",
    terms,
  },
];
const sample = (value, sides) => (value - 0.5) / sides;

test("signed attack and armor pools reproduce the confirmed 15 versus 17 example", () => {
  const entropy = new CombatEntropy([
    sample(13, 20),
    sample(4, 4),
    sample(2, 2),
    sample(10, 10),
    sample(4, 6),
    sample(1, 8),
    sample(2, 2),
  ]);
  const attack = entropy.roll(
    "Attack",
    formula(dice(20), dice(4), dice(2, -1)),
  );
  const defense = entropy.roll(
    "Defense",
    formula(dice(10), dice(6), dice(8), dice(2)),
  );
  assert.equal(attack.total, 15);
  assert.equal(defense.total, 17);
  assert.equal(entropy.consumed, 7);
  assert.equal(attack.samples.length, 3);
});

test("critical damage doubles signed dice counts while constants remain unchanged", () => {
  const captured = formula(dice(6), dice(4, -1), {
    kind: "constant",
    value: 3,
  });
  const before = structuredClone(captured);
  const entropy = new CombatEntropy([
    sample(6, 6),
    sample(2, 6),
    sample(1, 4),
    sample(3, 4),
  ]);
  const result = entropy.roll("Critical damage", captured, true);
  assert.equal(result.total, 7); // 6 + 2 - 1 - 3 + 3
  assert.equal(entropy.consumed, 4);
  assert.deepEqual(captured, before);
});

test("invalid formulas and exhausted entropy fail instead of substituting a random roll", () => {
  assert.throws(() => validateCombatFormula(formula(dice(0))));
  assert.throws(() =>
    validateCombatFormula(formula({ kind: "constant", value: 0.5 })),
  );
  assert.throws(() => new CombatEntropy([]).roll("Missing", formula(dice(6))));
  assert.throws(() => new CombatEntropy([1]).roll("Invalid", formula(dice(6))));
});

test("combined constants cannot overflow the exact integer range", () => {
  assert.throws(() =>
    new CombatEntropy([]).roll(
      "Overflow",
      formula(
        { kind: "constant", value: Number.MAX_SAFE_INTEGER },
        { kind: "constant", value: 1 },
      ),
    ),
  );
});
