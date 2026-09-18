// Where feedback goes. The key is a publishable one: the database lets it add a row and upload a screenshot, and lets it read nothing.
// HATCH_FEEDBACK_URL points the tests at a stand-in service.
export const feedbackUrl = (): string => process.env.HATCH_FEEDBACK_URL || 'https://zxyexylnnnojprmmdhzz.supabase.co';
export const FEEDBACK_KEY = 'sb_publishable_ft-eUqQ10ir2Dx8ycl0j2Q_xhbPfjIy';
export const SCREENSHOT_BUCKET = 'feedback-screenshots';
