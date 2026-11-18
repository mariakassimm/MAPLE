import { createHash } from 'crypto';

/**
 * Cloudinary upload signature: sort the parameters by name, write them as key=value joined with "&", append the API
 * secret, SHA-1 and hex-encode. file, cloud_name, resource_type and api_key are never signed.
 * Verified in tests against the worked example in Cloudinary's documentation.
 */
export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter(
      (k) =>
        !['file', 'cloud_name', 'resource_type', 'api_key'].includes(k) && params[k] !== '' && params[k] !== undefined,
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');
}
