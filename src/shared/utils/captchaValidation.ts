/**
 * Captcha Validation Utility
 *
 * Currently implements Cloudflare Turnstile validation.
 * Can be extended to support other providers in the future.
 */

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Validate a captcha token
 * @param token The token string to validate
 * @param ip Optional IP address of the user for better validation
 */
export const validateCaptchaToken = async (token?: string, ip?: string): Promise<boolean> => {
  // If no secret key is configured, fail securely or warn in dev
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ?? '1x0000000000000000000000000000000AA';

  if (!secretKey) {
    console.warn('⚠️  CLOUDFLARE_TURNSTILE_SECRET_KEY is not set. Captcha validation will fail.');
    return false;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome = await result.json() as TurnstileVerifyResponse;

    if (!outcome.success) {
      console.warn('Captcha validation failed:', outcome['error-codes']);
    }

    return outcome.success;
  } catch (error) {
    console.error('Error validating captcha token:', error);
    return false;
  }
};
