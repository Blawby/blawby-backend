import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users, sessions } from '@/schema/better-auth-schema';

export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret'),
  disabled: boolean('disabled').default(false),
  skipConsent: boolean('skip_consent').default(false),
  enableEndSession: boolean('enable_end_session').default(false),
  subjectType: text('subject_type'),
  scopes: text('scopes').array(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  name: text('name'),
  uri: text('uri'),
  icon: text('icon'),
  contacts: text('contacts').array(),
  tos: text('tos'),
  policy: text('policy'),
  softwareId: text('software_id'),
  softwareVersion: text('software_version'),
  softwareStatement: text('software_statement'),
  redirectUris: text('redirect_uris').array().notNull(),
  postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
  grantTypes: text('grant_types').array(),
  responseTypes: text('response_types').array(),
  public: boolean('public'),
  type: text('type'),
  requirePKCE: boolean('require_pkce').default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  refreshId: uuid('refresh_id').references(() => oauthRefreshTokens.id),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  scopes: text('scopes').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  scopes: text('scopes').array().notNull(),
  revoked: timestamp('revoked', { withTimezone: true }),
  authTime: timestamp('auth_time', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const oauthConsents = pgTable('oauth_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId),
  referenceId: text('reference_id'),
  scopes: text('scopes').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
