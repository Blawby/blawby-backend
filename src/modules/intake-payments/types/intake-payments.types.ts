export interface OrganizationIntakeSettings {
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

export interface CreateIntakePaymentRequest {
  slug: string;
  amount: number;
  email: string;
  name: string;
  phone?: string;
  onBehalfOf?: string;
  description?: string;
  customerIp?: string;
  userAgent?: string;
}

export interface CreateIntakePaymentResponse {
  success: boolean;
  data?: {
    ulid: string;
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

export interface UpdateIntakePaymentRequest {
  amount: number;
}

export interface UpdateIntakePaymentResponse {
  success: boolean;
  data?: {
    ulid: string;
    clientSecret: string;
    amount: number;
    currency: string;
    status: string;
  };
  error?: string;
}

export interface IntakePaymentStatus {
  success: boolean;
  data?: {
    ulid: string;
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

export interface IntakePaymentStats {
  totalAmount: number;
  count: number;
  succeededCount: number;
}
