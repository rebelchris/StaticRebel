/**
 * Fuzzy Matching Module
 * 
 * Handles typo tolerance for commands, skill names, and entity matching.
 * Uses Levenshtein distance with optimizations for common typo patterns.
 * 
 * @module lib/input/fuzzy
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio (0-1) between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity ratio (1 = identical, 0 = completely different)
 */
export function similarity(a, b) {
  if (!a || !b) return 0;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  
  if (aLower === bLower) return 1;
  
  const maxLen = Math.max(aLower.length, bLower.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(aLower, bLower);
  return 1 - (distance / maxLen);
}

/**
 * Common typo patterns for keyboard adjacency
 */
const KEYBOARD_ADJACENCY = {
  'q': ['w', 'a', '1', '2'],
  'w': ['q', 'e', 'a', 's', '2', '3'],
  'e': ['w', 'r', 's', 'd', '3', '4'],
  'r': ['e', 't', 'd', 'f', '4', '5'],
  't': ['r', 'y', 'f', 'g', '5', '6'],
  'y': ['t', 'u', 'g', 'h', '6', '7'],
  'u': ['y', 'i', 'h', 'j', '7', '8'],
  'i': ['u', 'o', 'j', 'k', '8', '9'],
  'o': ['i', 'p', 'k', 'l', '9', '0'],
  'p': ['o', 'l', '0', '-'],
  'a': ['q', 'w', 's', 'z'],
  's': ['a', 'w', 'e', 'd', 'z', 'x'],
  'd': ['s', 'e', 'r', 'f', 'x', 'c'],
  'f': ['d', 'r', 't', 'g', 'c', 'v'],
  'g': ['f', 't', 'y', 'h', 'v', 'b'],
  'h': ['g', 'y', 'u', 'j', 'b', 'n'],
  'j': ['h', 'u', 'i', 'k', 'n', 'm'],
  'k': ['j', 'i', 'o', 'l', 'm'],
  'l': ['k', 'o', 'p'],
  'z': ['a', 's', 'x'],
  'x': ['z', 's', 'd', 'c'],
  'c': ['x', 'd', 'f', 'v'],
  'v': ['c', 'f', 'g', 'b'],
  'b': ['v', 'g', 'h', 'n'],
  'n': ['b', 'h', 'j', 'm'],
  'm': ['n', 'j', 'k'],
};

/**
 * Check if two characters are keyboard-adjacent (likely typo)
 * @param {string} a - First character
 * @param {string} b - Second character
 * @returns {boolean}
 */
export function areKeyboardAdjacent(a, b) {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  return KEYBOARD_ADJACENCY[aLower]?.includes(bLower) || 
         KEYBOARD_ADJACENCY[bLower]?.includes(aLower);
}

/**
 * Calculate typo-aware similarity (boosts score for keyboard-adjacent errors)
 * @param {string} a - First string
 * @param {string} b - Second string  
 * @returns {number} Adjusted similarity (0-1)
 */
export function typoAwareSimilarity(a, b) {
  if (!a || !b) return 0;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  
  if (aLower === bLower) return 1;
  
  // Start with base similarity
  let baseSim = similarity(aLower, bLower);
  
  // Boost for keyboard-adjacent single-char differences
  if (Math.abs(aLower.length - bLower.length) <= 1) {
    const shorter = aLower.length < bLower.length ? aLower : bLower;
    const longer = aLower.length >= bLower.length ? aLower : bLower;
    
    let adjacentTypos = 0;
    let differences = 0;
    
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) {
        differences++;
        if (areKeyboardAdjacent(shorter[i], longer[i])) {
          adjacentTypos++;
        }
      }
    }
    
    // Boost similarity for keyboard-adjacent typos
    if (adjacentTypos > 0 && differences <= 2) {
      baseSim = Math.min(1, baseSim + (0.1 * adjacentTypos));
    }
  }
  
  // Boost for transposed characters (common typo)
  if (aLower.length === bLower.length && aLower.length >= 2) {
    for (let i = 0; i < aLower.length - 1; i++) {
      // Check if swapping adjacent chars makes them equal
      const swapped = aLower.slice(0, i) + aLower[i + 1] + aLower[i] + aLower.slice(i + 2);
      if (swapped === bLower) {
        baseSim = Math.max(baseSim, 0.95); // Transposition is a very common typo
        break;
      }
    }
  }
  
  return baseSim;
}

/**
 * Find best fuzzy matches from a list of candidates
 * @param {string} input - Input string to match
 * @param {string[]} candidates - List of possible matches
 * @param {Object} options - Match options
 * @param {number} [options.threshold=0.6] - Minimum similarity threshold
 * @param {number} [options.maxResults=5] - Maximum results to return
 * @param {boolean} [options.typoAware=true] - Use typo-aware matching
 * @returns {Array<{match: string, similarity: number}>} Sorted matches
 */
export function fuzzyMatch(input, candidates, options = {}) {
  const {
    threshold = 0.6,
    maxResults = 5,
    typoAware = true,
  } = options;
  
  if (!input || !candidates?.length) return [];
  
  const inputLower = input.toLowerCase().trim();
  const similarityFn = typoAware ? typoAwareSimilarity : similarity;
  
  const matches = candidates
    .map(candidate => ({
      match: candidate,
      similarity: similarityFn(inputLower, candidate.toLowerCase()),
    }))
    .filter(m => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
  
  return matches;
}

/**
 * Find best match for a command (with aliases)
 * @param {string} input - User input (e.g., "/remidner" with typo)
 * @param {Map<string, Object>} commands - Command registry
 * @returns {{command: Object, similarity: number, matchedAlias: string} | null}
 */
export function fuzzyMatchCommand(input, commands) {
  if (!input) return null;
  
  const inputClean = input.replace(/^\//, '').toLowerCase().trim();
  let bestMatch = null;
  let bestSimilarity = 0;
  let matchedAlias = null;
  
  for (const [key, command] of commands) {
    // Check main key
    const keySim = typoAwareSimilarity(inputClean, key);
    if (keySim > bestSimilarity) {
      bestSimilarity = keySim;
      bestMatch = command;
      matchedAlias = key;
    }
    
    // Check aliases
    const aliases = command.textAliases || [];
    for (const alias of aliases) {
      const aliasClean = alias.replace(/^\//, '').toLowerCase();
      const aliasSim = typoAwareSimilarity(inputClean, aliasClean);
      if (aliasSim > bestSimilarity) {
        bestSimilarity = aliasSim;
        bestMatch = command;
        matchedAlias = alias;
      }
    }
    
    // Check native name
    if (command.nativeName) {
      const nativeSim = typoAwareSimilarity(inputClean, command.nativeName.toLowerCase());
      if (nativeSim > bestSimilarity) {
        bestSimilarity = nativeSim;
        bestMatch = command;
        matchedAlias = command.nativeName;
      }
    }
  }
  
  // Only return if above threshold
  if (bestSimilarity >= 0.7) {
    return {
      command: bestMatch,
      similarity: bestSimilarity,
      matchedAlias,
      wasExact: bestSimilarity === 1,
    };
  }
  
  return null;
}

/**
 * Suggest corrections for a typo
 * @param {string} input - User input with potential typo
 * @param {string[]} dictionary - Valid terms
 * @param {number} [maxSuggestions=3] - Max suggestions to return
 * @returns {string[]} Suggested corrections
 */
export function suggestCorrections(input, dictionary, maxSuggestions = 3) {
  const matches = fuzzyMatch(input, dictionary, {
    threshold: 0.5,
    maxResults: maxSuggestions,
    typoAware: true,
  });
  
  return matches.map(m => m.match);
}

/**
 * Check if input is likely a typo of any candidate
 * @param {string} input - Input to check
 * @param {string[]} candidates - Valid candidates
 * @returns {{isTypo: boolean, bestMatch: string | null, similarity: number}}
 */
export function detectTypo(input, candidates) {
  const matches = fuzzyMatch(input, candidates, {
    threshold: 0.7,
    maxResults: 1,
    typoAware: true,
  });
  
  if (matches.length > 0 && matches[0].similarity < 1) {
    return {
      isTypo: true,
      bestMatch: matches[0].match,
      similarity: matches[0].similarity,
    };
  }
  
  return {
    isTypo: false,
    bestMatch: matches[0]?.match || null,
    similarity: matches[0]?.similarity || 0,
  };
}

export default {
  levenshteinDistance,
  similarity,
  typoAwareSimilarity,
  fuzzyMatch,
  fuzzyMatchCommand,
  suggestCorrections,
  detectTypo,
  areKeyboardAdjacent,
};
