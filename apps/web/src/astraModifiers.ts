/** Each ten points from fifty gives one modifier, rounding halfway away from zero. */
export function astraModifier(score: number): number {
  const delta = score - 50;
  const modifier = Math.sign(delta) * Math.floor(Math.abs(delta) / 10 + 0.5);
  return modifier === 0 ? 0 : modifier;
}
export function formatAstraModifier(score: number): string {
  const value = astraModifier(score);
  return value > 0 ? `+${value}` : String(value);
}
