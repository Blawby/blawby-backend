/**
 * Magic Link Email Template
 */

import { type MagicLinkData } from '@/shared/services/email/email.types';

export const magicLinkTemplate = (data: MagicLinkData): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Blawby</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f9fafb;
    }
    .wrapper {
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .header {
      padding: 32px 40px 0;
      text-align: center;
    }
    .content {
      padding: 32px 40px;
    }
    .footer {
      padding: 24px 40px;
      background: #f8fafc;
      text-align: center;
      font-size: 14px;
      color: #64748b;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 24px 0;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 16px;
    }
    p {
      margin: 0 0 16px;
    }
    .link-alt {
      font-size: 12px;
      color: #94a3b8;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="https://blawby.com/logo.png" alt="Blawby" width="120" style="margin-bottom: 24px;">
      </div>
      <div class="content">
        <h1>Sign in to Blawby</h1>
        <p>Click the button below to sign in to your account. This link will expire shortly for security.</p>
        
        <div style="text-align: center;">
          <a href="${data.url}" class="button">Sign In to Blawby</a>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p class="link-alt">${data.url}</p>
        
        <p>If you didn't request this email, you can safely ignore it.</p>
      </div>
      <div class="footer">
        &copy; ${data.year} Blawby. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`;
