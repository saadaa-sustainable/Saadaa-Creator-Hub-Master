import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({ ok: true })),
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({ insert: mocks.insert }),
  }),
}));

import { sendNotification } from "@/lib/notifications";

describe("sendNotification BCC", () => {
  beforeEach(() => {
    mocks.sendMail.mockClear();
    mocks.insert.mockClear();
  });

  it("keeps BCC hidden, de-duplicated, and separate from To", async () => {
    await sendNotification({
      type: "delivery_reminder",
      to: "Creator@Example.com",
      bcc: ["creator@example.com", "Owner@example.com", "owner@example.com"],
      subject: "EDD reminder",
      htmlBody: "Reminder",
    });

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "creator@example.com",
        bcc: ["owner@example.com"],
      }),
    );
  });
});
