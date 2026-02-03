/**
 * Event Aggregator
 * Combines all sources and provides filtering/sorting
 */

import { fetchConfsTech } from './sources/confs-tech.js';
import { fetchDevTo } from './sources/dev-to.js';
import { getCuratedConferences } from './sources/curated.js';

/**
 * Fetch all events from all sources
 */
export async function fetchAllEvents(options = {}) {
  const year = options.year || new Date().getFullYear();
  const results = {
    curated: [],
    conferences: [],
    listings: [],
    errors: []
  };
  
  // Always include curated list
  results.curated = getCuratedConferences(options.curatedFilters || {});
  
  // Fetch from confs.tech
  try {
    const confsTech = await fetchConfsTech(year);
    results.conferences = confsTech;
  } catch (err) {
    results.errors.push({ source: 'confs.tech', error: err.message });
  }
  
  // Fetch from dev.to
  try {
    const devTo = await fetchDevTo();
    results.listings = devTo;
  } catch (err) {
    results.errors.push({ source: 'dev.to', error: err.message });
  }
  
  return results;
}

/**
 * Get upcoming CFPs (Call for Papers)
 */
export async function getUpcomingCFPs(options = {}) {
  const allEvents = await fetchAllEvents(options);
  const now = new Date();
  const cfps = [];
  
  // From curated list
  for (const conf of allEvents.curated) {
    if (conf.cfpUrl) {
      cfps.push({
        name: conf.name,
        url: conf.url,
        cfpUrl: conf.cfpUrl,
        description: conf.description,
        tier: conf.tier,
        source: 'curated'
      });
    }
  }
  
  // From confs.tech with active CFPs
  for (const conf of allEvents.conferences) {
    if (conf.cfpUrl && conf.cfpEndDate) {
      const cfpEnd = new Date(conf.cfpEndDate);
      if (cfpEnd > now) {
        cfps.push({
          name: conf.name,
          url: conf.url,
          cfpUrl: conf.cfpUrl,
          cfpEndDate: conf.cfpEndDate,
          location: conf.city ? `${conf.city}, ${conf.country}` : conf.country,
          eventDate: conf.startDate,
          category: conf.category,
          source: 'confs.tech'
        });
      }
    }
  }
  
  // Sort by CFP end date (soonest first, unknowns at end)
  cfps.sort((a, b) => {
    if (!a.cfpEndDate && !b.cfpEndDate) return 0;
    if (!a.cfpEndDate) return 1;
    if (!b.cfpEndDate) return -1;
    return new Date(a.cfpEndDate) - new Date(b.cfpEndDate);
  });
  
  return cfps;
}

/**
 * Get upcoming conferences
 */
export async function getUpcomingConferences(options = {}) {
  const allEvents = await fetchAllEvents(options);
  const now = new Date();
  const upcoming = [];
  
  for (const conf of allEvents.conferences) {
    const startDate = new Date(conf.startDate);
    if (startDate > now) {
      upcoming.push(conf);
    }
  }
  
  // Sort by start date
  upcoming.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  
  // Add limit
  if (options.limit) {
    return upcoming.slice(0, options.limit);
  }
  
  return upcoming;
}

/**
 * Search across all sources
 */
export async function searchEvents(query, options = {}) {
  const allEvents = await fetchAllEvents(options);
  const queryLower = query.toLowerCase();
  const results = [];
  
  // Search curated
  for (const conf of allEvents.curated) {
    const searchText = `${conf.name} ${conf.description} ${conf.topics.join(' ')}`.toLowerCase();
    if (searchText.includes(queryLower)) {
      results.push({ ...conf, matchType: 'curated' });
    }
  }
  
  // Search conferences
  for (const conf of allEvents.conferences) {
    const searchText = `${conf.name} ${conf.city} ${conf.country} ${conf.category}`.toLowerCase();
    if (searchText.includes(queryLower)) {
      results.push({ ...conf, matchType: 'conference' });
    }
  }
  
  // Search listings
  for (const listing of allEvents.listings) {
    const searchText = `${listing.name} ${listing.description || ''}`.toLowerCase();
    if (searchText.includes(queryLower)) {
      results.push({ ...listing, matchType: 'listing' });
    }
  }
  
  return results;
}

export default {
  fetchAllEvents,
  getUpcomingCFPs,
  getUpcomingConferences,
  searchEvents
};
