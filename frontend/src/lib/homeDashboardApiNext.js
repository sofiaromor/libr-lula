import * as legacy from "./homeDashboardApiImpl.js";
import {
  getHomeDashboardData,
  invalidateHomeDataCaches,
} from "./homeDashboardFastApi.js";

export { getHomeDashboardData };
export const searchReaderPostBooks = legacy.searchReaderPostBooks;
export const getBookProgressThread = legacy.getBookProgressThread;

export async function saveWeeklyPageGoal(...args) {
  const result = await legacy.saveWeeklyPageGoal(...args);
  invalidateHomeDataCaches();
  return result;
}

export async function recordReadingProgress(...args) {
  const result = await legacy.recordReadingProgress(...args);
  invalidateHomeDataCaches();
  return result;
}

export async function publishReaderPost(...args) {
  const result = await legacy.publishReaderPost(...args);
  invalidateHomeDataCaches();
  return result;
}

export async function toggleActivityLike(...args) {
  const result = await legacy.toggleActivityLike(...args);
  invalidateHomeDataCaches();
  return result;
}

export async function addActivityComment(...args) {
  const result = await legacy.addActivityComment(...args);
  invalidateHomeDataCaches();
  return result;
}
