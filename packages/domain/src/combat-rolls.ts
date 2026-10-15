import type { CombatFormula, CombatRoll } from "@aow/common";
export function validateCombatFormula(formula: CombatFormula): void {
  if (!Array.isArray(formula) || formula.length > 100)
    throw new TypeError("A captured roll formula is required.");
  let diceCount = 0;
  for (const c of formula) {
    if (
      !c.source?.id ||
      !c.source.name?.trim() ||
      !["base", "weapon", "armor", "skill", "attribute", "condition"].includes(
        c.source.kind,
      ) ||
      !c.label?.trim() ||
      !Array.isArray(c.terms) ||
      c.terms.length > 100
    )
      throw new TypeError("Roll contributions require a named rules source.");
    for (const t of c.terms) {
      if (t.kind === "dice") diceCount += t.count;
      if (
        t.kind === "constant"
          ? !Number.isSafeInteger(t.value)
          : t.kind !== "dice" ||
            !Number.isSafeInteger(t.count) ||
            t.count < 1 ||
            t.count > 100 ||
            !Number.isSafeInteger(t.sides) ||
            t.sides < 2 ||
            t.sides > 1000 ||
            ![1, -1].includes(t.sign)
      )
        throw new TypeError("Invalid signed roll term.");
    }
  }
  if (diceCount > 1000)
    throw new TypeError("A formula exceeds the supported dice budget.");
}
export class CombatEntropy {
  private cursor = 0;
  get consumed(): number {
    return this.cursor;
  }
  private readonly laneCursors: Record<string, number> = {};
  constructor(
    private readonly samples: readonly number[],
    private readonly lanes?: Readonly<Record<string, readonly number[]>>,
  ) {}
  roll(
    label: string,
    formula: CombatFormula,
    critical = false,
    lane?: string,
  ): CombatRoll {
    validateCombatFormula(formula);
    const samples: number[] = [];
    let total = 0;
    for (const c of formula)
      for (const term of c.terms) {
        if (term.kind === "constant") total += term.value;
        else
          for (let i = 0; i < term.count * (critical ? 2 : 1); i++) {
            const index =
              lane && this.lanes ? (this.laneCursors[lane] ?? 0) : this.cursor;
            const sample =
              lane && this.lanes
                ? this.lanes[lane]?.[index]
                : this.samples[index];
            if (lane && this.lanes) this.laneCursors[lane] = index + 1;
            this.cursor++;
            if (
              sample === undefined ||
              !Number.isFinite(sample) ||
              sample < 0 ||
              sample >= 1
            )
              throw new TypeError(
                "Trusted roll entropy is missing or invalid.",
              );
            samples.push(sample);
            total += term.sign * (1 + Math.floor(sample * term.sides));
          }
      }
    if (!Number.isSafeInteger(total))
      throw new TypeError("Roll total exceeds the supported integer range.");
    return { label, formula, samples, total };
  }
}
