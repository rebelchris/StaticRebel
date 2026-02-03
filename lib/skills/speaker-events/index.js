/**
 * Speaker Events Skill for StaticRebel
 * Find conferences and CFPs for engineering managers
 */

import { 
  fetchAllEvents, 
  getUpcomingCFPs, 
  getUpcomingConferences,
  searchEvents 
} from './aggregator.js';
import { getCuratedConferences } from './sources/curated.js';

/**
 * Format a date nicely
 */
function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Calculate days until a date
 */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  return diff;
}

/**
 * Get upcoming CFPs formatted for chat
 */
export async function getCFPs(options = {}) {
  const cfps = await getUpcomingCFPs(options);
  const limit = options.limit || 10;
  
  if (cfps.length === 0) {
    return {
      text: "No open CFPs found right now. Check back later or browse the curated conference list.",
      data: []
    };
  }
  
  const limited = cfps.slice(0, limit);
  let text = `🎤 **${limited.length} Open CFPs** (sorted by deadline)\n\n`;
  
  for (const cfp of limited) {
    const days = daysUntil(cfp.cfpEndDate);
    const urgency = days !== null && days <= 14 ? '🔥' : days !== null && days <= 30 ? '⏰' : '📅';
    
    text += `${urgency} **${cfp.name}**\n`;
    if (cfp.cfpEndDate) {
      text += `   Deadline: ${formatDate(cfp.cfpEndDate)} (${days} days)\n`;
    }
    if (cfp.location) text += `   📍 ${cfp.location}\n`;
    if (cfp.eventDate) text += `   Event: ${formatDate(cfp.eventDate)}\n`;
    text += `   [Submit CFP](${cfp.cfpUrl})\n\n`;
  }
  
  if (cfps.length > limit) {
    text += `\n_...and ${cfps.length - limit} more. Ask for more if you want the full list._`;
  }
  
  return { text, data: limited };
}

/**
 * Get curated conferences formatted for chat
 */
export async function getCurated(options = {}) {
  const conferences = getCuratedConferences(options);
  
  if (conferences.length === 0) {
    return {
      text: "No conferences match those filters.",
      data: []
    };
  }
  
  // Group by tier
  const tierA = conferences.filter(c => c.tier === 'A');
  const tierB = conferences.filter(c => c.tier === 'B');
  
  let text = `🎯 **Curated Conferences for Engineering Managers**\n\n`;
  
  if (tierA.length > 0) {
    text += `**⭐ Tier A - Premier Events**\n`;
    for (const conf of tierA) {
      text += `• **${conf.name}** - ${conf.description}\n`;
      text += `  Topics: ${conf.topics.join(', ')}\n`;
      text += `  [Website](${conf.url})`;
      if (conf.cfpUrl) text += ` | [CFP](${conf.cfpUrl})`;
      text += `\n\n`;
    }
  }
  
  if (tierB.length > 0) {
    text += `**📌 Tier B - Great Options**\n`;
    for (const conf of tierB) {
      text += `• **${conf.name}** - ${conf.description}\n`;
      text += `  [Website](${conf.url})`;
      if (conf.cfpUrl) text += ` | [CFP](${conf.cfpUrl})`;
      text += `\n\n`;
    }
  }
  
  return { text, data: conferences };
}

/**
 * Get upcoming conferences formatted for chat
 */
export async function getUpcoming(options = {}) {
  const limit = options.limit || 10;
  const upcoming = await getUpcomingConferences({ limit });
  
  if (upcoming.length === 0) {
    return {
      text: "No upcoming conferences found.",
      data: []
    };
  }
  
  let text = `📅 **${upcoming.length} Upcoming Conferences**\n\n`;
  
  for (const conf of upcoming) {
    text += `**${conf.name}** - ${formatDate(conf.startDate)}\n`;
    text += `📍 ${conf.city}, ${conf.country}${conf.online ? ' (+ Online)' : ''}\n`;
    text += `🏷️ ${conf.category}\n`;
    text += `[Website](${conf.url})`;
    if (conf.cfpUrl) {
      const days = daysUntil(conf.cfpEndDate);
      text += ` | [CFP](${conf.cfpUrl})${days ? ` (${days}d left)` : ''}`;
    }
    text += `\n\n`;
  }
  
  return { text, data: upcoming };
}

/**
 * Search events formatted for chat
 */
export async function search(query, options = {}) {
  const results = await searchEvents(query, options);
  const limit = options.limit || 10;
  
  if (results.length === 0) {
    return {
      text: `No events found for "${query}". Try different keywords.`,
      data: []
    };
  }
  
  const limited = results.slice(0, limit);
  let text = `🔍 **${results.length} results for "${query}"**\n\n`;
  
  for (const result of limited) {
    const icon = result.matchType === 'curated' ? '⭐' : 
                 result.matchType === 'conference' ? '📅' : '📝';
    
    text += `${icon} **${result.name}**\n`;
    if (result.description) {
      text += `   ${result.description.slice(0, 100)}...\n`;
    }
    if (result.city) text += `   📍 ${result.city}, ${result.country}\n`;
    if (result.url) text += `   [Link](${result.url})\n`;
    text += `\n`;
  }
  
  return { text, data: limited };
}

/**
 * Main skill handler - routes to appropriate function
 */
export async function handleSpeakerEvents(input, context = {}) {
  const inputLower = input.toLowerCase();
  
  // Detect intent
  if (inputLower.includes('cfp') || inputLower.includes('call for') || inputLower.includes('submit')) {
    return await getCFPs({ limit: context.limit || 10 });
  }
  
  if (inputLower.includes('curated') || inputLower.includes('best') || inputLower.includes('top') || inputLower.includes('recommend')) {
    const hasCfp = inputLower.includes('cfp') || inputLower.includes('open');
    const tierA = inputLower.includes('tier a') || inputLower.includes('premier') || inputLower.includes('best');
    return await getCurated({ 
      hasCfp, 
      tier: tierA ? 'A' : undefined 
    });
  }
  
  if (inputLower.includes('upcoming') || inputLower.includes('next') || inputLower.includes('soon')) {
    return await getUpcoming({ limit: context.limit || 10 });
  }
  
  if (inputLower.includes('search') || inputLower.includes('find')) {
    // Extract search query
    const query = input.replace(/search|find|for|events?|conferences?/gi, '').trim();
    if (query) {
      return await search(query);
    }
  }
  
  // Default: show CFPs (most actionable)
  return await getCFPs({ limit: 8 });
}

// Skill metadata for registration
export const skillMeta = {
  name: 'speaker-events',
  description: 'Find tech conferences and CFPs for engineering managers to speak at',
  triggers: [
    'speaking events',
    'conferences',
    'cfp',
    'call for papers',
    'where can i speak',
    'speaking opportunities',
    'tech events',
    'submit talk',
    'engineering conferences'
  ],
  examples: [
    'Show me open CFPs',
    'What are the best conferences for engineering managers?',
    'Find upcoming tech conferences',
    'Search conferences about leadership',
    'Where can I submit a talk?'
  ]
};

export default {
  handleSpeakerEvents,
  getCFPs,
  getCurated,
  getUpcoming,
  search,
  skillMeta
};
