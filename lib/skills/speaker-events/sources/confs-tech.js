/**
 * Fetch conferences from confs.tech
 * https://confs.tech - Open source list of tech conferences
 */

const CONFS_TECH_API = 'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences';

// Categories relevant to engineering managers
const RELEVANT_CATEGORIES = [
  'javascript',
  'typescript', 
  'devops',
  'general',
  'leadership',
  'agile',
  'product'
];

/**
 * Fetch conferences for a given year
 */
export async function fetchConfsTech(year = new Date().getFullYear()) {
  const conferences = [];
  
  for (const category of RELEVANT_CATEGORIES) {
    try {
      const url = `${CONFS_TECH_API}/${year}/${category}.json`;
      const response = await fetch(url);
      
      if (!response.ok) continue;
      
      const data = await response.json();
      
      for (const conf of data) {
        conferences.push({
          source: 'confs.tech',
          name: conf.name,
          url: conf.url,
          city: conf.city,
          country: conf.country,
          startDate: conf.startDate,
          endDate: conf.endDate,
          cfpUrl: conf.cfpUrl || null,
          cfpEndDate: conf.cfpEndDate || null,
          twitter: conf.twitter || null,
          category,
          online: conf.online || false
        });
      }
    } catch (err) {
      // Skip failed categories
    }
  }
  
  return conferences;
}

export default { fetchConfsTech };
