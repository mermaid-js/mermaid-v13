// Config is resolved once and passed explicitly; no global lookup (R-ARCH-5).
import { getConfig } from '../config.ts';

export const spacing = () => getConfig().flowchart.nodeSpacing;
export const site = (api: { getSiteConfig(): unknown }) => api.getSiteConfig();
