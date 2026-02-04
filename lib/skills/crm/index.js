/**
 * CRM Skill - Proactive Contact Relationship Management
 *
 * Key design principle: BE PROACTIVE
 * When user mentions an interaction with someone, log it immediately.
 * No confirmation needed. Just do it.
 *
 * Examples that auto-trigger:
 * - "I had a chat with Bren today"
 * - "Met Sarah for coffee yesterday"
 * - "Called John about the project"
 * - "Had a 1:1 with Alex this morning"
 */

import { getStore } from './store.js';
import {
  detectContactInteraction,
  extractNotes,
  isExplicitCRMQuery,
  detectFollowUpIntent,
} from './patterns.js';

// Minimum confidence to auto-log an interaction
const AUTO_LOG_THRESHOLD = 0.65;

/**
 * Process input and auto-detect contact interactions
 * This is the main entry point for proactive CRM
 *
 * @param {string} input - User input
 * @param {object} context - Chat context
 * @returns {object|null} - Result if CRM action taken, null otherwise
 */
export async function processInput(input, context = {}) {
  // First check if this is an explicit CRM query
  if (isExplicitCRMQuery(input)) {
    return await handleExplicitQuery(input, context);
  }

  // Check for follow-up intent
  const followUp = detectFollowUpIntent(input);
  if (followUp) {
    return await handleFollowUp(followUp, input, context);
  }

  // Try to detect a contact interaction mention
  const detection = detectContactInteraction(input);

  if (detection && detection.confidence >= AUTO_LOG_THRESHOLD) {
    return await autoLogInteraction(detection, context);
  }

  // No CRM action needed
  return null;
}

/**
 * Auto-log a detected interaction
 * This is the proactive part - just do it, no confirmation
 *
 * @param {object} detection - Detected interaction info
 * @param {object} context - Chat context
 * @returns {object} - Result with logged interaction
 */
async function autoLogInteraction(detection, context = {}) {
  const store = await getStore();

  // Get or create the contact (auto-create if new)
  const contact = await store.getOrCreateContact(detection.name, {
    source: 'auto-detected',
  });

  const isNewContact = contact.autoCreated && store.getInteractions(contact.id).length === 0;

  // Extract notes from the original input
  const notes = extractNotes(detection.originalInput, detection.name);

  // Log the interaction
  const interaction = await store.logInteraction(contact.id, {
    type: detection.type,
    description: formatInteractionDescription(detection),
    notes: notes,
    date: detection.timeRef.date,
    timestamp: detection.timeRef.timestamp,
    source: context.source || 'chat',
    autoLogged: true,
    originalInput: detection.originalInput,
  });

  // Build response message
  const response = buildAutoLogResponse(contact, interaction, isNewContact);

  return {
    success: true,
    type: 'crm_auto_log',
    message: response,
    data: {
      contact,
      interaction,
      isNewContact,
      detection,
    },
  };
}

/**
 * Format interaction description
 * @param {object} detection - Detection info
 * @returns {string}
 */
function formatInteractionDescription(detection) {
  const typeLabels = {
    meeting: 'Meeting',
    call: 'Call',
    chat: 'Chat',
    coffee: 'Coffee',
    lunch: 'Lunch',
    dinner: 'Dinner',
    email: 'Email',
    text: 'Text',
    message: 'Message',
    video_call: 'Video call',
    one_on_one: '1:1',
    catchup: 'Catch-up',
    hangout: 'Hangout',
    interview: 'Interview',
    encounter: 'Ran into',
  };

  const label = typeLabels[detection.type] || detection.type;
  return `${label} with ${detection.name}`;
}

/**
 * Build auto-log response message
 * @param {object} contact - Contact
 * @param {object} interaction - Logged interaction
 * @param {boolean} isNew - Is this a new contact?
 * @returns {string}
 */
function buildAutoLogResponse(contact, interaction, isNew) {
  const interactionLabel = formatInteractionType(interaction.type);

  if (isNew) {
    return `Logged ${interactionLabel} with **${contact.name}** (new contact added)`;
  }

  return `Logged ${interactionLabel} with **${contact.name}**`;
}

/**
 * Format interaction type for display
 * @param {string} type - Interaction type
 * @returns {string}
 */
function formatInteractionType(type) {
  const labels = {
    meeting: 'meeting',
    call: 'call',
    chat: 'chat',
    coffee: 'coffee',
    lunch: 'lunch',
    dinner: 'dinner',
    email: 'email',
    text: 'text',
    message: 'message',
    video_call: 'video call',
    one_on_one: '1:1',
    catchup: 'catch-up',
    hangout: 'hangout',
    interview: 'interview',
    encounter: 'encounter',
  };
  return labels[type] || type;
}

/**
 * Handle follow-up intent
 * @param {object} followUp - Follow-up detection
 * @param {string} input - Original input
 * @param {object} context - Context
 * @returns {object}
 */
async function handleFollowUp(followUp, input, context) {
  const store = await getStore();
  const contact = await store.getOrCreateContact(followUp.name);

  // Set a reminder for 3 days from now by default
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + 3);

  const reminder = await store.setReminder(contact.id, {
    date: reminderDate.toISOString().split('T')[0],
    note: `Follow up with ${contact.name}`,
  });

  return {
    success: true,
    type: 'crm_follow_up',
    message: `Set reminder to follow up with **${contact.name}** in 3 days`,
    data: { contact, reminder },
  };
}

/**
 * Handle explicit CRM queries
 * @param {string} input - User input
 * @param {object} context - Context
 * @returns {object}
 */
async function handleExplicitQuery(input, context) {
  const store = await getStore();
  const lower = input.toLowerCase();

  // List all contacts
  if (/^(show|list|get|display) (my )?(contacts|people|network)/i.test(lower)) {
    const contacts = store.getAllContacts();
    if (contacts.length === 0) {
      return {
        success: true,
        type: 'crm_list',
        message: "No contacts yet. Just mention someone you've talked to and I'll start tracking!",
        data: { contacts: [] },
      };
    }

    const lines = contacts.slice(0, 15).map(c => {
      const lastInt = c.lastInteraction
        ? ` (last: ${formatRelativeDate(c.lastInteraction.date)})`
        : '';
      return `- **${c.name}**${c.company ? ` @ ${c.company}` : ''}${lastInt}`;
    });

    const msg = `**Your Contacts (${contacts.length})**\n\n${lines.join('\n')}`;
    return {
      success: true,
      type: 'crm_list',
      message: msg + (contacts.length > 15 ? `\n\n_...and ${contacts.length - 15} more_` : ''),
      data: { contacts },
    };
  }

  // Recent interactions
  if (/recent interactions|who (have i|did i) (met|talked|spoken)/i.test(lower)) {
    const interactions = store.getRecentInteractions(14, 10);
    if (interactions.length === 0) {
      return {
        success: true,
        type: 'crm_interactions',
        message: "No recent interactions logged. Just tell me about someone you met and I'll track it!",
        data: { interactions: [] },
      };
    }

    const lines = interactions.map(i => {
      const date = formatRelativeDate(i.date);
      return `- ${date}: ${i.description}`;
    });

    return {
      success: true,
      type: 'crm_interactions',
      message: `**Recent Interactions**\n\n${lines.join('\n')}`,
      data: { interactions },
    };
  }

  // Search contacts
  const searchMatch = lower.match(/(search|find) (contacts?|person|people)?\s*(.+)?/i);
  if (searchMatch && searchMatch[3]) {
    const query = searchMatch[3].trim();
    const results = store.searchContacts(query);

    if (results.length === 0) {
      return {
        success: true,
        type: 'crm_search',
        message: `No contacts found matching "${query}"`,
        data: { results: [], query },
      };
    }

    const lines = results.map(c => `- **${c.name}**${c.company ? ` @ ${c.company}` : ''}`);
    return {
      success: true,
      type: 'crm_search',
      message: `**Found ${results.length} contact(s) matching "${query}"**\n\n${lines.join('\n')}`,
      data: { results, query },
    };
  }

  // Show interactions for a specific person
  const showMatch = lower.match(/show (?:me )?(.+?)(?:'s)? interactions/i);
  if (showMatch) {
    const name = showMatch[1].trim();
    const contact = store.findContactByName(name);

    if (!contact) {
      return {
        success: true,
        type: 'crm_contact_interactions',
        message: `No contact found named "${name}"`,
        data: { contact: null },
      };
    }

    const interactions = store.getInteractions(contact.id);
    if (interactions.length === 0) {
      return {
        success: true,
        type: 'crm_contact_interactions',
        message: `No interactions logged with **${contact.name}** yet`,
        data: { contact, interactions: [] },
      };
    }

    const lines = interactions.slice(0, 10).map(i => {
      const date = formatRelativeDate(i.date);
      return `- ${date}: ${formatInteractionType(i.type)}${i.notes ? ` - ${i.notes}` : ''}`;
    });

    return {
      success: true,
      type: 'crm_contact_interactions',
      message: `**Interactions with ${contact.name}**\n\n${lines.join('\n')}`,
      data: { contact, interactions },
    };
  }

  // Due reminders / follow-ups
  if (/follow[ -]?ups?|due|reminders/i.test(lower)) {
    const reminders = store.getDueReminders();
    const all = [...reminders.overdue, ...reminders.today, ...reminders.upcoming];

    if (all.length === 0) {
      return {
        success: true,
        type: 'crm_reminders',
        message: "No pending follow-ups. You're all caught up!",
        data: { reminders },
      };
    }

    const lines = [];
    if (reminders.overdue.length > 0) {
      lines.push('**Overdue:**');
      reminders.overdue.forEach(r => lines.push(`- ${r.contactName}: ${r.note}`));
    }
    if (reminders.today.length > 0) {
      lines.push('**Today:**');
      reminders.today.forEach(r => lines.push(`- ${r.contactName}: ${r.note}`));
    }
    if (reminders.upcoming.length > 0) {
      lines.push('**Upcoming:**');
      reminders.upcoming.slice(0, 5).forEach(r =>
        lines.push(`- ${formatRelativeDate(r.date)}: ${r.contactName}`)
      );
    }

    return {
      success: true,
      type: 'crm_reminders',
      message: `**Follow-ups**\n\n${lines.join('\n')}`,
      data: { reminders },
    };
  }

  // CRM stats
  if (/crm stats|contact stats|network stats/i.test(lower)) {
    const stats = store.getStats();
    return {
      success: true,
      type: 'crm_stats',
      message:
        `**CRM Stats**\n\n` +
        `Contacts: ${stats.totalContacts} (${stats.autoCreatedContacts} auto-created)\n` +
        `Interactions: ${stats.totalInteractions} (${stats.interactionsLastWeek} this week)\n` +
        `Auto-logged: ${stats.autoLoggedInteractions}\n` +
        `Pending follow-ups: ${stats.pendingReminders}`,
      data: { stats },
    };
  }

  // Contacts needing attention
  if (/need(s|ing)? attention|haven't (talked|spoken|contacted)/i.test(lower)) {
    const contacts = store.getContactsNeedingAttention(30);

    if (contacts.length === 0) {
      return {
        success: true,
        type: 'crm_attention',
        message: "All contacts have been reached recently. Nice work!",
        data: { contacts: [] },
      };
    }

    const lines = contacts.slice(0, 10).map(c => {
      if (c.daysSinceContact === null) {
        return `- **${c.name}** - never contacted`;
      }
      return `- **${c.name}** - ${c.daysSinceContact} days ago`;
    });

    return {
      success: true,
      type: 'crm_attention',
      message: `**Contacts Needing Attention**\n\n${lines.join('\n')}`,
      data: { contacts },
    };
  }

  // Default: show summary
  const stats = store.getStats();
  const recent = store.getRecentInteractions(7, 3);
  const reminders = store.getDueReminders();

  let msg = `**CRM Summary**\n\n`;
  msg += `${stats.totalContacts} contacts, ${stats.interactionsLastWeek} interactions this week\n\n`;

  if (recent.length > 0) {
    msg += `**Recent:**\n`;
    recent.forEach(i => {
      msg += `- ${formatRelativeDate(i.date)}: ${i.description}\n`;
    });
    msg += '\n';
  }

  if (reminders.overdue.length > 0 || reminders.today.length > 0) {
    msg += `**Due:** ${reminders.overdue.length} overdue, ${reminders.today.length} today\n`;
  }

  return {
    success: true,
    type: 'crm_summary',
    message: msg,
    data: { stats, recent, reminders },
  };
}

/**
 * Format date as relative (today, yesterday, X days ago)
 * @param {string} dateStr - Date string
 * @returns {string}
 */
function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return 'last week';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// Skill Metadata
// ============================================================================

export const skillMeta = {
  name: 'crm',
  description: 'Proactive contact relationship management - auto-logs interactions when you mention people',
  triggers: [
    // Auto-trigger patterns (interactions)
    'met with',
    'had coffee',
    'called',
    'chatted with',
    'talked to',
    'spoke with',
    'had a chat',
    'had a call',
    'had a meeting',
    'had a 1:1',
    'grabbed lunch',
    'caught up with',
    // Explicit triggers
    'show contacts',
    'list contacts',
    'recent interactions',
    'crm',
    'follow up',
    'who have i met',
  ],
  examples: [
    'I had coffee with Sarah today',
    'Met John for lunch yesterday',
    'Called Mike about the project',
    'Show my contacts',
    'Recent interactions',
    'Who have I talked to recently?',
  ],
  autoTrigger: true, // This skill auto-triggers on pattern match
};

// ============================================================================
// Exports
// ============================================================================

export {
  getStore,
  detectContactInteraction,
  isExplicitCRMQuery,
  AUTO_LOG_THRESHOLD,
};

export default {
  processInput,
  skillMeta,
  getStore,
  detectContactInteraction,
  isExplicitCRMQuery,
};
