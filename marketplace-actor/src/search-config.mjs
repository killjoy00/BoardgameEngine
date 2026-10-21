import { BOARD_GAME_RADIUS_KM } from "./match.mjs";

/**
 * Facebook's radius is a search hint, not a location guarantee.
 * All returned game listings are independently checked against the same
 * ~100-mile Austin radius in matchListing before any alert is queued.
 */
export function boardGameSearchInput(query) {
  return {
    searchKeyword: query.searchKeyword,
    location: "Austin, Texas, United States",
    radiusKm: BOARD_GAME_RADIUS_KM,
    sortBy: "creation_time_descend",
    daysSinceListed: query.priority <= 2 ? "1" : query.priority === 5 ? "30" : "7",
    getListingDetails: false,
    getAllListingPhotos: false,
    strictFiltering: true,
    maxPagesPerUrl: 1,
    onlyNewListings: false,
    proxy: { useApifyProxy: true }
  };
}
