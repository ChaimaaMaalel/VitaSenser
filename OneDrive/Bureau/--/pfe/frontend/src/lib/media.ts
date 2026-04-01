const getBackendOrigin = () => {
  const configuredBackendOrigin = (import.meta as any).env?.VITE_BACKEND_ORIGIN as string | undefined;
  if (configuredBackendOrigin && /^https?:\/\//i.test(configuredBackendOrigin)) {
    return configuredBackendOrigin.replace(/\/+$/, '');
  }

  const configuredApiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (configuredApiUrl && /^https?:\/\//i.test(configuredApiUrl)) {
    try {
      return new URL(configuredApiUrl).origin;
    } catch {
      // Ignore malformed URL and fallback below.
    }
  }

  return 'http://localhost:5000';
};

export const resolveMediaUrl = (filePath?: string) => {
  if (!filePath) return '';

  const normalizedPath = filePath.replace(/\\/g, '/');
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  const backendOrigin = getBackendOrigin();
  const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${backendOrigin}${absolutePath}`;
};
