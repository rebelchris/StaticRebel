/**
 * Reply Coalescer
 * 
 * Batches multiple small replies into single messages to reduce API calls
 * and provide a better user experience. Handles text buffering with configurable
 * thresholds and automatic flushing.
 * 
 * @module lib/output/coalescer
 */

/**
 * @typedef {Object} CoalescerConfig
 * @property {number} [minChars=20] - Minimum characters before considering flush
 * @property {number} [maxChars=2000] - Maximum characters before forced flush
 * @property {number} [idleMs=500] - Milliseconds of idle time before flush
 * @property {Function} onFlush - Callback when buffer is flushed
 * @property {Function} [onMedia] - Callback for media items (bypasses buffer)
 * @property {string} [separator='\n'] - Separator between coalesced messages
 */

/**
 * @typedef {Object} MediaItem
 * @property {'image'|'audio'|'video'|'file'} type - Media type
 * @property {string|Buffer} data - Media data or path
 * @property {string} [caption] - Optional caption
 * @property {Object} [options] - Additional options
 */

/**
 * Create a reply coalescer instance
 * @param {CoalescerConfig} config - Configuration options
 * @returns {Object} Coalescer instance
 */
export function createReplyCoalescer(config) {
  const {
    minChars = 20,
    maxChars = 2000,
    idleMs = 500,
    onFlush,
    onMedia,
    separator = '\n',
  } = config;
  
  if (typeof onFlush !== 'function') {
    throw new Error('onFlush callback is required');
  }
  
  /** @type {string[]} */
  let textBuffer = [];
  
  /** @type {MediaItem[]} */
  let mediaQueue = [];
  
  /** @type {NodeJS.Timeout|null} */
  let idleTimer = null;
  
  /** @type {boolean} */
  let isFlushing = false;
  
  /** @type {number} */
  let currentLength = 0;
  
  /**
   * Get current buffer content
   * @returns {string}
   */
  function getBufferContent() {
    return textBuffer.join(separator);
  }
  
  /**
   * Clear the idle timer
   */
  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }
  
  /**
   * Schedule an idle flush
   */
  function scheduleIdleFlush() {
    clearIdleTimer();
    
    if (currentLength >= minChars) {
      idleTimer = setTimeout(() => {
        flush();
      }, idleMs);
    }
  }
  
  /**
   * Flush the text buffer
   * @returns {Promise<boolean>} Whether flush occurred
   */
  async function flush() {
    clearIdleTimer();
    
    if (isFlushing || textBuffer.length === 0) {
      return false;
    }
    
    isFlushing = true;
    
    try {
      const content = getBufferContent();
      textBuffer = [];
      currentLength = 0;
      
      await onFlush(content);
      
      // Process any queued media after text
      await processMediaQueue();
      
      return true;
    } finally {
      isFlushing = false;
    }
  }
  
  /**
   * Process queued media items
   */
  async function processMediaQueue() {
    if (mediaQueue.length === 0 || !onMedia) {
      return;
    }
    
    const queue = mediaQueue;
    mediaQueue = [];
    
    for (const media of queue) {
      try {
        await onMedia(media);
      } catch (error) {
        console.error('[Coalescer] Media flush error:', error.message);
      }
    }
  }
  
  /**
   * Enqueue text for coalescing
   * @param {string} text - Text to enqueue
   * @returns {Promise<void>}
   */
  async function enqueue(text) {
    if (!text || typeof text !== 'string') {
      return;
    }
    
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    
    // Check if adding this would exceed max
    const newLength = currentLength + (currentLength > 0 ? separator.length : 0) + trimmed.length;
    
    if (newLength > maxChars && textBuffer.length > 0) {
      // Flush current buffer first
      await flush();
    }
    
    // If the new text alone exceeds max, send it directly
    if (trimmed.length > maxChars) {
      // Split into chunks
      const chunks = splitIntoChunks(trimmed, maxChars);
      for (const chunk of chunks) {
        textBuffer.push(chunk);
        currentLength = chunk.length;
        await flush();
      }
      return;
    }
    
    // Add to buffer
    textBuffer.push(trimmed);
    currentLength = currentLength + (currentLength > 0 ? separator.length : 0) + trimmed.length;
    
    // Check if we should flush immediately
    if (currentLength >= maxChars) {
      await flush();
    } else {
      // Schedule idle flush
      scheduleIdleFlush();
    }
  }
  
  /**
   * Enqueue media (bypasses text buffer)
   * @param {MediaItem} media - Media item to send
   * @returns {Promise<void>}
   */
  async function enqueueMedia(media) {
    if (!onMedia) {
      console.warn('[Coalescer] Media enqueued but no onMedia handler');
      return;
    }
    
    // If there's pending text, flush it first
    if (textBuffer.length > 0) {
      await flush();
    }
    
    // Send media immediately or queue if flushing
    if (isFlushing) {
      mediaQueue.push(media);
    } else {
      await onMedia(media);
    }
  }
  
  /**
   * Force flush and close the coalescer
   * @returns {Promise<void>}
   */
  async function close() {
    clearIdleTimer();
    await flush();
    await processMediaQueue();
  }
  
  /**
   * Get current buffer stats
   * @returns {Object}
   */
  function getStats() {
    return {
      bufferedChunks: textBuffer.length,
      bufferedLength: currentLength,
      queuedMedia: mediaQueue.length,
      isFlushing,
    };
  }
  
  /**
   * Check if buffer has content
   * @returns {boolean}
   */
  function hasContent() {
    return textBuffer.length > 0 || mediaQueue.length > 0;
  }
  
  /**
   * Clear buffer without flushing
   */
  function clear() {
    clearIdleTimer();
    textBuffer = [];
    mediaQueue = [];
    currentLength = 0;
  }
  
  return {
    enqueue,
    enqueueMedia,
    flush,
    close,
    getStats,
    hasContent,
    clear,
  };
}

/**
 * Split text into chunks at word boundaries
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum chunk length
 * @returns {string[]} Array of chunks
 */
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > maxLength) {
    // Find last space before maxLength
    let splitIndex = remaining.lastIndexOf(' ', maxLength);
    
    // If no space found, force split at maxLength
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }
    
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }
  
  if (remaining) {
    chunks.push(remaining);
  }
  
  return chunks;
}

/**
 * Create a simple debounced sender (simpler API for common use case)
 * @param {Function} sendFn - Function to call with batched message
 * @param {Object} options - Options
 * @param {number} [options.delay=500] - Debounce delay in ms
 * @param {number} [options.maxChars=2000] - Max characters per message
 * @returns {Function} Debounced send function
 */
export function createDebouncedSender(sendFn, options = {}) {
  const { delay = 500, maxChars = 2000 } = options;
  
  const coalescer = createReplyCoalescer({
    maxChars,
    idleMs: delay,
    onFlush: sendFn,
  });
  
  return (text) => coalescer.enqueue(text);
}

/**
 * Wrap an existing reply function with coalescing
 * @param {Function} replyFn - Original reply function
 * @param {Object} options - Coalescer options
 * @returns {Object} Wrapped reply object
 */
export function wrapWithCoalescing(replyFn, options = {}) {
  const coalescer = createReplyCoalescer({
    ...options,
    onFlush: replyFn,
  });
  
  return {
    reply: (text) => coalescer.enqueue(text),
    replyMedia: (media) => coalescer.enqueueMedia(media),
    flush: () => coalescer.flush(),
    end: () => coalescer.close(),
    stats: () => coalescer.getStats(),
  };
}

export default {
  createReplyCoalescer,
  createDebouncedSender,
  wrapWithCoalescing,
};
