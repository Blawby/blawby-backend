import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { AppContext } from '@/shared/types/hono';

const http = new Hono<AppContext>();

const EMAILS_DIR = path.join(process.cwd(), 'storage', 'emails');

/**
 * List all saved emails
 */
http.get('/emails', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not available in production' }, 403);
  }

  if (!fs.existsSync(EMAILS_DIR)) {
    return c.html(`
      <div style="font-family: sans-serif; padding: 20px;">
        <h1>Email Previewer</h1>
        <p>No emails have been sent yet. Trigger an email to see it here.</p>
      </div>
    `);
  }

  const files = fs.readdirSync(EMAILS_DIR)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .reverse();

  const listItems = files.map((f) => {
    const filePath = path.join(EMAILS_DIR, f);
    const stat = fs.statSync(filePath);
    return `
      <li style="margin-bottom: 10px; border: 1px solid #ddd; padding: 10px; border-radius: 4px; list-style: none;">
        <a href="/api/dev/emails/${f}" style="text-decoration: none; color: #007bff; font-weight: bold;">
          ${f}
        </a>
        <div style="color: #666; font-size: 0.8em; margin-top: 5px;">
          Saved at: ${stat.mtime.toLocaleString()}
        </div>
      </li>
    `;
  }).join('');

  return c.html(`
    <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">Local Email Mailbox</h1>
      <ul style="padding: 0;">
        ${listItems || '<li>No emails found.</li>'}
      </ul>
    </div>
  `);
});

/**
 * View a specific email
 */
http.get('/emails/:filename', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not available in production' }, 403);
  }

  const filename = c.req.param('filename');
  const sanitizedFilename = path.basename(filename);

  if (!sanitizedFilename.endsWith('.html')) {
    return c.json({ error: 'Email not found' }, 404);
  }

  const filePath = path.resolve(EMAILS_DIR, sanitizedFilename);

  // Ensure the resolved path is still within EMAILS_DIR
  if (!filePath.startsWith(EMAILS_DIR) || !fs.existsSync(filePath)) {
    return c.json({ error: 'Email not found' }, 404);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return c.html(content);
});

export default http;
