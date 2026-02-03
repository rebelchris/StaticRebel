/**
 * Curated list of conferences great for engineering managers
 * Updated manually with well-known events
 */

export const CURATED_CONFERENCES = [
  // Leadership & Management
  {
    name: 'LeadDev',
    url: 'https://leaddev.com',
    cfpUrl: 'https://leaddev.com/call-for-speakers',
    description: 'The premier conference for engineering leaders',
    locations: ['London', 'New York', 'Berlin', 'San Francisco'],
    topics: ['engineering leadership', 'team management', 'scaling teams'],
    tier: 'A'
  },
  {
    name: 'QCon',
    url: 'https://qconferences.com',
    cfpUrl: 'https://qconferences.com/speak',
    description: 'Software development conference for senior engineers',
    locations: ['London', 'San Francisco', 'New York', 'Plus'],
    topics: ['architecture', 'engineering culture', 'technical leadership'],
    tier: 'A'
  },
  {
    name: 'CTO Craft Con',
    url: 'https://ctocraft.com/conference',
    cfpUrl: null,
    description: 'Conference for CTOs and engineering leaders',
    locations: ['London', 'Online'],
    topics: ['CTO skills', 'scaling engineering', 'tech strategy'],
    tier: 'A'
  },
  {
    name: 'Engineering Leadership Summit',
    url: 'https://engingleadership.com',
    cfpUrl: null,
    description: 'Summit for VP/Directors of Engineering',
    locations: ['Various'],
    topics: ['engineering leadership', 'org design', 'hiring'],
    tier: 'A'
  },
  
  // Developer Experience & Culture
  {
    name: 'DevRelCon',
    url: 'https://devrelcon.dev',
    cfpUrl: 'https://devrelcon.dev/speak',
    description: 'Developer Relations conference',
    locations: ['Various'],
    topics: ['developer experience', 'community building', 'advocacy'],
    tier: 'B'
  },
  {
    name: 'DX Summit',
    url: 'https://dxsummit.io',
    cfpUrl: null,
    description: 'Developer Experience focused event',
    locations: ['Online'],
    topics: ['developer experience', 'tooling', 'productivity'],
    tier: 'B'
  },
  
  // General Tech (good for EM visibility)
  {
    name: 'NDC',
    url: 'https://ndcconferences.com',
    cfpUrl: 'https://ndcconferences.com/call-for-papers',
    description: 'Software developers conference',
    locations: ['Oslo', 'London', 'Sydney', 'Porto', 'Copenhagen'],
    topics: ['software development', 'architecture', 'DevOps'],
    tier: 'A'
  },
  {
    name: 'GOTO Conference',
    url: 'https://gotopia.tech',
    cfpUrl: null,
    description: 'Conference for developers and tech leaders',
    locations: ['Copenhagen', 'Amsterdam', 'Chicago', 'Aarhus'],
    topics: ['software trends', 'leadership', 'architecture'],
    tier: 'A'
  },
  {
    name: 'DevTernity',
    url: 'https://devternity.com',
    cfpUrl: null,
    description: 'Top-rated conference for developers',
    locations: ['Online'],
    topics: ['software craftsmanship', 'architecture', 'leadership'],
    tier: 'B'
  },
  
  // JavaScript/Web (if from that background)
  {
    name: 'JSConf',
    url: 'https://jsconf.com',
    cfpUrl: null,
    description: 'JavaScript conference series',
    locations: ['Various worldwide'],
    topics: ['javascript', 'web development', 'community'],
    tier: 'A'
  },
  {
    name: 'React Summit',
    url: 'https://reactsummit.com',
    cfpUrl: 'https://reactsummit.com/call-for-papers',
    description: 'Largest React conference',
    locations: ['Amsterdam', 'Online'],
    topics: ['React', 'frontend', 'web development'],
    tier: 'B'
  },
  {
    name: 'Node Congress',
    url: 'https://nodecongress.com',
    cfpUrl: 'https://nodecongress.com/call-for-papers',
    description: 'Node.js focused conference',
    locations: ['Berlin', 'Online'],
    topics: ['Node.js', 'backend', 'JavaScript'],
    tier: 'B'
  },
  
  // DevOps & Platform
  {
    name: 'KubeCon',
    url: 'https://events.linuxfoundation.org/kubecon-cloudnativecon-europe/',
    cfpUrl: null,
    description: 'Kubernetes and cloud native conference',
    locations: ['Europe', 'North America', 'China'],
    topics: ['Kubernetes', 'cloud native', 'infrastructure'],
    tier: 'A'
  },
  {
    name: 'DevOpsDays',
    url: 'https://devopsdays.org',
    cfpUrl: 'https://devopsdays.org/organizing',
    description: 'Community DevOps conferences worldwide',
    locations: ['50+ cities worldwide'],
    topics: ['DevOps', 'culture', 'automation'],
    tier: 'B'
  },
  {
    name: 'Platform Engineering',
    url: 'https://platformcon.com',
    cfpUrl: null,
    description: 'Platform engineering focused event',
    locations: ['Online'],
    topics: ['platform engineering', 'internal developer platforms', 'DevEx'],
    tier: 'B'
  },
  
  // Europe-specific (since you're in Cape Town, closer timezone)
  {
    name: 'WeAreDevelopers World Congress',
    url: 'https://www.wearedevelopers.com/world-congress',
    cfpUrl: null,
    description: 'Europe\'s largest developer conference',
    locations: ['Berlin'],
    topics: ['software development', 'tech trends', 'career'],
    tier: 'A'
  },
  {
    name: 'Devoxx',
    url: 'https://devoxx.com',
    cfpUrl: null,
    description: 'Developer conference series',
    locations: ['Belgium', 'UK', 'France', 'Morocco'],
    topics: ['Java', 'development', 'methodology'],
    tier: 'B'
  }
];

/**
 * Get curated conferences, optionally filtered
 */
export function getCuratedConferences(filters = {}) {
  let conferences = [...CURATED_CONFERENCES];
  
  if (filters.tier) {
    conferences = conferences.filter(c => c.tier === filters.tier);
  }
  
  if (filters.topic) {
    const topic = filters.topic.toLowerCase();
    conferences = conferences.filter(c => 
      c.topics.some(t => t.toLowerCase().includes(topic))
    );
  }
  
  if (filters.hasCfp) {
    conferences = conferences.filter(c => c.cfpUrl);
  }
  
  return conferences.map(c => ({
    source: 'curated',
    ...c
  }));
}

export default { CURATED_CONFERENCES, getCuratedConferences };
