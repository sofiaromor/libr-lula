import * as fullProfile from "./profileApiImpl.js";
import { getHomeReadingProfileOverview } from "./homeDashboardFastApi.js";

export async function getProfileOverview(profileId) {
  if (profileId === undefined) {
    return getHomeReadingProfileOverview();
  }
  return fullProfile.getProfileOverview(profileId);
}

export const invalidateProfileOverview = fullProfile.invalidateProfileOverview;
export const uploadProfileCover = fullProfile.uploadProfileCover;
