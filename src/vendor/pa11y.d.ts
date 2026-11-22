// pa11y ships no types and @types/pa11y trails pa11y 10; this declares only what engines/pa11y.ts calls.
declare module "pa11y" {
  interface Pa11yIssue {
    code: string;
    type: string;
    message: string;
    selector: string;
    context?: string;
  }
  const pa11y: (url: string, options?: Record<string, unknown>) => Promise<{ issues: Pa11yIssue[] }>;
  export default pa11y;
}
