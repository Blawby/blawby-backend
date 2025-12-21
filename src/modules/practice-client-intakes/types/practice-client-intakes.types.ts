export interface PracticeClientIntakeSettings {
  success: boolean;
  data?: {
    organization: {
      id: string;
      name: string;
      slug: string;
      logo?: string;
    };
    settings: {
      paymentLinkEnabled: boolean;
      prefillAmount: number; // in cents
    };
    connectedAccount: {
      id: string;
      chargesEnabled: boolean;
    };
  };
  error?: string;
}

export interface CreatePracticeClientIntakeRequest {
  slug: string;
  amount: number;
  email: string;
  name: string;
  phone?: string;
  onBehalfOf?: string;
  description?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface CreatePracticeClientIntakeResponse {
  success: boolean;
  data?: {
    uuid: string;
    clientSecret: string;
    amount: number;
    currency: string;
    status: string;
    organization: {
      name: string;
      logo?: string;
    };
  };
  error?: string;
}

export interface UpdatePracticeClientIntakeRequest {
  amount: number;
}

export interface UpdatePracticeClientIntakeResponse {
  success: boolean;
  data?: {
    uuid: string;
    clientSecret: string;
    amount: number;
    currency: string;
    status: string;
  };
  error?: string;
}

export interface PracticeClientIntakeStatus {
  success: boolean;
  data?: {
    uuid: string;
    amount: number;
    currency: string;
    status: string;
    stripeChargeId?: string;
    metadata: {
      email: string;
      name: string;
      phone?: string;
      onBehalfOf?: string;
      description?: string;
    };
    succeededAt?: Date;
    createdAt: Date;
  };
  error?: string;
}

export interface PracticeClientIntakeStats {
  totalAmount: number;
  count: number;
  succeededCount: number;
}
