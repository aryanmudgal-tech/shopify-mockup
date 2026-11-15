import { describe, expect, it } from "vitest";
import { htmlToText, readRefundPolicy } from "./policy";
import { RecordedTransport } from "./ucp/recorded";

describe("htmlToText", () => {
  it("keeps one line per block and joins inline tags without losing spaces", () => {
    const html = `<html><head><title>Refund policy</title><script>var x = "<p>no</p>";</script></head>
      <body><h4>Returns</h4><p>We offer a<span> </span><strong>30-day return policy</strong>.</p>
      <table><tr><td>Return reason</td><td>Note</td></tr></table><p>Fees&nbsp;are &amp; aren&rsquo;t &#8220;fair&#x201D;</p></body></html>`;
    expect(htmlToText(html)).toBe("Returns\nWe offer a 30-day return policy.\nReturn reason\nNote\nFees are & aren’t “fair”");
  });
});

describe("readRefundPolicy", () => {
  it("reads Burrow's recorded policy page", async () => {
    const policy = await readRefundPolicy(new RecordedTransport(), "https://checkout.shopify.com/93232202030/policies/45564592430.html");
    expect(policy.status).toBe("read");
    if (policy.status === "read") expect(policy.text).toContain("The fee is always capped at $250, per returned item.");
  });

  it("reports a missing link or an unreadable page instead of throwing", async () => {
    expect(await readRefundPolicy(new RecordedTransport(), null)).toMatchObject({ status: "failed" });
    expect(await readRefundPolicy(new RecordedTransport(), "https://example.com/policy")).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("No recorded response"),
    });
  });
});
