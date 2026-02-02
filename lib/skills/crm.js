import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', '.static-rebel', 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

let crmInstance = null;

/**
 * Get the CRM singleton instance
 */
export async function getCRM() {
  if (!crmInstance) {
    crmInstance = new CRM();
    await crmInstance.init();
  }
  return crmInstance;
}

/**
 * CRM (Contact Relationship Management) System
 * Manages contacts, interactions, and reminders
 */
export class CRM {
  constructor() {
    this.contacts = [];
    this.interactions = [];
    this.reminders = [];
  }

  /**
   * Initialize the CRM system
   */
  async init() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await this.loadData();
    } catch (error) {
      console.error('CRM init error:', error);
    }
  }

  /**
   * Load all data from disk
   */
  async loadData() {
    try {
      const data = await fs.readFile(CONTACTS_FILE, 'utf-8').catch(() => '{}');
      const parsed = JSON.parse(data);
      this.contacts = parsed.contacts || [];
      this.interactions = parsed.interactions || [];
      this.reminders = parsed.reminders || [];
    } catch (error) {
      console.error('Error loading CRM data:', error);
      this.contacts = [];
      this.interactions = [];
      this.reminders = [];
    }
  }

  /**
   * Save all data to disk
   */
  async saveData() {
    try {
      const data = {
        contacts: this.contacts,
        interactions: this.interactions,
        reminders: this.reminders
      };
      await fs.writeFile(CONTACTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving CRM data:', error);
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get all contacts
   */
  getAllContacts() {
    return this.contacts.map(c => ({
      ...c,
      interactionCount: this.interactions.filter(i => i.contactId === c.id).length
    }));
  }

  /**
   * Add a new contact
   */
  async addContact({ name, email, phone, company, source = 'manual', tags = [] }) {
    const contact = {
      id: this.generateId(),
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      source,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.contacts.push(contact);
    await this.saveData();
    return contact;
  }

  /**
   * Search contacts by query
   */
  searchContacts(query) {
    const lowerQuery = query.toLowerCase();
    return this.contacts.filter(c =>
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.email && c.email.toLowerCase().includes(lowerQuery)) ||
      (c.company && c.company.toLowerCase().includes(lowerQuery)) ||
      (c.tags && c.tags.some(t => t.toLowerCase().includes(lowerQuery)))
    );
  }

  /**
   * Get a contact by ID
   */
  getContactById(id) {
    return this.contacts.find(c => c.id === id);
  }

  /**
   * Log an interaction with a contact
   */
  async logInteraction(contactId, { type, description, notes = '' }) {
    const contact = this.getContactById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const interaction = {
      id: this.generateId(),
      contactId,
      contactName: contact.name,
      type,
      description,
      notes,
      timestamp: new Date().toISOString()
    };

    this.interactions.push(interaction);
    await this.saveData();
    return interaction;
  }

  /**
   * Get interactions for a contact
   */
  getInteractions(contactId) {
    return this.interactions
      .filter(i => i.contactId === contactId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Set a reminder for a contact
   */
  async setReminder(contactId, { date, note }) {
    const contact = this.getContactById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const reminder = {
      id: this.generateId(),
      contactId,
      contactName: contact.name,
      date,
      note,
      completed: false,
      createdAt: new Date().toISOString()
    };

    this.reminders.push(reminder);
    await this.saveData();
    return reminder;
  }

  /**
   * Get reminders that are overdue
   */
  getOverdueReminders() {
    const today = new Date().toISOString().split('T')[0];
    return this.reminders
      .filter(r => !r.completed && r.date < today)
      .map(r => ({
        ...r,
        contactName: this.getContactById(r.contactId)?.name || 'Unknown'
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get reminders due today
   */
  getDueReminders() {
    const today = new Date().toISOString().split('T')[0];
    return this.reminders
      .filter(r => !r.completed && r.date === today)
      .map(r => ({
        ...r,
        contactName: this.getContactById(r.contactId)?.name || 'Unknown'
      }));
  }

  /**
   * Get pending reminders (not completed, not overdue)
   */
  getPendingReminders() {
    const today = new Date().toISOString().split('T')[0];
    return this.reminders
      .filter(r => !r.completed && r.date > today)
      .map(r => ({
        ...r,
        contactName: this.getContactById(r.contactId)?.name || 'Unknown'
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Complete a reminder
   */
  async completeReminder(reminderId) {
    const reminder = this.reminders.find(r => r.id === reminderId);
    if (!reminder) {
      throw new Error(`Reminder not found: ${reminderId}`);
    }
    reminder.completed = true;
    reminder.completedAt = new Date().toISOString();
    await this.saveData();
    return reminder;
  }

  /**
   * Get CRM statistics
   */
  getStats() {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7); // YYYY-MM

    const interactionsThisMonth = this.interactions.filter(
      i => i.timestamp.startsWith(thisMonth)
    ).length;

    return {
      totalContacts: this.contacts.length,
      totalInteractions: this.interactions.length,
      interactionsThisMonth,
      pendingReminders: this.getPendingReminders().length,
      overdueReminders: this.getOverdueReminders().length,
      contactsWithInteractions: new Set(
        this.interactions.map(i => i.contactId)
      ).size
    };
  }

  /**
   * Delete a contact and all associated data
   */
  async deleteContact(contactId) {
    const index = this.contacts.findIndex(c => c.id === contactId);
    if (index === -1) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const contact = this.contacts[index];
    this.contacts.splice(index, 1);

    // Remove associated interactions and reminders
    this.interactions = this.interactions.filter(i => i.contactId !== contactId);
    this.reminders = this.reminders.filter(r => r.contactId !== contactId);

    await this.saveData();
    return contact;
  }

  /**
   * Update a contact
   */
  async updateContact(contactId, updates) {
    const contact = this.getContactById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    Object.assign(contact, updates, { updatedAt: new Date().toISOString() });
    await this.saveData();
    return contact;
  }
}

export default { getCRM, CRM };
