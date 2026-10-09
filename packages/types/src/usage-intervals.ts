import type { UsageGranularity } from "./usage.js";

export interface UsageInterval {
  readonly startedAt: number;
  readonly endedAt: number;
}

export interface UsageSubjectInterval extends UsageInterval {
  readonly subjectId: string;
}

function validateInterval(interval: UsageInterval, positive = false): void {
  if (
    !Number.isFinite(interval.startedAt) ||
    !Number.isFinite(interval.endedAt) ||
    !Number.isFinite(new Date(interval.startedAt).getTime()) ||
    !Number.isFinite(new Date(interval.endedAt).getTime()) ||
    interval.endedAt < interval.startedAt ||
    (positive && interval.endedAt === interval.startedAt)
  )
    throw new Error(
      "Usage intervals require finite ordered timestamps and a positive reporting window",
    );
}

export function unionUsageIntervals(
  intervals: readonly UsageInterval[],
  window: UsageInterval,
): UsageInterval[] {
  validateInterval(window, true);
  const clipped = intervals
    .map((interval) => {
      validateInterval(interval);
      return {
        startedAt: Math.max(interval.startedAt, window.startedAt),
        endedAt: Math.min(interval.endedAt, window.endedAt),
      };
    })
    .filter((interval) => interval.endedAt > interval.startedAt)
    .sort((a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt);
  const result: UsageInterval[] = [];
  for (const interval of clipped) {
    const previous = result.at(-1);
    if (previous && interval.startedAt <= previous.endedAt)
      result[result.length - 1] = {
        startedAt: previous.startedAt,
        endedAt: Math.max(previous.endedAt, interval.endedAt),
      };
    else result.push(interval);
  }
  return result;
}

export function intersectUsageIntervals(
  intervals: readonly UsageInterval[],
  coverage: readonly UsageInterval[],
  window: UsageInterval,
): UsageInterval[] {
  const sources = unionUsageIntervals(intervals, window);
  const allowed = unionUsageIntervals(coverage, window);
  const result: UsageInterval[] = [];
  let sourceIndex = 0;
  let coverageIndex = 0;
  while (sourceIndex < sources.length && coverageIndex < allowed.length) {
    const source = sources[sourceIndex];
    const available = allowed[coverageIndex];
    if (!source || !available) break;
    const startedAt = Math.max(source.startedAt, available.startedAt);
    const endedAt = Math.min(source.endedAt, available.endedAt);
    if (endedAt > startedAt) result.push({ startedAt, endedAt });
    if (source.endedAt <= available.endedAt) sourceIndex++;
    if (available.endedAt <= source.endedAt) coverageIndex++;
  }
  return result;
}

export function summarizeUsageIntervals(
  intervals: readonly UsageSubjectInterval[],
  window: UsageInterval,
) {
  validateInterval(window, true);
  const subjects = new Map<string, UsageInterval[]>();
  for (const interval of intervals) {
    if (!interval.subjectId) throw new Error("A scoped subject identity is required");
    const group = subjects.get(interval.subjectId) ?? [];
    group.push(interval);
    subjects.set(interval.subjectId, group);
  }
  const changes = new Map<number, number>();
  let seconds = 0;
  for (const group of subjects.values()) {
    for (const interval of unionUsageIntervals(group, window)) {
      seconds += (interval.endedAt - interval.startedAt) / 1000;
      changes.set(interval.startedAt, (changes.get(interval.startedAt) ?? 0) + 1);
      changes.set(interval.endedAt, (changes.get(interval.endedAt) ?? 0) - 1);
    }
  }
  let active = 0;
  let peak = 0;
  for (const [, delta] of [...changes].sort(([a], [b]) => a - b)) {
    active += delta;
    peak = Math.max(peak, active);
  }
  return { seconds, peak, average: seconds / ((window.endedAt - window.startedAt) / 1000) };
}

export function splitUsageInterval(
  interval: UsageInterval,
  granularity: UsageGranularity,
  maximumBuckets = 10_000,
): UsageInterval[] {
  validateInterval(interval);
  if (!Number.isSafeInteger(maximumBuckets) || maximumBuckets < 1 || maximumBuckets > 100_000)
    throw new Error("Usage bucket limits must be integers between 1 and 100000");
  const result: UsageInterval[] = [];
  let startedAt = interval.startedAt;
  while (startedAt < interval.endedAt) {
    if (result.length >= maximumBuckets) throw new Error("Usage interval exceeds the bucket limit");
    const boundary = new Date(startedAt);
    switch (granularity) {
      case "minute":
        boundary.setUTCSeconds(0, 0);
        boundary.setUTCMinutes(boundary.getUTCMinutes() + 1);
        break;
      case "hour":
        boundary.setUTCMinutes(0, 0, 0);
        boundary.setUTCHours(boundary.getUTCHours() + 1);
        break;
      case "day":
        boundary.setUTCHours(0, 0, 0, 0);
        boundary.setUTCDate(boundary.getUTCDate() + 1);
        break;
      case "month":
        boundary.setUTCHours(0, 0, 0, 0);
        boundary.setUTCDate(1);
        boundary.setUTCMonth(boundary.getUTCMonth() + 1);
        break;
      default:
        throw new Error("Unsupported UTC usage granularity");
    }
    const endedAt = Math.min(boundary.getTime(), interval.endedAt);
    if (!Number.isFinite(endedAt) || endedAt <= startedAt)
      throw new Error("Usage bucket boundary is outside the supported date range");
    result.push({ startedAt, endedAt });
    startedAt = endedAt;
  }
  return result;
}
