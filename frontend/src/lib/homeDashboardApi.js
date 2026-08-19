import * as legacy from "./homeDashboardApiImpl.js";
import {
  getHomeDashboardData as fetchHomeDashboardData,
  invalidateHomeDataCaches,
} from "./homeDashboardFastApi.js";
import { invalidateHomeReadingSnapshot } from "./profileApi.js";

const HOME_DASHBOARD_SNAPSHOT_KEY = "librelula:home-dashboard:v1";
const HOME_DASHBOARD_SNAPSHOT_MAX_AGE = 2 * 60_000;
let homeDashboardSnapshot = null;

function readStoredSnapshot() {
  if (homeDashboardSnapshot && Date.now() - homeDashboardSnapshot.savedAt < HOME_DASHBOARD_SNAPSHOT_MAX_AGE) {
    return homeDashboardSnapshot.data;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(HOME_DASHBOARD_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.savedAt) return null;
    if (Date.now() - Number(parsed.savedAt) >= HOME_DASHBOARD_SNAPSHOT_MAX_AGE) {
      window.sessionStorage.removeItem(HOME_DASHBOARD_SNAPSHOT_KEY);
      return null;
    }

    homeDashboardSnapshot = parsed;
    return parsed.data;
  } catch {
    return null;
  }
}

function storeSnapshot(data) {
  const snapshot = { savedAt: Date.now(), data };
  homeDashboardSnapshot = snapshot;

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HOME_DASHBOARD_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // La caché es opcional; si sessionStorage no está disponible, seguimos con memoria.
  }
}

function clearDashboardSnapshot() {
  homeDashboardSnapshot = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(HOME_DASHBOARD_SNAPSHOT_KEY);
  } catch {
    // Sin efecto funcional.
  }
}

function invalidateDashboard() {
  invalidateHomeDataCaches();
  clearDashboardSnapshot();
}

async function fetchAndStoreDashboard() {
  const data = await fetchHomeDashboardData();
  storeSnapshot(data);
  return data;
}

export async function getHomeDashboardData() {
  const cached = readStoredSnapshot();
  if (cached) return cached;
  return fetchAndStoreDashboard();
}

export async function prewarmHomeDashboard() {
  const cached = readStoredSnapshot();
  if (cached) return cached;
  return fetchAndStoreDashboard();
}

export const searchReaderPostBooks = legacy.searchReaderPostBooks;
export const getBookProgressThread = legacy.getBookProgressThread;

export async function saveWeeklyPageGoal(...args) {
  const result = await legacy.saveWeeklyPageGoal(...args);
  invalidateDashboard();
  return result;
}

export async function recordReadingProgress(...args) {
  const result = await legacy.recordReadingProgress(...args);
  invalidateDashboard();
  invalidateHomeReadingSnapshot();
  return result;
}

export async function publishReaderPost(...args) {
  const result = await legacy.publishReaderPost(...args);
  invalidateDashboard();
  return result;
}

export async function toggleActivityLike(...args) {
  const result = await legacy.toggleActivityLike(...args);
  invalidateDashboard();
  return result;
}

export async function addActivityComment(...args) {
  const result = await legacy.addActivityComment(...args);
  invalidateDashboard();
  return result;
}
