/**
 * Auth Worker Client
 *
 * Calls the separate Cloudflare Auth Worker for session validation
 * in a microservices architecture.
 */

export const getAuthWorkerUrl = (): string => {
  return process.env.AUTH_WORKER_URL || 'http://localhost:8787';
};

/**
 * Validate session with auth worker
 */
export const validateSessionWithAuthWorker = async (
  cookieHeader: string | undefined,
  authToken: string | undefined,
): Promise<{
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
  };
  session: {
    id: string;
    expiresAt: Date;
    activeOrganizationId?: string;
  };
} | null> => {
  const authWorkerUrl = getAuthWorkerUrl();

  try {
    const headers: Record<string, string> = {};

    // Add cookies if present
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }

    // Add bearer token if present
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${authWorkerUrl}/api/auth/get-session`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data?.user) {
      return null;
    }

    return {
      user: data.user,
      session: data.session,
    };
  } catch (error) {
    console.error('Auth worker error:', error);
    return null;
  }
};

