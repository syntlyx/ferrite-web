import { http } from "./client";
import type { McpSettings, NotificationsSettings } from "./types";

export function get(): Promise<NotificationsSettings> {
  return http.get("/notifications");
}

/** Replace the notification settings; live at once and persisted. */
export function put(body: NotificationsSettings): Promise<{ status: string }> {
  return http.put("/notifications", body);
}

/** Send a test event — to `webhook` when given (checked before saving), else
 *  to the saved one. Rejects with the receiver's error when it fails. */
export function test(webhook?: string): Promise<{ status: string }> {
  return http.post("/notifications/test", webhook ? { webhook } : {});
}

/** Whether the MCP endpoint is on and may change things. */
export function getMcp(): Promise<McpSettings> {
  return http.get("/settings/mcp");
}

export function putMcp(body: McpSettings): Promise<{ status: string }> {
  return http.put("/settings/mcp", body);
}
