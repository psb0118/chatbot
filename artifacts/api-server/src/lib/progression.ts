/**
 * Initial progression rules. The repository did not ship these rules with the
 * uploaded frontend, so they live in one place and can be tuned without
 * touching the route handlers.
 *
 * - Every 100 total EXP is one level.
 * - `exp` is the progress inside the current level, `totalExp` is lifetime EXP.
 * - Tiers match the `.tier-*` classes in the frontend design system.
 */
export const EXP_PER_LEVEL = 100;

export type Tier = 'Sprout' | 'Bloom' | 'Blossom' | 'Flover' | 'Star' | 'Moon';

export const tierForLevel = (level: number): Tier => {
  if (level >= 50) return 'Moon';
  if (level >= 35) return 'Star';
  if (level >= 20) return 'Flover';
  if (level >= 10) return 'Blossom';
  if (level >= 5) return 'Bloom';
  return 'Sprout';
};

export interface Progression {
  level: number;
  exp: number;
  totalExp: number;
  tier: Tier;
}

export const progressionForTotalExp = (totalExp: number): Progression => {
  const safeTotal = Math.max(0, Math.trunc(totalExp));
  const level = Math.floor(safeTotal / EXP_PER_LEVEL) + 1;
  return {
    level,
    exp: safeTotal % EXP_PER_LEVEL,
    totalExp: safeTotal,
    tier: tierForLevel(level),
  };
};

export const addExperience = (
  member: { totalExp: number },
  amount: number,
): Progression => progressionForTotalExp(member.totalExp + amount);
