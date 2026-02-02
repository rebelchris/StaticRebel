/**
 * CRM Action
 * Personal Relationship Management - Contacts, Interactions, and Reminders
 */

export default {
  name: 'crm',
  displayName: 'Contact Manager',
  description: 'Manage contacts, log interactions, and set follow-up reminders',
  category: 'utility',
  version: '1.0.0',
  versionDate: '2026-02-02',

  intentExamples: [
    'add a contact',
    'new contact',
    'list my contacts',
    'show contacts',
    'search contacts',
    'find contact',
    'log interaction',
    'set reminder',
    'due reminders',
    'follow up with',
    'crm',
    'contact management',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['list', 'add', 'search', 'log', 'reminder', 'stats'],
      description: 'CRM action to perform',
    },
  },

  dependencies: [],

  async handler(input, context, params) {
    // Dynamic import to avoid circular dependencies
    const { getCRM } = await import('../../lib/skills/crm.js');
    const crm = await getCRM();

    const lower = input.toLowerCase();

    // List contacts
    if (/list (my )?contacts/i.test(lower) || /show contacts/i.test(lower)) {
      const contacts = crm.getAllContacts();
      if (contacts.length === 0) {
        return 'You don\'t have any contacts yet. Say "add contact: John, email: john@example.com" to add your first contact!';
      }
      const list = contacts.map(c => {
        const info = [c.name];
        if (c.company) info.push(`@ ${c.company}`);
        if (c.tags?.length) info.push(`[${c.tags.join(', ')}]`);
        if (c.interactionCount) info.push(`(${c.interactionCount} interactions)`);
        return `- ${info.join(' ')}`;
      }).join('\n');
      return `**Your Contacts** (${contacts.length}):\n\n${list}`;
    }

    // Add contact
    if (/add (a )?contact/i.test(lower) || /new contact/i.test(lower)) {
      // Try multiple patterns for extracting contact info
      const nameMatch = input.match(/add (?:a )?contact[:\s]+([A-Za-z\s]+)/i) ||
                        input.match(/contact[:\s]+([A-Za-z\s]+)/i) ||
                        input.match(/new contact[:\s]+([A-Za-z\s]+)/i) ||
                        input.match(/add ([A-Za-z]+)/i);
      const emailMatch = input.match(/email[:\s]+([^\s,]+)/i);
      const phoneMatch = input.match(/phone[:\s]+([^\s,]+)/i);
      const companyMatch = input.match(/company[:\s]+([^,\n]+)/i);
      const tagsMatch = input.match(/tags?[:\s]+([^\n]+)/i);

      if (nameMatch) {
        const name = nameMatch[1].trim();
        const tags = tagsMatch?.[1]?.split(/[,;]/).map(t => t.trim()).filter(t => t) || [];
        const contact = await crm.addContact({
          name,
          email: emailMatch?.[1],
          phone: phoneMatch?.[1],
          company: companyMatch?.[1],
          source: 'manual',
          tags
        });
        return `Added contact: **${contact.name}**\n${contact.email ? `Email: ${contact.email}` : ''}${contact.company ? `\nCompany: ${contact.company}` : ''}${contact.tags?.length ? `\nTags: ${contact.tags.join(', ')}` : ''}`;
      }
      return 'To add a contact, say something like: "Add contact: John Smith, email: john@example.com, company: Acme"';
    }

    // Search contacts
    if (/search (my )?contacts/i.test(lower) || /find contact/i.test(lower)) {
      const queryMatch = input.match(/(?:search|find) (?:my )?contacts? (?:for )?(.+)/i) ||
                         input.match(/find (.+) in my contacts/i) ||
                         input.match(/search for (.+)/i);
      if (queryMatch) {
        const query = queryMatch[1].trim();
        const results = crm.searchContacts(query);
        if (results.length === 0) {
          return `No contacts found matching "${query}". Try "add contact" to add a new one.`;
        }
        const list = results.map(c => `- **${c.name}**${c.company ? ` @ ${c.company}` : ''}${c.email ? ` (${c.email})` : ''}`).join('\n');
        return `Found ${results.length} contact(s) matching "${query}":\n\n${list}`;
      }
      return 'What would you like to search for? Try: "search contacts for John"';
    }

    // Log interaction
    if (/log (a )?interaction/i.test(lower) || /record (a )?interaction/i.test(lower)) {
      const contactMatch = input.match(/with\s+([A-Za-z]+)/i) || input.match(/to\s+([A-Za-z]+)/i);
      const typeMatch = input.match(/\b(meeting|call|email|message|linkedin|event|coffee| lunch| dinner)\b/i);
      const descMatch = input.match(/(?:about|for|re:|saying)[:\s]+(.+)/i);

      if (contactMatch) {
        const name = contactMatch[1];
        const contacts = crm.searchContacts(name);
        if (contacts.length === 0) {
          return `Contact "${name}" not found. Say "add contact: ${name}" to add them first.`;
        }
        const type = typeMatch?.[1] || 'meeting';
        const description = descMatch?.[1] || 'General interaction';

        const interaction = await crm.logInteraction(contacts[0].id, {
          type,
          description,
          notes: input
        });
        return `Logged ${type} with **${contacts[0].name}**: "${description}"`;
      }
      return 'To log an interaction, say: "Log interaction with John about the project proposal"';
    }

    // Set reminder
    if (/set (a )?reminder/i.test(lower) || /follow[ -]?up/i.test(lower)) {
      const contactMatch = input.match(/with\s+([A-Za-z]+)/i) || input.match(/to\s+([A-Za-z]+)/i) || input.match(/for\s+([A-Za-z]+)/i);
      const dateMatch = input.match(/(?:on |at |next |tomorrow |)(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|next week|tomorrow|today|tonight)/i);
      const noteMatch = input.match(/(?:about|to |for )[:\s]+(.+)/i);

      if (contactMatch && dateMatch && noteMatch) {
        const name = contactMatch[1];
        const contacts = crm.searchContacts(name);
        if (contacts.length === 0) {
          return `Contact "${name}" not found. Say "add contact: ${name}" to add them first.`;
        }
        let dateStr = dateMatch[1];
        // Handle relative dates
        if (dateStr.toLowerCase() === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dateStr = d.toISOString().split('T')[0];
        } else if (dateStr.toLowerCase() === 'next week') {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          dateStr = d.toISOString().split('T')[0];
        } else if (dateStr.toLowerCase() === 'tonight') {
          const d = new Date();
          dateStr = d.toISOString().split('T')[0];
        }

        const reminder = await crm.setReminder(contacts[0].id, {
          date: dateStr,
          note: noteMatch[1]
        });
        return `Set reminder for **${contacts[0].name}** on ${dateStr}: "${reminder.note}"`;
      }
      return 'To set a reminder, say: "Set reminder for John next week about the proposal"';
    }

    // Due reminders / Follow-ups
    if (/due reminders/i.test(lower) || /pending reminders/i.test(lower) || /follow[ -]?ups?/i.test(lower) || /show reminders/i.test(lower)) {
      const overdue = crm.getOverdueReminders();
      const dueToday = crm.getDueReminders();
      const pending = crm.getPendingReminders();

      if (overdue.length === 0 && dueToday.length === 0 && pending.length === 0) {
        return 'No pending reminders. You\'re all caught up with your contacts!';
      }

      let response = '';
      if (overdue.length > 0) {
        response += `**Overdue** (${overdue.length}):\n`;
        response += overdue.map(r => `- ${r.contactName}: ${r.note} (due ${r.date})`).join('\n') + '\n\n';
      }
      if (dueToday.length > 0) {
        response += `**Due Today** (${dueToday.length}):\n`;
        response += dueToday.map(r => `- ${r.contactName}: ${r.note}`).join('\n') + '\n\n';
      }
      if (pending.length > 0) {
        response += `**Upcoming** (${pending.length}):\n`;
        response += pending.slice(0, 5).map(r => `- ${r.contactName}: ${r.note} (${r.date})`).join('\n');
        if (pending.length > 5) response += `\n...and ${pending.length - 5} more`;
      }
      return response;
    }

    // CRM stats
    if (/crm stats/i.test(lower) || /contact stats/i.test(lower) || /network stats/i.test(lower)) {
      const stats = crm.getStats();
      return (
        `**Contact Manager Statistics:**\n\n` +
        `- Total Contacts: ${stats.totalContacts}\n` +
        `- Total Interactions: ${stats.totalInteractions}\n` +
        `- Interactions This Month: ${stats.interactionsThisMonth}\n` +
        `- Pending Reminders: ${stats.pendingReminders}\n` +
        `- Overdue Reminders: ${stats.overdueReminders}\n` +
        `- Contacts with Activity: ${stats.contactsWithInteractions}`
      );
    }

    // Default help response
    return (
      `**Contact Manager**\n\n` +
      `Available commands:\n` +
      `- "List my contacts" - Show all contacts\n` +
      `- "Add contact: John, email: john@example.com" - Add new contact\n` +
      `- "Search contacts for John" - Find contacts\n` +
      `- "Log interaction with John about the project" - Record interaction\n` +
      `- "Set reminder for John next week about proposal" - Set follow-up\n` +
      `- "Show due reminders" - View pending follow-ups\n` +
      `- "CRM stats" - View contact statistics`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-02-02',
};
