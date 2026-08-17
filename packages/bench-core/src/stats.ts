export interface AggregateStats {
  count: number;
  mean: number;
  standardDeviation: number;
  standardError: number;
  confidence95: [number, number];
  min: number;
  max: number;
}

export function aggregate(values: readonly number[]): AggregateStats {
  if (values.length === 0) throw new Error('cannot aggregate an empty sample');
  if (values.some((value) => !Number.isFinite(value))) throw new Error('sample contains a non-finite value');
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(values.length);
  const margin = 1.96 * standardError;
  return {
    count: values.length,
    mean,
    standardDeviation,
    standardError,
    confidence95: [mean - margin, mean + margin],
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

