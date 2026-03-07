import { PostHog } from "posthog-node";
import { config } from "../config.js";

export class Analytics {
  private readonly client: PostHog | null;

  constructor() {
    this.client = config.posthogApiKey
      ? new PostHog(config.posthogApiKey, { host: config.posthogHost })
      : null;
  }

  capture(event: string, properties: Record<string, unknown>): void {
    if (!this.client) {
      return;
    }
    this.client.capture({
      distinctId: String(properties.client_id ?? "prototype"),
      event,
      properties,
    });
  }

  async shutdown(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.shutdown();
  }
}
