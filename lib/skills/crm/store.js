/**
 * CRM Store - JSON file persistence layer
 * Extends the base CRM with auto-creation capabilities
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', '.static-rebel', 'data');
const CRM_FILE = path.join(DATA_DIR, 'crm.json');

/**
 * CRM Store singleton
 */
let storeInstance = null;

/**
 * CRM Store class
 * Handles all data persistence for contacts and interactions
 */
export class CRMStore {
  constructor() {
    this.contacts = [];
    this.interactions = [];
    this.reminders = [];
    this.settings = {
      autoCreate: true,
      confirmationRequired: false,
      defaultFollowUpDays: 14,
    };
    this.loaded = false;
  }

  /**
   * Initialize the store (load from disk)
   */
  async init() {
    if (this.loaded) return;

    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await this.load();
      this.loaded = true;
    } catch (error) {
      console.error('[CRMStore] Init error:', error.message);
      this.loaded = true; // Mark as loaded even on error to prevent infinite retries
    }
  }

  /**
   * Load data from disk
   */
  async load() {
    try {
      const data = await fs.readFile(CRM_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      this.contacts = parsed.contacts || [];
      this.interactions = parsed.interactions || [];
      this.reminders = parsed.reminders || [];
      this.settings = { ...this.settings, ...parsed.settings };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[CRMStore] Load error:', error.message);
      }
      // File doesn't exist yet, use defaults
    }
  }

  /**
   * Save data to disk
   */
  async save() {
    try {
      const data = {
        contacts: this.contacts,
        interactions: this.interactions,
        reminders: this.reminders,
        settings: this.settings,
        lastUpdated: new Date().toISOString(),
      };
      await fs.writeFile(CRM_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[CRMStore] Save error:', error.message);
      throw error;
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // ============================================================================
  // Contact Operations
  // ============================================================================

  /**
   * Find a contact by name (case-insensitive, fuzzy matching)
   * @param {string} name - Name to search for
   * @returns {object|null} - Contact or null
   */
  findContactByName(name) {
    const lower = name.toLowerCase().trim();

    // Exact match first
    let contact = this.contacts.find(c => c.name.toLowerCase() === lower);
    if (contact) return contact;

    // Partial match (first name)
    contact = this.contacts.find(c => {
      const firstName = c.name.split(' ')[0].toLowerCase();
      return firstName === lower;
    });
    if (contact) return contact;

    // Contains match
    contact = this.contacts.find(c => c.name.toLowerCase().includes(lower));
    return contact;
  }

  /**
   * Get or create a contact by name
   * @param {string} name - Contact name
   * @param {object} options - Additional contact info
   * @returns {object} - Contact object (existing or new)
   */
  async getOrCreateContact(name, options = {}) {
    let contact = this.findContactByName(name);

    if (!contact) {
      contact = {
        id: this.generateId(),
        name: name.trim(),
        email: options.email || null,
        phone: options.phone || null,
        company: options.company || null,
        source: options.source || 'auto-detected',
        tags: options.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        autoCreated: true,
      };
      this.contacts.push(contact);
      await this.save();
    }

    return contact;
  }

  /**
   * Add a new contact explicitly
   * @param {object} contactData - Contact information
   * @returns {object} - Created contact
   */
  async addContact(contactData) {
    const contact = {
      id: this.generateId(),
      name: contactData.name,
      email: contactData.email || null,
      phone: contactData.phone || null,
      company: contactData.company || null,
      source: contactData.source || 'manual',
      tags: contactData.tags || [],
      notes: contactData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      autoCreated: false,
    };
    this.contacts.push(contact);
    await this.save();
    return contact;
  }

  /**
   * Update a contact
   * @param {string} contactId - Contact ID
   * @param {object} updates - Fields to update
   * @returns {object} - Updated contact
   */
  async updateContact(contactId, updates) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact) throw new Error(`Contact not found: ${contactId}`);

    Object.assign(contact, updates, { updatedAt: new Date().toISOString() });
    await this.save();
    return contact;
  }

  /**
   * Delete a contact and all associated data
   * @param {string} contactId - Contact ID
   * @returns {object} - Deleted contact
   */
  async deleteContact(contactId) {
    const index = this.contacts.findIndex(c => c.id === contactId);
    if (index === -1) throw new Error(`Contact not found: ${contactId}`);

    const contact = this.contacts[index];
    this.contacts.splice(index, 1);
    this.interactions = this.interactions.filter(i => i.contactId !== contactId);
    this.reminders = this.reminders.filter(r => r.contactId !== contactId);

    await this.save();
    return contact;
  }

  /**
   * Get all contacts
   * @returns {array} - All contacts with interaction counts
   */
  getAllContacts() {
    return this.contacts.map(c => ({
      ...c,
      interactionCount: this.interactions.filter(i => i.contactId === c.id).length,
      lastInteraction: this.getLastInteraction(c.id),
    }));
  }

  /**
   * Search contacts
   * @param {string} query - Search query
   * @returns {array} - Matching contacts
   */
  searchContacts(query) {
    const lower = query.toLowerCase();
    return this.contacts.filter(c =>
      c.name.toLowerCase().includes(lower) ||
      (c.email && c.email.toLowerCase().includes(lower)) ||
      (c.company && c.company.toLowerCase().includes(lower)) ||
      (c.tags && c.tags.some(t => t.toLowerCase().includes(lower)))
    );
  }

  // ============================================================================
  // Interaction Operations
  // ============================================================================

  /**
   * Log an interaction
   * @param {string} contactId - Contact ID
   * @param {object} interactionData - Interaction details
   * @returns {object} - Created interaction
   */
  async logInteraction(contactId, interactionData) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact) throw new Error(`Contact not found: ${contactId}`);

    const interaction = {
      id: this.generateId(),
      contactId,
      contactName: contact.name,
      type: interactionData.type || 'general',
      description: interactionData.description || '',
      notes: interactionData.notes || '',
      date: interactionData.date || new Date().toISOString().split('T')[0],
      timestamp: interactionData.timestamp || new Date().toISOString(),
      source: interactionData.source || 'manual',
      autoLogged: interactionData.autoLogged || false,
      originalInput: interactionData.originalInput || null,
    };

    this.interactions.push(interaction);
    await this.save();
    return interaction;
  }

  /**
   * Get interactions for a contact
   * @param {string} contactId - Contact ID
   * @returns {array} - Interactions sorted by date (newest first)
   */
  getInteractions(contactId) {
    return this.interactions
      .filter(i => i.contactId === contactId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get last interaction with a contact
   * @param {string} contactId - Contact ID
   * @returns {object|null} - Last interaction or null
   */
  getLastInteraction(contactId) {
    const interactions = this.getInteractions(contactId);
    return interactions.length > 0 ? interactions[0] : null;
  }

  /**
   * Get all interactions (for all contacts)
   * @param {object} options - Filter options
   * @returns {array} - Interactions
   */
  getAllInteractions(options = {}) {
    let interactions = [...this.interactions];

    // Filter by date range
    if (options.since) {
      const since = new Date(options.since);
      interactions = interactions.filter(i => new Date(i.timestamp) >= since);
    }

    if (options.until) {
      const until = new Date(options.until);
      interactions = interactions.filter(i => new Date(i.timestamp) <= until);
    }

    // Filter by type
    if (options.type) {
      interactions = interactions.filter(i => i.type === options.type);
    }

    // Sort by date
    interactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit results
    if (options.limit) {
      interactions = interactions.slice(0, options.limit);
    }

    return interactions;
  }

  /**
   * Get recent interactions
   * @param {number} days - Number of days to look back
   * @param {number} limit - Max number of results
   * @returns {array} - Recent interactions
   */
  getRecentInteractions(days = 7, limit = 20) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.getAllInteractions({ since: since.toISOString(), limit });
  }

  // ============================================================================
  // Reminder Operations
  // ============================================================================

  /**
   * Set a reminder for a contact
   * @param {string} contactId - Contact ID
   * @param {object} reminderData - Reminder details
   * @returns {object} - Created reminder
   */
  async setReminder(contactId, reminderData) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact) throw new Error(`Contact not found: ${contactId}`);

    const reminder = {
      id: this.generateId(),
      contactId,
      contactName: contact.name,
      date: reminderData.date,
      note: reminderData.note || `Follow up with ${contact.name}`,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    this.reminders.push(reminder);
    await this.save();
    return reminder;
  }

  /**
   * Get due reminders (today and overdue)
   * @returns {object} - { today: [], overdue: [] }
   */
  getDueReminders() {
    const today = new Date().toISOString().split('T')[0];

    const overdue = this.reminders.filter(r => !r.completed && r.date < today);
    const dueToday = this.reminders.filter(r => !r.completed && r.date === today);
    const upcoming = this.reminders.filter(r => !r.completed && r.date > today);

    return {
      today: dueToday,
      overdue,
      upcoming: upcoming.slice(0, 10),
    };
  }

  /**
   * Complete a reminder
   * @param {string} reminderId - Reminder ID
   * @returns {object} - Updated reminder
   */
  async completeReminder(reminderId) {
    const reminder = this.reminders.find(r => r.id === reminderId);
    if (!reminder) throw new Error(`Reminder not found: ${reminderId}`);

    reminder.completed = true;
    reminder.completedAt = new Date().toISOString();
    await this.save();
    return reminder;
  }

  // ============================================================================
  // Stats and Utilities
  // ============================================================================

  /**
   * Get CRM statistics
   * @returns {object} - Stats summary
   */
  getStats() {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const interactionsThisMonth = this.interactions.filter(
      i => i.timestamp.startsWith(thisMonth)
    ).length;

    const interactionsLastWeek = this.interactions.filter(
      i => new Date(i.timestamp) >= lastWeek
    ).length;

    const reminders = this.getDueReminders();

    return {
      totalContacts: this.contacts.length,
      autoCreatedContacts: this.contacts.filter(c => c.autoCreated).length,
      totalInteractions: this.interactions.length,
      interactionsThisMonth,
      interactionsLastWeek,
      autoLoggedInteractions: this.interactions.filter(i => i.autoLogged).length,
      pendingReminders: reminders.today.length + reminders.overdue.length,
      overdueReminders: reminders.overdue.length,
      uniqueContactsInteracted: new Set(this.interactions.map(i => i.contactId)).size,
    };
  }

  /**
   * Get contacts you haven't interacted with in a while
   * @param {number} days - Days threshold
   * @returns {array} - Contacts needing attention
   */
  getContactsNeedingAttention(days = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);

    return this.contacts
      .map(c => {
        const lastInteraction = this.getLastInteraction(c.id);
        return {
          ...c,
          lastInteraction,
          daysSinceContact: lastInteraction
            ? Math.floor((Date.now() - new Date(lastInteraction.timestamp)) / (1000 * 60 * 60 * 24))
            : null,
        };
      })
      .filter(c => {
        if (!c.lastInteraction) return true; // Never interacted
        return new Date(c.lastInteraction.timestamp) < threshold;
      })
      .sort((a, b) => (a.daysSinceContact || 999) - (b.daysSinceContact || 999));
  }
}

/**
 * Get the CRM store singleton
 * @returns {Promise<CRMStore>} - Store instance
 */
export async function getStore() {
  if (!storeInstance) {
    storeInstance = new CRMStore();
    await storeInstance.init();
  }
  return storeInstance;
}

export default { CRMStore, getStore };
