/**
 * Fetch events from dev.to listings
 * https://dev.to/api - DEV Community API
 */

const DEV_TO_API = 'https://dev.to/api/listings';

// Search terms for engineering leadership events
const SEARCH_TERMS = [
  'conference',
  'speaking',
  'cfp',
  'call for papers',
  'engineering'
];

/**
 * Fetch event listings from dev.to
 */
export async function fetchDevTo() {
  const events = [];
  
  try {
    // Fetch listings in the events category
    const url = `${DEV_TO_API}?category=events&per_page=100`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'eng-speaker-events/1.0'
      }
    });
    
    if (!response.ok) {
      return events;
    }
    
    const listings = await response.json();
    
    for (const listing of listings) {
      // Filter for relevant events
      const title = (listing.title || '').toLowerCase();
      const body = (listing.body_markdown || '').toLowerCase();
      const combined = `${title} ${body}`;
      
      const isRelevant = SEARCH_TERMS.some(term => combined.includes(term));
      
      if (isRelevant) {
        events.push({
          source: 'dev.to',
          name: listing.title,
          url: `https://dev.to/listings/${listing.slug}`,
          description: listing.body_markdown?.slice(0, 300) || null,
          category: listing.category,
          publishedAt: listing.published_at,
          user: listing.user?.username || null
        });
      }
    }
  } catch (err) {
    // Silently fail
  }
  
  return events;
}

export default { fetchDevTo };
