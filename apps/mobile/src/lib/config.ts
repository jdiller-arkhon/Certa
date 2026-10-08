/**
 * API origin. Set EXPO_PUBLIC_API_URL to the same origin as PUBLIC_URL on the server
 * (e.g. https://certa.example.com, or http://<your-lan-ip>:8080 in development).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
