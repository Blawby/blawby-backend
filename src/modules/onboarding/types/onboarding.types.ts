export type StripeConnectedAccountBase = {
  practice_uuid: string;
  stripe_account_id: string;
  client_secret?: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};
