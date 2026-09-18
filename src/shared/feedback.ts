export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Attach the capture Hatch took when the form opened. */
  screenshot: boolean;
}

/** What Hatch adds to every piece of feedback. The form shows both before the user sends. */
export interface FeedbackDetails {
  appVersion: string;
  osVersion: string;
}
