/**
 * Twitter Scraper
 * Browser automation for Twitter search and scraping
 */

import { browserNavigate, browserGetPageContent } from './page-actions.js';

/**
 * Search Twitter for query and get page content
 */
async function browserSearchTwitter(query) {
  const url = `https://twitter.com/search?q=${encodeURIComponent(query)}&f=live`;
  await browserNavigate(url);
  // Wait for page to load
  await new Promise((r) => setTimeout(r, 3000));
  return browserGetPageContent();
}

export {
  browserSearchTwitter,
};