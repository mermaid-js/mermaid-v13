/**
 * v12's detector (`afDetector.ts:10`), on the text the pipeline hands `detector` (front matter,
 * directives and comments already removed). Shared by the plugin and the language facet.
 */
const AGENTFLOW_DETECT = /^\s*agentflow-beta\b/;

/** Whether `text` is an agentflow (v12's detector). */
export const detectAgentflow = (text: string): boolean => AGENTFLOW_DETECT.test(text);
