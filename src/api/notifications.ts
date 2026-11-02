import { http } from "./client";
import type { McpSettings, NotificationsSettings } from "./types";

export function get(): Promise<NotificationsSettings> {
  return http.get("/notifications");
}

/** Replace the notification settings; live at once and persisted. */
export function put(body: NotificationsSettings): Promise<{ status: string }> {
  return http.put("/notifications", body);
}

/** Send a test event — to the given target when it has a webhook (checked
 *  before saving), else to the saved one. Rejects with the receiver's error. */
export function test(target?: NotificationsSettings): Promise<{ status: string }> {
  return http.post(
    "/notifications/test",
    target?.webhook
      ? { webhook: target.webhook, format: target.format, chat_id: target.chat_id }
      : {},
  );
}

/** Whether the MCP endpoint is on and may change things. */
export function getMcp(): Promise<McpSettings> {
  return http.get("/settings/mcp");
}

export function putMcp(body: McpSettings): Promise<{ status: string }> {
  return http.put("/settings/mcp", body);
}
