// Planificador inverso. Dado un objetivo de revenue mensual y un plazo en
// semanas, calcula qué presupuesto operativo hace falta y propone 3 escenarios
// (conservador / estándar / agresivo) según win rate típico.

const WEEKS_PER_MONTH = 4.33;
const MAX_TESTS_PER_WEEK = 150; // realismo de producción creativa
const MAX_GROWTH_RATE = 2.00;   // 200% sem es el techo razonable

/**
 * @typedef {Object} PlanInputs
 * @property {number} targetMonthlyRevenue
 * @property {number} targetWeeks
 * @property {number} currentBudget
 * @property {number} cpa
 * @property {number} aov
 * @property {number} capacityPerWinner
 *
 * @typedef {Object} PlannerScenario
 * @property {string} name
 * @property {string} hint
 * @property {number} winRate
 * @property {number} testsPerWeek
 * @property {number} growthRate
 * @property {number} targetBudget
 * @property {boolean} viable
 * @property {string|null} warning
 */

/**
 * @param {PlanInputs} inputs
 * @returns {{alreadyAchievable: true} | {
 *   alreadyAchievable: false,
 *   operativeBudgetNeeded: number,
 *   weeklyPurchasesNeeded: number,
 *   winnersToGenerate: number,
 *   winnersPerWeek: number,
 *   requiredGrowthRate: number,
 *   scenarios: PlannerScenario[]
 * }}
 */
export function plan(inputs) {
  const {
    targetMonthlyRevenue,
    targetWeeks,
    currentBudget,
    cpa,
    aov,
    capacityPerWinner,
  } = inputs;

  if (
    aov <= 0 || cpa <= 0 || capacityPerWinner <= 0 ||
    targetWeeks <= 0 || targetMonthlyRevenue <= 0
  ) {
    return { alreadyAchievable: true };
  }

  const weeklyRevenueNeeded = targetMonthlyRevenue / WEEKS_PER_MONTH;
  const weeklyPurchasesNeeded = weeklyRevenueNeeded / aov;
  const operativeBudgetNeeded = weeklyPurchasesNeeded * cpa;

  if (operativeBudgetNeeded <= currentBudget) {
    return { alreadyAchievable: true };
  }

  const initialWinners = Math.max(1, Math.round(currentBudget / capacityPerWinner));
  const targetWinners = Math.ceil(operativeBudgetNeeded / capacityPerWinner);
  const winnersToGenerate = Math.max(0, targetWinners - initialWinners);
  const winnersPerWeek = winnersToGenerate / targetWeeks;

  const requiredGrowthRate = Math.pow(
    operativeBudgetNeeded / Math.max(currentBudget, 1),
    1 / targetWeeks
  ) - 1;

  const baseScenarios = [
    { name: 'Conservador', winRate: 0.15, hint: 'Creatividad estándar' },
    { name: 'Estándar',    winRate: 0.25, hint: 'Creatividad sólida' },
    { name: 'Agresivo',    winRate: 0.40, hint: 'Producción top + buen hook' },
  ];

  const scenarios = baseScenarios.map((s) => {
    const testsNeeded = Math.max(1, Math.ceil(winnersPerWeek / s.winRate));
    const growthPct = requiredGrowthRate;
    const exceedsTests = testsNeeded > MAX_TESTS_PER_WEEK;
    const exceedsGrowth = growthPct > MAX_GROWTH_RATE;
    const viable = !exceedsTests && !exceedsGrowth;
    let warning = null;
    if (exceedsTests) {
      warning = `Requiere ${testsNeeded} tests/sem — supera la capacidad realista de producción.`;
    } else if (exceedsGrowth) {
      warning = `Crecimiento requerido ${Math.round(growthPct * 100)}%/sem — supera el cap de estabilidad.`;
    }
    return {
      ...s,
      testsPerWeek: testsNeeded,
      growthRate: growthPct,
      targetBudget: operativeBudgetNeeded,
      viable,
      warning,
    };
  });

  return {
    alreadyAchievable: false,
    operativeBudgetNeeded,
    weeklyPurchasesNeeded,
    winnersToGenerate,
    winnersPerWeek,
    requiredGrowthRate,
    scenarios,
  };
}
