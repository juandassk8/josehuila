// Algoritmo puro de simulación semana a semana del Despliegue Creativo.
// Calcula cómo escala el budget operativo aplicando los TRES caps:
//   - winners (capacidad física: ganadores acumulados × capacidad por ganador)
//   - stability (cap de crecimiento semanal sobre el operativo)
//   - target (no superar el budget objetivo del cliente)
//
// El objeto config se pasa entero (no args sueltos) para poder agregar
// `fatigue`, `tofuMofuBofuSplit`, multi-canal etc sin romper la firma.
//
// Retorna baseline (week 0) + N semanas hasta target o hasta MAX_WEEKS.

export const MAX_WEEKS = 20;
export const STAGNATION_DELTA = 10000; // COP

/**
 * @typedef {Object} SimulateInputs
 * @property {number} currentBudget   COP/sem operativo actual del cliente
 * @property {number} targetBudget    COP/sem operativo deseado
 * @property {number} cpa             COP costo por compra
 * @property {number} aov             COP ticket promedio (revenue por compra)
 * @property {number} testsPerWeek    creativos nuevos a testear cada semana
 * @property {number} testBudgetMultiplier  cuántos × CPA recibe cada test
 * @property {number} winRate         fracción de tests que pasan a ganadores (0..1)
 * @property {number} capacityPerWinner    COP máximo que un ganador absorbe
 * @property {number} maxGrowthRate   cap de crecimiento semanal del operativo (0..1+)
 *
 * @typedef {Object} WeekRow
 * @property {number} week
 * @property {number} winners
 * @property {number|null} newWinners
 * @property {number} opBudget
 * @property {number} testingBudget
 * @property {number} totalSpend
 * @property {number} purchases
 * @property {number} revenue
 * @property {number} cpaReal
 * @property {number} roas
 * @property {'baseline'|'winners'|'stability'|'target'} limitReason
 */

/**
 * @param {SimulateInputs} inputs
 * @returns {WeekRow[]}
 */
export function simulate(inputs) {
  const {
    currentBudget,
    targetBudget,
    cpa,
    aov,
    testsPerWeek,
    testBudgetMultiplier,
    winRate,
    capacityPerWinner,
    maxGrowthRate,
  } = inputs;

  if (cpa <= 0 || capacityPerWinner <= 0) {
    return [baselineRow(currentBudget, cpa, aov)];
  }

  const testCost = cpa * testBudgetMultiplier;
  const weeklyTestingCost = testsPerWeek * testCost;
  const newWinnersPerWeek = testsPerWeek * winRate; // float, puede ser fraccional
  const initialWinners = Math.max(1, Math.round(currentBudget / capacityPerWinner));

  const rows = [baselineRow(currentBudget, cpa, aov, initialWinners)];

  let currentOpBudget = currentBudget;
  let totalWinnersFrac = initialWinners;
  let prevDisplayedWinners = initialWinners;

  for (let week = 1; week <= MAX_WEEKS; week++) {
    totalWinnersFrac += newWinnersPerWeek;
    const winnersDisplay = Math.floor(totalWinnersFrac);
    const newThisWeek = winnersDisplay - prevDisplayedWinners;
    prevDisplayedWinners = winnersDisplay;

    const physicalLimit = totalWinnersFrac * capacityPerWinner;
    const stabilityLimit = currentOpBudget * (1 + maxGrowthRate);
    const newOpBudget = Math.min(physicalLimit, stabilityLimit, targetBudget);

    let limitReason;
    if (newOpBudget >= targetBudget - 1) limitReason = 'target';
    else if (physicalLimit <= stabilityLimit) limitReason = 'winners';
    else limitReason = 'stability';

    const testingBudget = weeklyTestingCost;
    const totalSpend = newOpBudget + testingBudget;
    const purchases = Math.floor(newOpBudget / cpa);
    const revenue = purchases * aov;

    rows.push({
      week,
      winners: winnersDisplay,
      newWinners: newThisWeek,
      opBudget: newOpBudget,
      testingBudget,
      totalSpend,
      purchases,
      revenue,
      cpaReal: purchases > 0 ? totalSpend / purchases : 0,
      roas: totalSpend > 0 ? revenue / totalSpend : 0,
      limitReason,
    });

    if (newOpBudget >= targetBudget - 1) break;
    if (newOpBudget <= currentOpBudget + STAGNATION_DELTA) break;

    currentOpBudget = newOpBudget;
  }

  return rows;
}

function baselineRow(currentBudget, cpa, aov, winners = null) {
  const purchases = cpa > 0 ? Math.floor(currentBudget / cpa) : 0;
  const computedWinners = winners != null
    ? winners
    : (cpa > 0 ? Math.max(1, Math.round(currentBudget / cpa)) : 1);
  return {
    week: 0,
    winners: computedWinners,
    newWinners: null,
    opBudget: currentBudget,
    testingBudget: 0,
    totalSpend: currentBudget,
    purchases,
    revenue: purchases * aov,
    cpaReal: cpa,
    roas: cpa > 0 ? aov / cpa : 0,
    limitReason: 'baseline',
  };
}

// ───── Helpers de resumen para la vista ejecutiva ─────────────────────────

/**
 * Resume el resultado de una simulación para mostrar en cards.
 * @param {WeekRow[]} rows
 * @param {SimulateInputs} inputs
 */
export function summarize(rows, inputs) {
  if (!rows || rows.length <= 1) {
    return {
      reachedTarget: false,
      stagnated: true,
      hitMaxWeeks: false,
      weeks: 0,
      finalRow: rows?.[0] || null,
      baselineRow: rows?.[0] || null,
      totalInvestment: 0,
      monthlyLiftRevenue: 0,
      monthlyLiftPurchases: 0,
      revenueMultiplier: 1,
    };
  }

  const baseline = rows[0];
  const finalRow = rows[rows.length - 1];
  const weeks = finalRow.week;
  const reachedTarget = finalRow.limitReason === 'target';
  const hitMaxWeeks = !reachedTarget && weeks >= MAX_WEEKS;
  const stagnated = !reachedTarget && !hitMaxWeeks;

  // Inversión total = suma de totalSpend de las semanas posteriores a baseline.
  const totalInvestment = rows.slice(1).reduce((acc, r) => acc + r.totalSpend, 0);

  const monthlyFactor = 4.33; // semanas/mes
  const baselineMonthlyRevenue = baseline.revenue * monthlyFactor;
  const finalMonthlyRevenue = finalRow.revenue * monthlyFactor;
  const monthlyLiftRevenue = finalMonthlyRevenue - baselineMonthlyRevenue;
  const monthlyLiftPurchases = (finalRow.purchases - baseline.purchases) * monthlyFactor;
  const revenueMultiplier = baseline.revenue > 0
    ? finalRow.revenue / baseline.revenue
    : 0;

  return {
    reachedTarget,
    stagnated,
    hitMaxWeeks,
    weeks,
    finalRow,
    baselineRow: baseline,
    totalInvestment,
    monthlyLiftRevenue,
    monthlyLiftPurchases,
    revenueMultiplier,
    finalRoas: finalRow.roas,
    finalCpaReal: finalRow.cpaReal,
  };
}
